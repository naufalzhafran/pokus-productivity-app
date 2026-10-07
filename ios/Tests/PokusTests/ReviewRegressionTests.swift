import DailyCore
import Foundation
import PokusCore
import PokusNetworking
import PokusPersistence
import Testing

private final class WriteLog: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [(String, Int)] = []
    func append(_ url: URL, _ bytes: Int) { lock.withLock { values.append((url.lastPathComponent, bytes)) } }
    var writes: [(String, Int)] { lock.withLock { values } }
}

@Suite struct ReviewRegressionTests {
    @Test func upgradeMigratesEveryAccountAndPreservesFailedTimerCopies() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        var legacy = AccountSnapshot()
        legacy.timer.transition(FocusSession(durationMinutes: 5, now: .now))
        let data = try JSONEncoder().encode(legacy)
        for owner in ["goodA", "goodB", "failed"] {
            try data.write(to: root.appendingPathComponent("\(owner).json"))
            try Data("downloaded".utf8).write(to: root.appendingPathComponent("\(owner).library.json.recovery-old"))
        }
        let corrupt = Data("sole unreadable legacy timer".utf8)
        try corrupt.write(to: root.appendingPathComponent("broken.json"))
        try data.write(to: root.appendingPathComponent("recovered.json.recovery-old"))
        let local = root.appendingPathComponent("Daily.store")
        try Data("legacy local habits".utf8).write(to: local)
        let store = try PokusStore(directory: root, write: { data, url in
            if url.lastPathComponent == "failed.timer.json" { throw CocoaError(.fileWriteOutOfSpace) }
            try data.write(to: url, options: .atomic)
        })
        #expect(await store.removeDownloadedCaches().count == 2)
        for owner in ["goodA", "goodB", "recovered"] {
            #expect(try await store.read(owner).timer == legacy.timer)
            #expect(!FileManager.default.fileExists(atPath: root.appendingPathComponent("\(owner).json").path))
            #expect(!FileManager.default.fileExists(atPath: root.appendingPathComponent("\(owner).library.json.recovery-old").path))
        }
        #expect(try Data(contentsOf: root.appendingPathComponent("failed.json")) == data)
        #expect(try Data(contentsOf: root.appendingPathComponent("broken.json")) == corrupt)
        #expect(FileManager.default.fileExists(atPath: local.path))
        let retry = try PokusStore(directory: root)
        #expect(await retry.removeDownloadedCaches().count == 1)
        #expect(try await retry.read("failed").timer == legacy.timer)
    }
    @Test func corruptDownloadedCachesDoNotDisableDurableTimer() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try PokusStore(directory: root)
        let expected = try await store.transition("owner", session: FocusSession(durationMinutes: 25, now: .now)).timer
        let corrupt = Data("broken cache".utf8)
        for component in ["workspace", "library", "habits"] {
            try corrupt.write(to: root.appendingPathComponent("owner.\(component).json"))
        }
        let reopened = try PokusStore(directory: root)
        let saved = try await reopened.read("owner")
        #expect(saved.timer == expected)
        try corrupt.write(to: root.appendingPathComponent("owner.library.json.recovery-old"))
        #expect(await reopened.removeDownloadedCaches().isEmpty)
        let files = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
        #expect(files.map(\.lastPathComponent) == ["owner.timer.json"])
        let repaired = try PokusStore(directory: root)
        #expect(try await repaired.read("owner").timer == expected)
    }
    @Test func corruptTimerIsNeverSilentlyReset() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try PokusStore(directory: root)
        let corrupt = Data("broken durable timer".utf8)
        try corrupt.write(to: root.appendingPathComponent("owner.timer.json"))
        await #expect(throws: (any Error).self) { _ = try await store.read("owner") }
        #expect(try Data(contentsOf: root.appendingPathComponent("owner.timer.json")) == corrupt)
    }
    @Test func separateTimerSurvivesMalformedLegacySnapshot() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try PokusStore(directory: root)
        let expected = try await store.transition("owner", session: FocusSession(durationMinutes: 25, now: .now)).timer
        try Data(#"{"timer":"bad","library":"bad"}"#.utf8).write(to: root.appendingPathComponent("owner.json"))
        let reopened = try PokusStore(directory: root)
        #expect(try await reopened.read("owner").timer == expected)
        #expect(await reopened.removeDownloadedCaches().isEmpty)
        #expect(!FileManager.default.fileExists(atPath: root.appendingPathComponent("owner.json").path))
    }
    @Test func semanticallyInvalidHabitCacheIsRecoverable() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try PokusStore(directory: root)
        try Data(#"{"habits":[{"id":"h","name":"Bad","kind":"unknown","unit":"","startDay":"2026-01-01"}],"entries":[],"targets":[]}"#.utf8).write(to: root.appendingPathComponent("owner.habits.json"))
        #expect(await store.removeDownloadedCaches().isEmpty)
        #expect(!FileManager.default.fileExists(atPath: root.appendingPathComponent("owner.habits.json").path))
    }
    @Test func previewUsesShortRequestTimeout() async throws {
        let api = PocketBaseClient(transport: { request in
            #expect(request.timeoutInterval == 2)
            return (Data("{}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        _ = try await api.preview(url: URL(string: "https://example.com")!)
    }
    @Test func emptyPocketBaseSelectsUseLegacyDefaults() throws {
        let decoder = JSONDecoder()
        let project = try decoder.decode(Project.self, from: Data(#"{"id":"p","title":"Legacy","description":"","isDone":false,"status":"","created":""}"#.utf8))
        let task = try decoder.decode(FocusTask.self, from: Data(#"{"id":"t","title":"Legacy","isDone":false,"focusedSeconds":0,"project":"","priority":"","created":""}"#.utf8))
        #expect(project.lifecycle == .active)
        #expect(task.priority == Priority.none)
        #expect(throws: DecodingError.self) { try decoder.decode(ProjectStatus.self, from: Data(#""unknown""#.utf8)) }
    }
    @Test func plainTextEditingPreservesEntitiesParagraphsAndLists() {
        let html = "<p>2 &lt; 3 &amp; &#39;quoted&#39; &copy; &#x1F600;</p><p>Next<br>line</p><ul><li>One</li><li>Two</li></ul>"
        let text = WorkspaceRules.plainText(html)
        #expect(text == "2 < 3 & 'quoted' © 😀\nNext\nline\n• One\n• Two")
        #expect(WorkspaceRules.plainText(WorkspaceRules.paragraphHTML(text)) == text)
        #expect(WorkspaceRules.plainText("<p>&amp;lt; &NotEqualTilde;</p>") == "&lt; ≂̸")
        #expect(WorkspaceRules.plainText("<script>secret()</script><p>Visible</p>") == "Visible")
        #expect(WorkspaceRules.plainText("<p>&lt;strong&gt;literal&lt;/strong&gt;</p>") == "<strong>literal</strong>")
    }

    @Test func timerWritesDoNotSerializeLibraryAndFailedWritesDoNotAdvanceMemory() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let log = WriteLog()
        let store = try PokusStore(directory: root, write: { data, url in
            log.append(url, data.count)
            try data.write(to: url, options: .atomic)
        })
        let json = """
        {"captures":[],"knowledge":[{"id":"note","title":"Note","summary":"","body":"\(String(repeating: "x", count: 1_000_000))","project":"","linkedProjects":[],"sources":[],"locator":"","category":"","status":"draft","reviewStep":0,"nextReviewAt":0,"created":"","updated":""}]}
        """
        try Data(json.utf8).write(to: root.appendingPathComponent("owner.library.json"))
        let session = FocusSession(durationMinutes: 25, now: .now)
        _ = try await store.transition("owner", session: session)
        _ = try await store.transition("owner", session: SessionEngine().toggle(session))
        #expect(log.writes.map(\.0) == ["owner.timer.json", "owner.timer.json"])
        #expect(log.writes.allSatisfy { $0.1 < 2000 })
        let failing = try PokusStore(directory: root, write: { _, _ in throw CocoaError(.fileWriteOutOfSpace) })
        let before = try await failing.read("owner")
        await #expect(throws: (any Error).self) { _ = try await failing.transition("owner", session: nil) }
        #expect(try await failing.read("owner").timer == before.timer)
        let reopened = try PokusStore(directory: root)
        #expect(await reopened.removeDownloadedCaches().isEmpty)
        #expect(!FileManager.default.fileExists(atPath: root.appendingPathComponent("owner.library.json").path))
    }

    @Test func legacySnapshotMigrationPreservesOutboxAndOtherAccount() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        var legacy = AccountSnapshot()
        legacy.timer.transition(FocusSession(durationMinutes: 20, now: .now))
        let legacyData = try JSONEncoder().encode(legacy)
        try legacyData.write(to: root.appendingPathComponent("owner.json"))
        let store = try PokusStore(directory: root)
        #expect(try await store.read("owner").timer == legacy.timer)
        let paused = SessionEngine().toggle(legacy.timer.current!)
        _ = try await store.transition("owner", session: paused)
        let reopened = try PokusStore(directory: root)
        let restored = try await reopened.read("owner")
        #expect(restored.timer.current == paused)
        #expect(restored.timer.operations.count == 1)
        #expect(await reopened.removeDownloadedCaches().isEmpty)
        #expect(!FileManager.default.fileExists(atPath: root.appendingPathComponent("owner.json").path))
        #expect(try await reopened.read("other").timer.operations.isEmpty)
    }

    @Test func groupedHabitHistoriesKeepEntriesAndTargetsSeparate() throws {
        let json = #"{"habits":[{"id":"first","name":"One","kind":"number","unit":"pages","startDay":"2026-01-01"},{"id":"second","name":"Two","kind":"check","unit":"","startDay":"2026-01-01"}],"entries":[{"id":"a","habit":"first","day":"2026-01-02","value":3},{"id":"b","habit":"second","day":"2026-01-02","value":1}],"targets":[{"id":"c","habit":"first","day":"2026-01-01","target":5}]}"#
        let habits = try JSONDecoder().decode(HabitWorkspace.self, from: Data(json.utf8)).histories()
        let day = DayKey(rawValue: "2026-01-02")!
        #expect(habits[0].value(on: day) == 3)
        #expect(habits[0].target(on: day) == 5)
        #expect(habits[1].value(on: day) == 1)
        #expect(habits[1].target(on: day) == 1)
    }

    @Test func repeatedCreateAfterLostResponseUsesOneServerRecord() async throws {
        let server = CreationServer()
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        for _ in 0..<2 {
            let result = try await api.save(.projects, id: nil, creationID: "project00000001", fields: ["title": .string("One")], owner: "owner")
            guard case .project(let project) = result else { Issue.record("Expected project"); return }
            #expect(project.id == "project00000001")
        }
        #expect(await server.created == 1)
    }

    @Test func historyRefreshUsesServerUpdateTimeForLateOfflineCompletions() async throws {
        let api = PocketBaseClient(transport: { request in
            if request.url!.path.contains("pomodoro_sessions") {
                let filter = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "filter" }?.value
                #expect(filter == "mode = 'complete' && updated >= '2026-10-02 01:00:00.000Z'")
            }
            return (Data(#"{"items":[],"page":1,"perPage":200,"totalItems":0,"totalPages":1}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        _ = try await api.workspace(historySince: "2026-10-02 01:00:00.000Z")
    }
}

private actor CreationServer {
    var created = 0
    private var saved: Data?
    func respond(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        if request.httpMethod == "POST" {
            if saved == nil {
                created += 1
                saved = Data(#"{"id":"project00000001","title":"One","description":"","isDone":false,"created":"2026-01-01"}"#.utf8)
                throw URLError(.networkConnectionLost)
            }
            return (Data(), HTTPURLResponse(url: request.url!, statusCode: 400, httpVersion: nil, headerFields: nil)!)
        }
        return (saved ?? Data(), HTTPURLResponse(url: request.url!, statusCode: saved == nil ? 404 : 200, httpVersion: nil, headerFields: nil)!)
    }
}
