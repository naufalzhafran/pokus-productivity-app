import Foundation
import PokusCore
import PokusNetworking
import PokusPersistence
import Testing

@Suite struct LibraryTests {
    @Test func legacyAccountCacheKeepsTimerAndLoadsEmptyLibrary() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try PokusStore(directory: root)
        let session = FocusSession(durationMinutes: 25, now: .now)
        let saved = try await store.transition("owner", session: session)
        var fields = try JSONSerialization.jsonObject(with: JSONEncoder().encode(saved)) as! [String: Any]
        fields.removeValue(forKey: "library")
        try JSONSerialization.data(withJSONObject: fields).write(to: root.appendingPathComponent("owner.json"))
        let reopened = try await store.read("owner")
        #expect(reopened.timer.current == session); #expect(reopened.timer.operations.count == 1)
        #expect(await store.removeDownloadedCaches().isEmpty)
        #expect(try await store.read("owner").timer == reopened.timer)
        #expect(try await store.read("other").timer.current == nil)
        #expect(!FileManager.default.fileExists(atPath: root.appendingPathComponent("owner.json").path))
    }
    @Test func reviewIntervalsMatchWebAcrossDSTAndClampSteps() {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "America/New_York")!
        let now = calendar.date(from: DateComponents(year: 2026, month: 3, day: 7, hour: 18))!
        let first = LibraryRules.review(step: 0, remembered: false, now: now, calendar: calendar)
        #expect(first.step == 0)
        #expect(Date(timeIntervalSince1970: first.next / 1000) == calendar.date(from: DateComponents(year: 2026, month: 3, day: 8))!)
        let remembered = LibraryRules.review(step: 0, remembered: true, now: now, calendar: calendar)
        #expect(remembered.step == 1)
        #expect(Date(timeIntervalSince1970: remembered.next / 1000) == calendar.date(from: DateComponents(year: 2026, month: 3, day: 10))!)
        #expect(LibraryRules.review(step: 100, remembered: true).step == 4)
        #expect(LibraryRules.review(step: 4, remembered: false).step == 0)
    }
    @Test func originalLinksAcceptOnlyWebSchemesWithoutCredentials() {
        #expect(LibraryRules.safeURL("https://example.com/article") != nil)
        for url in ["javascript:alert(1)", "file:///etc/passwd", "https://user:secret@example.com", "data:text/html,test"] { #expect(LibraryRules.safeURL(url) == nil) }
    }
    @Test func quickCaptureNormalizesBareLinksAndClassifiesHosts() {
        #expect(LibraryRules.captureURL("example.com/page")?.absoluteString == "https://example.com/page")
        #expect(LibraryRules.captureURL("a thought") == nil)
        #expect(LibraryRules.captureKind(for: URL(string: "https://youtu.be/id")!) == .video)
        #expect(LibraryRules.captureKind(for: URL(string: "https://docs.google.com/document/id")!) == .drive)
        #expect(LibraryRules.captureKind(for: URL(string: "https://youtube.com.example.org/id")!) == .article)
    }
    @Test func captureTextKeepsMultilineThoughtsAndTrimsEmptyInput() {
        let parsed = LibraryRules.parseCaptureText("  First thought\nSecond thought  ")
        #expect(parsed.kind == .note)
        #expect(parsed.url == nil)
        #expect(parsed.note == "First thought\nSecond thought")
        let empty = LibraryRules.parseCaptureText(" \n ")
        #expect(empty.url == nil)
        #expect(empty.note.isEmpty)
    }
    @Test func captureTextDetectsLoneLinksWithoutDuplicatingThemInNotes() {
        for (text, kind) in [("https://youtu.be/id", CaptureKind.video), ("https://docs.google.com/document/id", .drive), ("https://x.com/user/status/1", .social), ("example.com/page", .article)] {
            let parsed = LibraryRules.parseCaptureText(" \n" + text + " \n")
            #expect(parsed.kind == kind)
            #expect(parsed.url == LibraryRules.captureURL(text))
            #expect(parsed.note.isEmpty)
        }
    }
    @Test func captureTextExtractsAnEmbeddedLinkAndPreservesTheWholeNote() {
        let text = "Read later:\nhttps://example.com/article.\nDiscuss this tomorrow."
        let parsed = LibraryRules.parseCaptureText(text)
        #expect(parsed.kind == .article)
        #expect(parsed.url?.absoluteString == "https://example.com/article")
        #expect(parsed.note == text)
        let video = LibraryRules.parseCaptureText("Watch (https://youtu.be/id). Then https://example.com")
        #expect(video.kind == .video)
        #expect(video.url?.absoluteString == "https://youtu.be/id")
    }
    @Test func captureTextLeavesUnsafeLinksAsNotes() {
        for text in ["javascript:alert(1)", "file:///etc/passwd", "Read https://user:secret@example.com", "Read https://"] {
            let parsed = LibraryRules.parseCaptureText(text)
            #expect(parsed.kind == .note)
            #expect(parsed.url == nil)
            #expect(parsed.note == text)
        }
    }
    @Test func previewDecodesExistingHookResponseWithoutEnvelope() async throws {
        let client = PocketBaseClient(token: "test", transport: { request in
            #expect(request.url!.path == "/api/pokus/link-preview")
            #expect(request.value(forHTTPHeaderField: "Authorization") == "test")
            return (Data(#"{"title":"Example","description":"A source","image":"https://example.com/image.jpg"}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        let preview = try await client.preview(url: URL(string: "https://example.com")!)
        #expect(preview?.title == "Example")
    }
    @Test func libraryDecodesServerFormatsAndUsesIndependentCollections() async throws {
        let client = PocketBaseClient(transport: { request in
            let items: String
            if request.url!.path.contains("captures") {
                items = #"[{"id":"capture1","kind":"book","url":"","title":"Book","note":"<p>Notes</p>","author":"Author","preview":null,"isProcessed":false,"created":"2026-01-01","updated":"2026-01-01"}]"#
            } else {
                items = #"[{"id":"knowledge1","title":"Idea","summary":"Summary","body":"<p>Body</p>","project":"","linkedProjects":[],"sources":["capture1"],"locator":"Page 3","category":"","status":"evergreen","reviewStep":0,"nextReviewAt":1000,"created":"2026-01-01","updated":"2026-01-01"}]"#
            }
            return (Data("{\"items\":\(items),\"page\":1,\"perPage\":200,\"totalItems\":1,\"totalPages\":1}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        let library = try await client.library()
        #expect(library.captures[0].label == "Book")
        #expect(library.knowledge[0].sources == ["capture1"])
        #expect(library.knowledge[0].isDue())
        #expect(LibraryRules.captureStage(library.captures[0], projects: [], notes: library.knowledge) == "in_progress")
    }
}
