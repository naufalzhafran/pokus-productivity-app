import DailyCore
import Foundation
import PokusCore
import Testing
@testable import PokusNetworking

/// A small PocketBase stand-in with real `updated` timestamps, cascades, and batches.
private actor FakePocketBase {
    private(set) var tables: RecordTables = [:]
    private(set) var writes: [String] = []
    private var clock = Date(timeIntervalSince1970: 1_790_000_000)
    var offline = false
    private var loseNextWrite = false
    private var rejected: String?

    func seed(_ collection: String, _ rows: [[String: JSONValue]]) {
        for var row in rows {
            guard case .string(let id)? = row["id"] else { continue }
            var record = RecordSchema.emptyRecord(collection)
            RecordReplica.assign(row, to: &record)
            row = record; row["id"] = .string(id)
            row["created"] = row["created"] ?? .string(tick()); row["updated"] = .string(tick())
            tables[collection, default: [:]][id] = row
        }
    }
    func row(_ collection: String, _ id: String) -> [String: JSONValue]? { tables[collection]?[id] }
    func setOffline(_ value: Bool) { offline = value }
    func loseResponse() { loseNextWrite = true }
    func reject(_ collection: String) { rejected = collection }
    func count(_ collection: String) -> Int { tables[collection]?.count ?? 0 }
    func edit(_ collection: String, _ id: String, _ fields: [String: JSONValue]) {
        guard var row = tables[collection]?[id] else { return }
        RecordReplica.assign(fields, to: &row); row["updated"] = .string(tick())
        tables[collection]?[id] = row
    }
    func remove(_ collection: String, _ id: String) {
        var trimmed: [String: [String: Set<String>]] = [:]
        RecordReplica.delete(collection, id: id, from: &tables, trimmed: &trimmed)
    }

    private func tick() -> String {
        clock.addTimeInterval(1)
        return RecordSchema.timestamp(clock)
    }
    private func reply(_ value: JSONValue?, _ status: Int, _ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        (try value.map { try JSONEncoder().encode($0) } ?? Data(), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }

    func respond(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        if offline { throw URLError(.notConnectedToInternet) }
        let method = request.httpMethod ?? "GET"
        let parts = request.url!.path.split(separator: "/").map(String.init)
        if parts.last == "batch" {
            let body = try JSONDecoder().decode([String: JSONValue].self, from: request.httpBody!)
            guard case .array(let items)? = body["requests"] else { return try reply(nil, 400, request) }
            let snapshot = tables
            var results: [JSONValue] = []
            for item in items {
                guard case .object(let fields) = item, case .string(let url)? = fields["url"], case .string(let verb)? = fields["method"] else { continue }
                var nested = URLRequest(url: URL(string: url, relativeTo: request.url!)!)
                nested.httpMethod = verb; nested.httpBody = try JSONEncoder().encode(fields["body"] ?? .object([:]))
                let (data, response) = try await write(nested)
                guard (200..<300).contains(response.statusCode) else { tables = snapshot; return try reply(.object(["message": .string("Batch failed.")]), 400, request) }
                results.append(.object(["status": .number(Double(response.statusCode)), "body": data.isEmpty ? .null : try JSONDecoder().decode(JSONValue.self, from: data)]))
            }
            return try finishWrite(.array(results), request)
        }
        guard parts.count >= 4 else { return try reply(.object([:]), 200, request) }
        if method == "GET" { return try read(parts[2], id: parts.count > 4 ? parts[4] : nil, request) }
        let (data, response) = try await write(request)
        return try finishWrite(data.isEmpty ? nil : try JSONDecoder().decode(JSONValue.self, from: data), request, status: response.statusCode)
    }

    private func finishWrite(_ value: JSONValue?, _ request: URLRequest, status: Int = 200) throws -> (Data, HTTPURLResponse) {
        if loseNextWrite { loseNextWrite = false; throw URLError(.networkConnectionLost) }
        return try reply(value, status, request)
    }

    private func write(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let method = request.httpMethod ?? "POST"
        let parts = request.url!.path.split(separator: "/").map(String.init)
        let collection = parts[2]
        writes.append("\(method) \(collection)")
        if rejected == collection { return try reply(.object(["message": .string("Rejected.")]), 400, request) }
        let body = try request.httpBody.map { try JSONDecoder().decode([String: JSONValue].self, from: $0) } ?? [:]
        var id = parts.count > 4 ? parts[4] : ""
        if id.isEmpty, case .string(let value)? = body["id"] { id = value }
        let existing = tables[collection]?[id]
        switch method {
        case "DELETE":
            guard existing != nil else { return try reply(nil, 404, request) }
            remove(collection, id); return try reply(nil, 204, request)
        case "POST" where existing != nil: return try reply(.object(["message": .string("Not unique.")]), 400, request)
        case "PATCH" where existing == nil: return try reply(nil, 404, request)
        default:
            var row = existing ?? RecordSchema.emptyRecord(collection)
            if existing == nil { row["created"] = .string(tick()) }
            RecordReplica.assign(body, to: &row)
            row["id"] = .string(id); row["updated"] = .string(tick())
            tables[collection, default: [:]][id] = row
            return try reply(.object(row), 200, request)
        }
    }

    private func read(_ collection: String, id: String?, _ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ name: String) -> String { query.first { $0.name == name }?.value ?? "" }
        if let id {
            guard let row = tables[collection]?[id] else { return try reply(nil, 404, request) }
            return try reply(.object(RecordReplica.project(row, collection: collection, fields: value("fields"), expand: value("expand"), tables: tables)), 200, request)
        }
        let filter = RecordFilter.parse(value("filter"))
        var rows = (tables[collection] ?? [:]).values.filter { filter.matches($0, collection: collection, tables: tables) }
        RecordFilter.sort(&rows, by: value("sort"))
        let page = max(1, Int(value("page")) ?? 1), perPage = max(1, Int(value("perPage")) ?? 30), lower = min(rows.count, (page - 1) * perPage)
        let items = rows[lower..<min(rows.count, lower + perPage)].map {
            JSONValue.object(RecordReplica.project($0, collection: collection, fields: value("fields"), expand: value("expand"), tables: tables))
        }
        return try reply(.object(["items": .array(items), "page": .number(Double(page)), "perPage": .number(Double(perPage)),
            "totalItems": .number(Double(rows.count)), "totalPages": .number(Double((rows.count + perPage - 1) / perPage))]), 200, request)
    }
}

private final class Clock: @unchecked Sendable {
    private let lock = NSLock()
    private var date = Date(timeIntervalSince1970: 1_791_000_000)
    func now() -> Date { lock.lock(); defer { lock.unlock() }; return date }
    func advance(days: Double) { lock.lock(); date.addTimeInterval(days * 86_400); lock.unlock() }
}

private struct Harness {
    let server = FakePocketBase()
    let clock = Clock()
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    var remote: PocketBaseClient { let server = server; return PocketBaseClient(transport: { try await server.respond($0) }) }
    func replica() -> RecordReplica { let clock = clock; return RecordReplica(directory: directory, owner: "owner", now: { clock.now() }) }
    func local(_ replica: RecordReplica, online: Bool) -> PocketBaseClient { remote.routing(through: replica, history: nil, online: online) }
    func seedWorkspace() async {
        await server.seed("projects", [["id": .string("project0000001"), "title": .string("Active"), "isDone": .bool(false), "status": .string("active"),
                                       "description": .string("<p>Plan</p>"), "captures": .array([.string("capture0000001")])],
                                      ["id": .string("project0000002"), "title": .string("Archived"), "isDone": .bool(true), "status": .string("completed"),
                                       "description": .string("<p>Old plan</p>")]])
        await server.seed("tasks", [["id": .string("task0000000001"), "title": .string("Write"), "project": .string("project0000001"), "priority": .string("high")]])
        await server.seed("captures", [["id": .string("capture0000001"), "kind": .string("note"), "title": .string("Filed"), "note": .string("<p>Kept</p>")],
                                      ["id": .string("capture0000002"), "kind": .string("note"), "title": .string("Inbox"), "note": .string("<p>Loose</p>")]])
        await server.seed("knowledge", [["id": .string("note0000000001"), "title": .string("Idea"), "body": .string("<p>Original</p>"), "status": .string("draft"),
                                        "sources": .array([.string("capture0000001")])]])
    }
}

struct ReplicaTests {
    @Test func filterFollowsPocketBaseRelationsAndAnyOperators() {
        let tables: RecordTables = [
            "projects": ["p1": ["id": .string("p1"), "isDone": .bool(false), "captures": .array([.string("c1")])]],
            "captures": ["c1": ["id": .string("c1"), "isProcessed": .bool(false)], "c2": ["id": .string("c2"), "isProcessed": .bool(false)]],
            "tasks": ["t1": ["id": .string("t1"), "project": .string("p1")], "t2": ["id": .string("t2"), "project": .string("")]]
        ]
        let filed = RecordFilter.parse(RecordFilters.inProgress)
        #expect(filed.matches(tables["captures"]!["c1"]!, collection: "captures", tables: tables))
        #expect(!filed.matches(tables["captures"]!["c2"]!, collection: "captures", tables: tables))
        let open = RecordFilter.parse("project = '' || project.isDone = false")
        #expect(tables["tasks"]!.values.allSatisfy { open.matches($0, collection: "tasks", tables: tables) })
        #expect(RecordFilter.parse("captures ?= 'c1'").matches(tables["projects"]!["p1"]!, collection: "projects", tables: tables))
        #expect(RecordFilter.parse("habit = 'h' && day >= '2025-01-01' && day <= '2025-12-31'").lowerBound("day") == .string("2025-01-01"))
        #expect(RecordFilter.parse("day = '2026-01-02' || day >= '2025-03-01'").lowerBound("day") == .string("2025-03-01"))
        #expect(RecordFilter.parse("day <= '2026-01-01'").lowerBound("day") == nil)
    }

    @Test func offlineReadsAndEditsApplyLocallyThenSyncInOrder() async throws {
        let harness = Harness(); defer { try? FileManager.default.removeItem(at: harness.directory) }
        await harness.seedWorkspace()
        let replica = harness.replica()
        try await replica.pull(harness.remote)
        let offline = harness.local(replica, online: false)
        let projects = try await RecordReader(api: offline, query: RecordQueries.projects(status: "active")).next()
        #expect(projects.items.map(\.title) == ["Active"])
        let inbox = try await RecordReader(api: offline, query: RecordQueries.captures(stage: "inbox")).next()
        #expect(inbox.items.map(\.id) == ["capture0000002"])
        let created = try await offline.save(.projects, id: nil, creationID: "project0000003", fields: ["title": .string("Offline")], owner: "owner")
        guard case .project(let project) = created else { Issue.record("Expected a project"); return }
        _ = try await offline.save(.tasks, id: nil, creationID: "task0000000002", fields: ["title": .string("Draft"), "project": .string(project.id)], owner: "owner")
        let tasks = try await RecordReader(api: offline, query: RecordQueries.tasks(project: project.id)).next()
        #expect(tasks.items.map(\.title) == ["Draft"])
        #expect(tasks.items.first?.projectTitle == "Offline")
        #expect(await replica.status().pendingIDs == ["project0000003", "task0000000002"])
        #expect(await harness.server.count("projects") == 2)
        try await replica.push(harness.remote)
        #expect(await harness.server.writes == ["POST projects", "POST tasks"])
        #expect(await harness.server.row("tasks", "task0000000002")?["project"] == .string("project0000003"))
        #expect(await replica.status().pendingIDs.isEmpty)
    }

    @Test func pendingChangesSurviveRelaunchAndOverlayDownloadedRows() async throws {
        let harness = Harness(); defer { try? FileManager.default.removeItem(at: harness.directory) }
        await harness.seedWorkspace()
        let first = harness.replica()
        try await first.pull(harness.remote)
        _ = try await harness.local(first, online: false).save(.tasks, id: "task0000000001", creationID: nil, fields: ["isDone": .bool(true)], owner: "owner")
        await harness.server.edit("tasks", "task0000000001", ["title": .string("Renamed elsewhere")])
        let relaunched = harness.replica()
        #expect(await relaunched.isReady)
        try await relaunched.pull(harness.remote)
        let task: FocusTask? = try await harness.local(relaunched, online: false).record("tasks", id: "task0000000001")
        #expect(task?.title == "Renamed elsewhere")
        #expect(task?.isDone == true)
        try await relaunched.push(harness.remote)
        #expect(await harness.server.row("tasks", "task0000000001")?["isDone"] == .bool(true))
    }

    @Test func deltaPullAndReconcileBringChangesAndDeletions() async throws {
        let harness = Harness(); defer { try? FileManager.default.removeItem(at: harness.directory) }
        await harness.seedWorkspace()
        let replica = harness.replica()
        try await replica.pull(harness.remote)
        await harness.server.edit("projects", "project0000001", ["title": .string("Renamed")])
        await harness.server.remove("captures", "capture0000002")
        #expect(try await replica.pull(harness.remote))
        let local = harness.local(replica, online: false)
        let project: Project? = try await local.record("projects", id: "project0000001")
        #expect(project?.title == "Renamed")
        #expect(try await local.count("captures") == 2)
        try await replica.pull(harness.remote, reconcile: true)
        #expect(try await local.count("captures") == 1)
    }

    @Test func lostCreateResponseIsNotSentTwice() async throws {
        let harness = Harness(); defer { try? FileManager.default.removeItem(at: harness.directory) }
        let replica = harness.replica()
        try await replica.pull(harness.remote)
        _ = try await harness.local(replica, online: false).save(.captures, id: nil, creationID: "capture0000009",
            fields: ["kind": .string("note"), "title": .string("Once")], owner: "owner")
        await harness.server.loseResponse()
        try await replica.push(harness.remote)
        #expect(await harness.server.writes == ["POST captures"])
        #expect(await replica.status().pendingChanges == 0)
    }

    @Test func rejectedChangeIsSetAsideWhileLaterChangesSync() async throws {
        let harness = Harness(); defer { try? FileManager.default.removeItem(at: harness.directory) }
        await harness.seedWorkspace()
        let replica = harness.replica()
        try await replica.pull(harness.remote)
        let local = harness.local(replica, online: false)
        _ = try await local.save(.categories, id: nil, creationID: "category000001", fields: ["name": .string("Work"), "color": .string("blue")], owner: "owner")
        _ = try await local.save(.tasks, id: "task0000000001", creationID: nil, fields: ["priority": .string("low")], owner: "owner")
        await harness.server.reject("categories")
        try await replica.push(harness.remote)
        let status = await replica.status()
        #expect(status.failed.map(\.summary) == ["New category “Work”"])
        #expect(status.pendingChanges == 0)
        #expect(await harness.server.row("tasks", "task0000000001")?["priority"] == .string("low"))
        await replica.discard(status.failed[0].id)
        #expect(try await local.count("categories") == 0)
    }

    @Test func connectionFailureKeepsOrderAndRetriesLater() async throws {
        let harness = Harness(); defer { try? FileManager.default.removeItem(at: harness.directory) }
        await harness.seedWorkspace()
        let replica = harness.replica()
        try await replica.pull(harness.remote)
        _ = try await harness.local(replica, online: false).save(.tasks, id: "task0000000001", creationID: nil, fields: ["title": .string("Later")], owner: "owner")
        await harness.server.setOffline(true)
        await #expect(throws: URLError.self) { try await replica.push(harness.remote) }
        #expect(await replica.status().pendingChanges == 1)
        await harness.server.setOffline(false)
        try await replica.push(harness.remote)
        #expect(await harness.server.row("tasks", "task0000000001")?["title"] == .string("Later"))
    }

    @Test func localDeletesFollowPocketBaseRelationRules() async throws {
        let harness = Harness(); defer { try? FileManager.default.removeItem(at: harness.directory) }
        await harness.seedWorkspace()
        await harness.server.seed("habits", [["id": .string("habit000000001"), "name": .string("Walk"), "kind": .string("check"), "startDay": .string("2026-09-01")]])
        await harness.server.seed("habit_entries", [["id": .string("entry000000001"), "habit": .string("habit000000001"), "day": .string("2026-09-02"), "value": .number(1)]])
        let replica = harness.replica()
        try await replica.pull(harness.remote)
        let local = harness.local(replica, online: false)
        try await local.delete("projects", id: "project0000001")
        let task: FocusTask? = try await local.record("tasks", id: "task0000000001")
        #expect(task?.project == "")
        try await local.delete("captures", id: "capture0000001")
        let note: Knowledge? = try await local.record("knowledge", id: "note0000000001")
        #expect(note?.sources == [])
        try await local.delete("habits", id: "habit000000001")
        #expect(try await local.count("habit_entries", filter: "day >= '2026-01-01'") == 0)
    }

    @Test func noteTextEditedOnBothDevicesKeepsBothVersions() async throws {
        let harness = Harness(); defer { try? FileManager.default.removeItem(at: harness.directory) }
        await harness.seedWorkspace()
        let replica = harness.replica()
        try await replica.pull(harness.remote)
        _ = try await harness.local(replica, online: false).save(.knowledge, id: "note0000000001", creationID: nil,
            fields: ["body": .string("<p>Mine</p>"), "summary": .string("Local summary")], owner: "owner")
        await harness.server.edit("knowledge", "note0000000001", ["body": .string("<p>Theirs</p>")])
        try await replica.push(harness.remote)
        #expect(await harness.server.row("knowledge", "note0000000001")?["body"] == .string("<p>Theirs</p>"))
        #expect(await harness.server.row("knowledge", "note0000000001")?["summary"] == .string("Local summary"))
        let notes: [Knowledge] = try await harness.remote.list("knowledge")
        #expect(notes.contains { $0.title == "Idea (conflicted copy)" && $0.body == "<p>Mine</p>" && $0.status == .draft })
        #expect(await replica.status().notice?.contains("separate draft") == true)
    }

    @Test func oldTextIsTrimmedButListsStayCompleteAndDetailsRefetch() async throws {
        let harness = Harness(); defer { try? FileManager.default.removeItem(at: harness.directory) }
        await harness.seedWorkspace()
        let replica = harness.replica()
        harness.clock.advance(days: 120)
        try await replica.pull(harness.remote)
        let offline = harness.local(replica, online: false)
        let archived = try await RecordReader(api: offline, query: RecordQueries.projects(status: "archived")).next()
        #expect(archived.items.map(\.title) == ["Archived"])
        await #expect(throws: ReplicaError.fullContentOffline) { let _: Project? = try await offline.record("projects", id: "project0000002") }
        let active: Project? = try await offline.record("projects", id: "project0000001")
        #expect(active?.description == "<p>Plan</p>")
        await #expect(throws: ReplicaError.fullContentOffline) { let _: Knowledge? = try await offline.record("knowledge", id: "note0000000001") }
        let online: Knowledge? = try await harness.local(replica, online: true).record("knowledge", id: "note0000000001")
        #expect(online?.body == "<p>Original</p>")
        let reopened: Knowledge? = try await offline.record("knowledge", id: "note0000000001")
        #expect(reopened?.body == "<p>Original</p>")
        await replica.freeUpSpace()
        await #expect(throws: ReplicaError.fullContentOffline) { let _: Knowledge? = try await offline.record("knowledge", id: "note0000000001") }
    }

    @Test func habitHistoryOutsideTheWindowNeedsAConnectionAndStatisticsMatchTheServer() async throws {
        let harness = Harness(); defer { try? FileManager.default.removeItem(at: harness.directory) }
        let today = DayKey(date: harness.clock.now())
        await harness.server.seed("habits", [["id": .string("habit000000001"), "name": .string("Read"), "kind": .string("number"), "startDay": .string("2023-12-25")],
                                            ["id": .string("habit000000002"), "name": .string("Walk"), "kind": .string("check"), "startDay": .string("2023-12-25")]])
        await harness.server.seed("habit_targets", [["id": .string("target00000001"), "habit": .string("habit000000001"), "day": .string("2023-12-25"), "target": .number(5)],
                                                   ["id": .string("target00000002"), "habit": .string("habit000000001"), "day": .string("2025-06-01"), "target": .number(8)]])
        var entries: [[String: JSONValue]] = []
        var day = DayKey(rawValue: "2023-12-25")!, index = 0
        while day <= today {
            index += 1
            if index % 7 != 3 { entries.append(["id": .string(String(format: "entryread%06d", index)), "habit": .string("habit000000001"), "day": .string(day.rawValue), "value": .number(Double(index % 10))]) }
            if index % 5 != 0 { entries.append(["id": .string(String(format: "entrywalk%06d", index)), "habit": .string("habit000000002"), "day": .string(day.rawValue), "value": .number(1)]) }
            day = day.adding(days: 1)
        }
        await harness.server.seed("habit_entries", entries)
        let replica = harness.replica()
        try await replica.pull(harness.remote)
        let expected = try await harness.remote.habitStatistics(through: today)
        let local = await replica.habitStatistics(through: today)
        #expect(local?.overall == expected.overall)
        #expect(local?.byID == expected.byID)
        let single = await replica.habitStatistics(through: today, habit: "habit000000001")
        let expectedSingle = try await harness.remote.habitStatistics(through: today, habit: "habit000000001")
        #expect(single?.overall == expectedSingle.overall)
        let offline = harness.local(replica, online: false)
        let thisYear = try await offline.habitActivity(year: today.year, today: today)
        let serverYear = try await harness.remote.habitActivity(year: today.year, today: today)
        #expect(thisYear.progress == serverYear.progress)
        await #expect(throws: ReplicaError.olderHistoryOffline) { _ = try await offline.habitActivity(year: 2024, today: today) }
        let older = try await harness.local(replica, online: true).habitActivity(year: 2024, today: today)
        #expect(older.progress == (try await harness.remote.habitActivity(year: 2024, today: today)).progress)
        #expect(try await offline.habitDay(today).values == (try await harness.remote.habitDay(today)).values)
    }

    @Test func focusTotalCountsEverySessionOnceAndPagesOlderHistoryOnline() async throws {
        let harness = Harness(); defer { try? FileManager.default.removeItem(at: harness.directory) }
        let now = harness.clock.now().timeIntervalSince1970 * 1000
        let sessions: [[String: JSONValue]] = (0..<40).map { index in
            ["id": .string(String(format: "session%08d", index)), "mode": .string("complete"), "durationMinutes": .number(25),
             "remainingSeconds": .number(60), "lastTick": .number(now - Double(index) * 5 * 86_400_000)]
        }
        await harness.server.seed("pomodoro_sessions", sessions)
        let replica = harness.replica()
        try await replica.pull(harness.remote)
        #expect(await replica.focusTotal(pending: []) == 40 * 24 * 60)
        let started = FocusSession(id: "sessionlocal01", durationMinutes: 10, now: harness.clock.now())
        let end = Date(timeIntervalSince1970: started.lastTick / 1000 + 600)
        let session = SessionEngine(now: { end }).finish(started, save: true)
        #expect(await replica.focusTotal(pending: [session]) == 40 * 24 * 60 + 600)
        await replica.recordCompletedSession(session)
        #expect(await replica.focusTotal(pending: [session]) == 40 * 24 * 60 + 600)
        await harness.server.seed("pomodoro_sessions", [["id": .string(session.id), "mode": .string("complete"), "durationMinutes": .number(10),
            "remainingSeconds": .number(0), "lastTick": .number(session.lastTick)]])
        try await replica.pull(harness.remote)
        #expect(await replica.focusTotal(pending: []) == 40 * 24 * 60 + 600)
        var all: [FocusSession] = []
        let online = RecordReader(api: harness.local(replica, online: true), query: RecordQueries.history())
        while true { let batch = try await online.next(); all += batch.items; await online.accept(); if !batch.hasMore { break } }
        #expect(all.count == 41)
        var recent: [FocusSession] = []
        let offline = RecordReader(api: harness.local(replica, online: false), query: RecordQueries.history())
        while true { let batch = try await offline.next(); recent += batch.items; await offline.accept(); if !batch.hasMore { break } }
        #expect(recent.count == 20)
    }

    @Test func signOutRemovesDownloadsButKeepsUnsyncedChanges() async throws {
        let harness = Harness(); defer { try? FileManager.default.removeItem(at: harness.directory) }
        await harness.seedWorkspace()
        let replica = harness.replica()
        try await replica.pull(harness.remote)
        _ = try await harness.local(replica, online: false).save(.tasks, id: "task0000000001", creationID: nil, fields: ["title": .string("Keep me")], owner: "owner")
        await replica.removeDownloadedData()
        let reopened = harness.replica()
        #expect(await reopened.isReady == false)
        #expect(await reopened.status().pendingChanges == 1)
        try await reopened.push(harness.remote)
        #expect(await harness.server.row("tasks", "task0000000001")?["title"] == .string("Keep me"))
    }

    @Test func recentProjectsListActiveProjectsByLastChangeOffline() async throws {
        let harness = Harness(); defer { try? FileManager.default.removeItem(at: harness.directory) }
        #expect(try await harness.remote.isWorkspaceEmpty())
        await harness.seedWorkspace()
        await harness.server.seed("projects", [
            ["id": .string("project0000003"), "title": .string("Planned"), "isDone": .bool(false), "status": .string("planned")],
            ["id": .string("project0000004"), "title": .string("Newer"), "isDone": .bool(false), "status": .string("active")],
            ["id": .string("project0000005"), "title": .string("Legacy"), "isDone": .bool(false), "status": .string("")]
        ])
        let replica = harness.replica()
        try await replica.pull(harness.remote)
        let offline = harness.local(replica, online: false)
        #expect(try await offline.isWorkspaceEmpty() == false)
        #expect(try await offline.recentProjects().map(\.title) == ["Legacy", "Newer", "Active"])
        _ = try await offline.save(.projects, id: "project0000001", creationID: nil, fields: ["title": .string("Active edited")], owner: "owner")
        #expect(try await offline.recentProjects(limit: 2).map(\.title) == ["Active edited", "Legacy"])
    }

    @Test func exportIncludesEveryCollectionAndUnsyncedSessions() async throws {
        let harness = Harness(); defer { try? FileManager.default.removeItem(at: harness.directory) }
        await harness.seedWorkspace()
        await harness.server.seed("categories", [["id": .string("category000001"), "name": .string("Work"), "color": .string("blue")]])
        await harness.server.seed("habits", [["id": .string("habit000000001"), "name": .string("Read"), "kind": .string("check"), "startDay": .string("2026-01-01")]])
        await harness.server.seed("habit_entries", [["id": .string("entry000000001"), "habit": .string("habit000000001"), "day": .string("2026-01-02"), "value": .number(1)]])
        await harness.server.seed("pomodoro_sessions", [
            ["id": .string("session0000001"), "mode": .string("complete"), "durationMinutes": .number(25), "remainingSeconds": .number(0),
             "lastTick": .number(1_000_000), "task": .string("task0000000001")],
            ["id": .string("session0000002"), "mode": .string("running"), "durationMinutes": .number(25), "remainingSeconds": .number(1500),
             "lastTick": .number(2_000_000)]
        ])
        let started = FocusSession(id: "session0000003", durationMinutes: 10, now: Date(timeIntervalSince1970: 3000))
        let local = SessionEngine(now: { Date(timeIntervalSince1970: 3600) }).finish(started, save: true)
        let data = try await WorkspaceExport.data(from: harness.remote, account: Account(id: "owner", email: "me@example.com"),
                                                  unsyncedSessions: [local, started], exportedAt: Date(timeIntervalSince1970: 0))
        let document = try JSONDecoder().decode([String: JSONValue].self, from: data)
        func rows(_ key: String) -> [[String: JSONValue]] {
            guard case .array(let items)? = document[key] else { return [] }
            return items.compactMap { if case .object(let row) = $0 { return row } else { return nil } }
        }
        #expect(document["format"] == .string("pokus-export"))
        #expect(document["exportedAt"] == .string("1970-01-01T00:00:00Z"))
        #expect(rows("projects").count == 2)
        #expect(rows("tasks").count == 1)
        #expect(rows("captures").count == 2)
        #expect(rows("notes").first?["body"] == .string("<p>Original</p>"))
        #expect(rows("categories").count == 1)
        #expect(rows("habits").count == 1)
        #expect(rows("habitEntries").count == 1)
        #expect(rows("habitTargets").isEmpty)
        #expect(rows("focusSessions").compactMap { $0["id"] } == [.string("session0000003"), .string("session0000001")])
        #expect(rows("projects").allSatisfy { $0["collectionId"] == nil && $0["expand"] == nil })
        let name = WorkspaceExport.fileName()
        #expect(name.hasPrefix("Pokus export ") && name.hasSuffix(".json"))
    }
}
