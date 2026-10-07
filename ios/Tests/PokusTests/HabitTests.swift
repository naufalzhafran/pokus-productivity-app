import Foundation
import PokusCore
import PokusPersistence
import Testing

@Suite struct HabitTests {
    @Test func wireHistoryKeepsHistoricalTargetsAndDateOnlyEntries() throws {
        let json = #"{"habits":[{"id":"habit0000000001","name":"Read","kind":"number","unit":"pages","startDay":"2026-01-01"}],"entries":[{"id":"entry0000000001","habit":"habit0000000001","day":"2026-01-01","value":10}],"targets":[{"id":"target000000001","habit":"habit0000000001","day":"2026-01-01","target":10},{"id":"target000000002","habit":"habit0000000001","day":"2026-01-02","target":20}]}"#
        let workspace = try JSONDecoder().decode(HabitWorkspace.self, from: Data(json.utf8))
        let habit = try #require(workspace.histories().first)
        #expect(habit.startDay.rawValue == "2026-01-01")
        #expect(habit.targets.map(\.target) == [10, 20])
        #expect(habit.entries.values.first == 10)
        #expect(habit.id == HabitWire.identity("habit0000000001"))
    }
    @Test func dailyIDsMatchBrowserSHA256Contract() {
        #expect(HabitWire.dailyID("habit_entries", habit: "habit0000000001", day: "2026-01-01") == "d0615f7c1b596e3")
        #expect(HabitWire.identity("first") != HabitWire.identity("second"))
    }
    @Test func accountHabitCacheNeverCrossesAccountsOrLosesPendingTimer() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try PokusStore(directory: root)
        let session = FocusSession(durationMinutes: 25, now: .now)
        _ = try await store.transition("first", session: session)
        let json = #"{"habits":[{"id":"habit0000000001","name":"Walk","kind":"check","unit":"","startDay":"2026-01-01"}],"entries":[],"targets":[]}"#
        try Data(json.utf8).write(to: root.appendingPathComponent("first.habits.json"))
        #expect(await store.removeDownloadedCaches().isEmpty)
        #expect(try await store.read("second").timer.current == nil)
        let first = try await store.read("first")
        #expect(!FileManager.default.fileExists(atPath: root.appendingPathComponent("first.habits.json").path))
        #expect(first.timer.operations.count == 1)
        #expect(first.timer.current == session)
    }
    @Test func oldCachesLoadWithoutHabitFields() throws {
        var fields = try JSONSerialization.jsonObject(with: JSONEncoder().encode(AccountSnapshot())) as! [String: Any]
        fields.removeValue(forKey: "habits")
        let snapshot = try JSONDecoder().decode(AccountSnapshot.self, from: JSONSerialization.data(withJSONObject: fields))
        #expect(snapshot.timer.operations.isEmpty)
    }
}
