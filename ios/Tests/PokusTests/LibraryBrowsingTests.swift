import Foundation
import PokusCore
import PokusNetworking
import Testing

private struct SegmentRow: Codable, Identifiable, Sendable {
    let id: String
}

private actor SegmentServer {
    let counts: [Int]
    var delayed: Set<Int>
    var failures: Set<Int>
    var requests: [(segment: Int, page: Int)] = []
    var active = 0
    var maximumActive = 0

    init(counts: [Int], failures: Set<Int> = [], delayed: Set<Int> = []) {
        self.counts = counts; self.failures = failures; self.delayed = delayed
    }
    func clearDelays() { delayed = [] }

    func respond(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
        let segment = Int(query.first { $0.name == "filter" }!.value!)!
        let page = Int(query.first { $0.name == "page" }!.value!)!
        let perPage = Int(query.first { $0.name == "perPage" }!.value!)!
        requests.append((segment, page)); active += 1; maximumActive = max(maximumActive, active)
        defer { active -= 1 }
        try await Task.sleep(for: delayed.contains(segment) ? .seconds(2) : .milliseconds(20))
        if failures.remove(segment) != nil { throw URLError(.networkConnectionLost) }
        let start = min((page - 1) * perPage, counts[segment]), end = min(start + perPage, counts[segment])
        let rows = (start..<end).map { SegmentRow(id: "\(segment)-\($0)") }
        let data = try JSONSerialization.data(withJSONObject: [
            "items": rows.map { ["id": $0.id] }, "page": page, "perPage": perPage,
            "totalItems": counts[segment], "totalPages": (counts[segment] + perPage - 1) / perPage
        ])
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
}

@Suite struct LibraryBrowsingTests {
    @Test func segmentFirstPagesLoadConcurrentlyWithinFourRequestWindow() async throws {
        let server = SegmentServer(counts: Array(repeating: 8, count: 10))
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        let query = RecordQuery<SegmentRow>("rows", segments: (0..<10).map { RecordSegment(filter: String($0)) })
        let reader = RecordReader(api: api, query: query)
        var ids: [String] = [], sizes: [Int] = []
        while true {
            let batch = try await reader.next()
            ids += batch.items.map(\.id); sizes.append(batch.items.count)
            let repeated = try await reader.next()
            #expect(repeated.items.map(\.id) == batch.items.map(\.id))
            await reader.accept()
            if !batch.hasMore { break }
        }
        #expect(ids == (0..<10).flatMap { segment in (0..<8).map { "\(segment)-\($0)" } })
        #expect(sizes == [25, 25, 25, 5])
        #expect(await server.maximumActive == 4)
        let requests = await server.requests
        #expect(requests.count == 10)
        #expect(requests.allSatisfy { $0.page == 1 })
    }

    @Test func segmentPrefetchDoesNotScanLaterPages() async throws {
        let server = SegmentServer(counts: [60, 30, 30, 30, 30])
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        let query = RecordQuery<SegmentRow>("rows", segments: (0..<5).map { RecordSegment(filter: String($0)) })
        let reader = RecordReader(api: api, query: query)
        let first = try await reader.next()
        #expect(first.items.map(\.id) == (0..<25).map { "0-\($0)" })
        #expect(first.hasMore)
        let initial = await server.requests
        #expect(initial.count == 4)
        #expect(initial.allSatisfy { $0.page == 1 && $0.segment < 4 })
        await reader.accept()
        let second = try await reader.next()
        #expect(second.items.map(\.id) == (25..<50).map { "0-\($0)" })
        let appended = await server.requests
        #expect(appended.count == 5)
        #expect(appended.last?.segment == 0 && appended.last?.page == 2)
    }

    @Test func slowFutureSegmentDoesNotDelayAvailableFirstBatch() async throws {
        let server = SegmentServer(counts: [25, 25, 25, 25], delayed: [1, 2, 3])
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        let query = RecordQuery<SegmentRow>("rows", segments: (0..<4).map { RecordSegment(filter: String($0)) })
        let reader = RecordReader(api: api, query: query)
        let clock = ContinuousClock(), start = clock.now
        let first = try await reader.next()
        #expect(first.items.map(\.id) == (0..<25).map { "0-\($0)" })
        #expect(start.duration(to: clock.now) < .seconds(1))
        #expect(await server.requests.count == 4)
    }

    @Test func cancellingBatchCancelsPrefetchAndKeepsCursorForRetry() async throws {
        let server = SegmentServer(counts: [10, 10, 10, 10], delayed: [0, 1, 2, 3])
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        let query = RecordQuery<SegmentRow>("rows", segments: (0..<4).map { RecordSegment(filter: String($0)) })
        let reader = RecordReader(api: api, query: query)
        let load = Task { try await reader.next() }
        for _ in 0..<200 {
            if await server.requests.count == 4 { break }
            try await Task.sleep(for: .milliseconds(1))
        }
        #expect(await server.requests.count == 4)
        load.cancel()
        await #expect(throws: CancellationError.self) { _ = try await load.value }
        for _ in 0..<200 {
            if await server.active == 0 { break }
            try await Task.sleep(for: .milliseconds(1))
        }
        #expect(await server.active == 0)
        await server.clearDelays()
        let retry = try await reader.next()
        #expect(retry.items.map(\.id) == Array((0..<4).flatMap { segment in (0..<10).map { "\(segment)-\($0)" } }.prefix(25)))
        #expect(await server.requests.count == 8)
    }

    @Test func failedSegmentRetriesWithoutSkippingEarlierRows() async throws {
        let server = SegmentServer(counts: [10, 10, 10, 10], failures: [2])
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        let query = RecordQuery<SegmentRow>("rows", segments: (0..<4).map { RecordSegment(filter: String($0)) })
        let reader = RecordReader(api: api, query: query)
        await #expect(throws: URLError.self) { _ = try await reader.next() }
        let first = try await reader.next()
        #expect(first.items.count == 25)
        await reader.accept()
        let second = try await reader.next()
        #expect(!second.hasMore)
        #expect((first.items + second.items).map(\.id) == (0..<4).flatMap { segment in (0..<10).map { "\(segment)-\($0)" } })
        let requests = await server.requests
        #expect(requests.filter { $0.segment == 2 }.count == 2)
        #expect(requests.filter { $0.segment != 2 }.count == 3)
    }

    @Test func unusedLaterSegmentFailureDoesNotFailCurrentBatch() async throws {
        let server = SegmentServer(counts: [25, 1], failures: [1])
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        let query = RecordQuery<SegmentRow>("rows", segments: (0..<2).map { RecordSegment(filter: String($0)) })
        let reader = RecordReader(api: api, query: query)
        let first = try await reader.next()
        #expect(first.items.count == 25)
        await reader.accept()
        await #expect(throws: URLError.self) { _ = try await reader.next() }
        let retry = try await reader.next()
        #expect(retry.items.map(\.id) == ["1-0"])
        #expect(!retry.hasMore)
    }

    @Test func searchFindsRenderedHTMLAndUnicodeWithoutMatchingMarkup() {
        #expect(LibrarySearch.matches(["A useful source", "<p>Café &amp; ideas</p>"], query: " cafe "))
        #expect(LibrarySearch.matches(["A useful source", "<p>Café &amp; ideas</p>"], query: "& ideas"))
        #expect(!LibrarySearch.matches(["<strong>Learning</strong>"], query: "strong"))
        #expect(!LibrarySearch.matches(["Learning"], query: "different"))
        #expect(LibrarySearch.matches(["Learning"], query: "  "))
    }
    @Test func filterDefaultsAndPlainLanguageKeepWireSemantics() {
        var captures = CaptureFilter(); captures.stage = .inProgress; captures.kind = .book
        #expect(captures.isActive)
        #expect(captures.stage.rawValue == "in_progress")
        captures = CaptureFilter()
        #expect(!captures.isActive && captures.kind == nil && captures.stage == .all)
        var notes = NoteFilter(); notes.review = .scheduled; notes.category = "category1"
        #expect(notes.isActive && notes.review.status == "evergreen")
        notes.review = .unscheduled
        #expect(notes.review.status == "draft")
        notes = NoteFilter()
        #expect(!notes.isActive && notes.review.status == "all" && notes.category.isEmpty)
    }
    @Test func reviewQueueFreezesMembershipAndCountsConfirmedResponsesOnly() {
        var session = LibraryReviewSession(noteIDs: ["first", "second", "first"])
        #expect(session.totalCount == 2 && session.reviewedCount == 0)
        #expect(session.nextID() == "first")
        // An unsuccessful save leaves the queue unchanged.
        #expect(session.nextID() == "first" && session.reviewedCount == 0)
        session.confirm("first"); session.confirm("first"); session.confirm("newlyDue")
        #expect(session.reviewedCount == 1 && session.totalCount == 2)
        #expect(session.nextID() == "second")
        session.confirm("second")
        #expect(session.nextID() == nil && session.reviewedCount == 2)
    }
    @Test func skippedReviewRecordsDoNotCountAsConfirmedResponses() {
        let session = LibraryReviewSession(noteIDs: ["deleted", "unscheduled", "due"])
        #expect(session.nextID(skipping: ["deleted", "unscheduled"]) == "due")
        #expect(session.nextID(skipping: ["deleted", "unscheduled", "due"]) == nil)
        #expect(session.reviewedCount == 0 && session.totalCount == 3)
    }
}
