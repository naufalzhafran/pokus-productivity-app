import Foundation
import Testing
@testable import PokusCore
@testable import PokusPersistence

struct SessionTests {
    @Test func dueDatesUseGregorianCivilDaysAndArchiveRules() throws {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = .current
        let now = calendar.date(from: DateComponents(year: 2026, month: 10, day: 2, hour: 12))!
        #expect(WorkspaceRules.dayKey(now) == "2026-10-02")
        let json = Data(#"{"id":"project00000000","title":"Project","description":"","isDone":false,"status":"active","dueDate":"2026-10-09","created":"2026-10-01"}"#.utf8)
        var project = try JSONDecoder().decode(Project.self, from: json)
        #expect(WorkspaceRules.dueSoon(project, now: now))
        project.dueDate = "2026-10-10"; #expect(!WorkspaceRules.dueSoon(project, now: now))
        project.dueDate = "2026-10-01"; #expect(WorkspaceRules.dueSoon(project, now: now))
        project.isDone = true; #expect(!WorkspaceRules.dueSoon(project, now: now))
        project.isDone = false; project.status = .completed; #expect(!WorkspaceRules.dueSoon(project, now: now))
    }
    @Test func wireTimestampsUseWholeMilliseconds() {
        let now = Date(timeIntervalSince1970: 1000.123456)
        let session = FocusSession(durationMinutes: 1, now: now)
        #expect(session.lastTick == 1000123)
        let engine = SessionEngine(now: { now.addingTimeInterval(5.123456) })
        #expect(engine.toggle(session).lastTick == floor(engine.toggle(session).lastTick))
        #expect(engine.finish(session, save: true).lastTick == floor(engine.finish(session, save: true).lastTick))
    }
    @Test func wallClockPauseResumeAndBackwardClock() {
        let start = Date(timeIntervalSince1970: 1000)
        let session = FocusSession(durationMinutes: 25, now: start)
        #expect(session.remaining(at: start.addingTimeInterval(65.9)) == 1435)
        #expect(session.remaining(at: start.addingTimeInterval(-60)) == 1500)
        let paused = SessionEngine(now: { start.addingTimeInterval(100) }).toggle(session)
        #expect(!paused.isActive)
        #expect(paused.remaining(at: start.addingTimeInterval(10000)) == 1400)
        let resumed = SessionEngine(now: { start.addingTimeInterval(200) }).toggle(paused)
        #expect(resumed.remaining(at: start.addingTimeInterval(260)) == 1340)
        #expect(session.remaining(at: start.addingTimeInterval(99999)) == 0)
    }
    @Test func earlyStopAndDiscard() {
        let start = Date(timeIntervalSince1970: 1000)
        let session = FocusSession(task: "task00000000000", durationMinutes: 25, now: start)
        let engine = SessionEngine(now: { start.addingTimeInterval(91) })
        #expect(engine.finish(session, save: true).creditedSeconds == 91)
        #expect(engine.finish(session, save: true).mode == .complete)
        #expect(engine.finish(session, save: false).mode == .discarded)
    }
    @Test func terminalCannotBeResurrectedAndOldAckKeepsNewTransition() {
        let session = FocusSession(durationMinutes: 1, now: .now)
        var timer = TimerSnapshot(); timer.transition(session)
        let first = timer.operations[0]
        let paused = SessionEngine().toggle(session); timer.transition(paused)
        timer.acknowledge(first, authoritative: session)
        #expect(timer.operations.count == 1); #expect(timer.current == paused)
        let complete = SessionEngine().finish(session, save: true)
        timer.transition(complete); timer.transition(session)
        #expect(timer.current == complete)
        timer.acknowledge(first, authoritative: complete)
        #expect(timer.operations.isEmpty)
    }
    @Test func atomicStorageRecoveryAccountIsolationAndRestore() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try PokusStore(directory: root)
        let session = FocusSession(durationMinutes: 1, now: .now)
        _ = try await store.transition("account1", session: session)
        let reopened = try PokusStore(directory: root)
        let saved = try await reopened.read("account1")
        #expect(saved.timer.current == session); #expect(saved.timer.operations.count == 1)
        let other = try await reopened.read("account2"); #expect(other.timer.current == nil)
        let remote = FocusSession(durationMinutes: 10, now: .now)
        let retained = try await reopened.restore("account1", session: remote)
        #expect(retained.timer.current == session)
        await #expect(throws: (any Error).self) { _ = try await store.read("../account1") }
    }
    @Test func failedWritePreservesLastCommittedSnapshot() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try PokusStore(directory: root)
        let session = FocusSession(durationMinutes: 1, now: .now)
        _ = try await store.transition("owner", session: session)
        let failing = try PokusStore(directory: root, write: { _, _ in throw CocoaError(.fileWriteOutOfSpace) })
        await #expect(throws: (any Error).self) { _ = try await failing.transition("owner", session: SessionEngine().toggle(session)) }
        let saved = try await store.read("owner")
        #expect(saved.timer.current == session); #expect(saved.timer.revision == 1)
    }
    @Test func legacyTitlesAndHTMLEscaping() throws {
        let legacy = String(repeating: "x", count: 300) + "\nOld title"
        #expect(try WorkspaceRules.validateTitle(legacy, maximum: 160, original: legacy) == legacy)
        #expect(throws: (any Error).self) { try WorkspaceRules.validateTitle(legacy + "new", maximum: 160, original: legacy) }
        #expect(try WorkspaceRules.validateTitle("  One\n task  ", maximum: 160) == "One task")
        #expect(WorkspaceRules.paragraphHTML("<script>&\nNotes") == "<p>&lt;script&gt;&amp;</p><p>Notes</p>")
    }
}
