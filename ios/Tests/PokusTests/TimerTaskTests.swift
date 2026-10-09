import Foundation
import PokusNetworking
import Testing
@testable import PokusCore

struct TimerTaskTests {
    @Test func untaskedSavedSessionsCount() {
        let engine = SessionEngine(now: { Date(timeIntervalSince1970: 1_000 + 600) })
        let running = FocusSession(task: "", durationMinutes: 25, now: Date(timeIntervalSince1970: 1_000))
        let saved = engine.finish(running, save: true)
        #expect(saved.mode == .complete)
        #expect(saved.task.isEmpty)
        #expect(saved.creditedSeconds == 600)
    }

    @Test func durationDragSnapsToFiveMinutes() {
        #expect(FocusDuration.snapped(0) == 5)
        #expect(FocusDuration.snapped(2.4) == 5)
        #expect(FocusDuration.snapped(7.4) == 5)
        #expect(FocusDuration.snapped(7.6) == 10)
        #expect(FocusDuration.snapped(23) == 25)
        #expect(FocusDuration.snapped(59.9) == 60)
        #expect(FocusDuration.snapped(70) == 60)
        #expect(FocusDuration.clamped(0) == 1)
        #expect(FocusDuration.clamped(90) == 60)
        #expect(FocusDuration.presets == [15, 25, 45, 60])
    }

    @Test func timerTaskPickerListsDueTasksBeforeRecentOnes() {
        let query = RecordQueries.timerTasks(today: "2026-10-08")
        #expect(query.segments.count == 2)
        func row(_ id: String, due: String, done: Bool = false) -> [String: JSONValue] {
            ["id": .string(id), "title": .string(id), "dueDate": .string(due), "isDone": .bool(done), "created": .string("2026-10-0\(id.count)")]
        }
        func id(_ row: [String: JSONValue]) -> String { if case .string(let value)? = row["id"] { return value } else { return "" } }
        let rows = [row("overdue", due: "2026-10-01"), row("today", due: "2026-10-08"), row("later", due: "2026-10-20"),
                    row("undated", due: ""), row("finished", due: "2026-10-01", done: true)]
        let tables: RecordTables = ["tasks": Dictionary(uniqueKeysWithValues: rows.map { (id($0), $0) })]
        func matching(_ segment: Int) -> [String] {
            var found = rows.filter { RecordFilter.parse(query.segments[segment].filter).matches($0, collection: "tasks", tables: tables) }
            RecordFilter.sort(&found, by: query.segments[segment].sort)
            return found.map { id($0) }
        }
        #expect(matching(0) == ["overdue", "today"])
        #expect(Set(matching(1)) == ["later", "undated"])
    }
}
