import DailyCore
import Foundation
import PokusNetworking
import Testing
@testable import PokusCore

struct FocusStatisticsTests {
    private let utc = TimeZone(secondsFromGMT: 0)!

    private func session(_ id: String, day: String, hour: Int = 12, minutes: Int = 25, task: String = "",
                         mode: SessionMode = .complete, remaining: Int = 0, timeZone: TimeZone? = nil) -> FocusSession {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = timeZone ?? utc
        let parts = day.split(separator: "-").compactMap { Int($0) }
        let end = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: hour))!
        var value = FocusSession(id: id, task: task, durationMinutes: minutes, now: end)
        value.mode = mode; value.remainingSeconds = remaining; value.isActive = false
        return value
    }

    @Test func todayWeekAndLastSevenDaysUseLocalDays() {
        // 2026-10-08 is a Thursday.
        let today = DayKey(rawValue: "2026-10-08")!
        let sessions = [
            session("a", day: "2026-10-08"),
            session("b", day: "2026-10-08", minutes: 10, remaining: 300),
            session("c", day: "2026-10-05"),
            session("d", day: "2026-10-04"),
            session("e", day: "2026-10-01"),
            session("running", day: "2026-10-08", mode: .running),
            session("discarded", day: "2026-10-08", mode: .discarded)
        ]
        let monday = FocusStatistics(sessions: sessions, today: today, timeZone: utc, firstWeekday: 2)
        #expect(monday.today == 25 * 60 + 5 * 60)
        #expect(monday.week == 30 * 60 + 25 * 60)
        #expect(monday.lastSevenDays.count == 7)
        #expect(monday.lastSevenDays.first?.day.rawValue == "2026-10-02")
        #expect(monday.lastSevenDays.last?.day == today)
        #expect(monday.lastSevenDays.map(\.seconds) == [0, 0, 1500, 1500, 0, 0, 1800])
        let sunday = FocusStatistics(sessions: sessions, today: today, timeZone: utc, firstWeekday: 1)
        #expect(sunday.week == 30 * 60 + 25 * 60 + 25 * 60)
    }

    @Test func sessionsCountOnTheDayTheyEndedInTheDeviceTimeZone() {
        let jakarta = TimeZone(identifier: "Asia/Jakarta")!
        // 23:30 UTC on Oct 7 is 06:30 on Oct 8 in Jakarta.
        let late = session("late", day: "2026-10-07", hour: 23)
        let local = FocusStatistics(sessions: [late], today: DayKey(rawValue: "2026-10-08")!, timeZone: jakarta)
        #expect(local.today == 1500)
        let inUTC = FocusStatistics(sessions: [late], today: DayKey(rawValue: "2026-10-08")!, timeZone: utc)
        #expect(inUTC.today == 0)
    }

    @Test func duplicatesFromLocalAndSyncedHistoryCountOnce() {
        let today = DayKey(rawValue: "2026-10-08")!
        let value = session("same", day: "2026-10-08")
        let statistics = FocusStatistics(sessions: [value, value], today: today, timeZone: utc)
        #expect(statistics.today == 1500)
    }

    @Test func streakCountsBackFromYesterdayUntilTodayHasFocus() {
        let today = DayKey(rawValue: "2026-10-08")!
        let history = [session("1", day: "2026-10-07"), session("2", day: "2026-10-06"), session("3", day: "2026-10-04")]
        #expect(FocusStatistics(sessions: history, today: today, timeZone: utc).streak == 2)
        #expect(FocusStatistics(sessions: history + [session("4", day: "2026-10-08")], today: today, timeZone: utc).streak == 3)
        #expect(FocusStatistics(sessions: [session("5", day: "2026-10-05")], today: today, timeZone: utc).streak == 0)
        #expect(FocusStatistics(sessions: [], today: today, timeZone: utc).streak == 0)
        // A zero-second save doesn't keep a streak alive.
        #expect(FocusStatistics(sessions: [session("6", day: "2026-10-07", minutes: 25, remaining: 1500)], today: today, timeZone: utc).streak == 0)
    }

    @Test func untaskedSavedSessionsCountTowardTotals() {
        let engine = SessionEngine(now: { Date(timeIntervalSince1970: 1_000 + 600) })
        let saved = engine.finish(FocusSession(task: "", durationMinutes: 25, now: Date(timeIntervalSince1970: 1_000)), save: true)
        let day = FocusStatistics.day(of: saved, timeZone: utc)
        #expect(FocusStatistics(sessions: [saved], today: day, timeZone: utc).today == 600)
    }

    @Test func taskTotalAddsOnlyAPendingCompletionForThatTask() {
        let done = session("s", day: "2026-10-08", task: "task1")
        #expect(FocusStatistics.taskTotal(recorded: 3600, session: done, task: "task1", pending: true) == 3600 + 1500)
        #expect(FocusStatistics.taskTotal(recorded: 5100, session: done, task: "task1", pending: false) == 5100)
        #expect(FocusStatistics.taskTotal(recorded: 3600, session: done, task: "other", pending: true) == 3600)
        #expect(FocusStatistics.taskTotal(recorded: 3600, session: nil, task: "task1", pending: true) == 3600)
        #expect(FocusStatistics.duration(7800) == "2h 10m")
        #expect(FocusStatistics.duration(1500) == "25m")
    }

    @Test func windowStartIsLocalMidnight() {
        let start = FocusStatistics.windowStart(today: DayKey(rawValue: "2026-10-08")!, days: 7, timeZone: utc)
        #expect(start == ISO8601DateFormatter().date(from: "2026-10-02T00:00:00Z"))
    }

    @Test func statisticsMergeSyncedAndLocalSessions() async throws {
        let filters = FilterLog()
        let synced = session("synced", day: "2026-10-08", minutes: 10)
        let local = session("local", day: "2026-10-08", minutes: 5)
        let client = PocketBaseClient(baseURL: URL(string: "https://stats.example")!, token: "token", transport: { request in
            let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
            await filters.append(query.first { $0.name == "filter" }?.value ?? "")
            let body = try JSONEncoder().encode(["items": [synced, local]])
            var page = try JSONSerialization.jsonObject(with: body) as! [String: Any]
            page["page"] = 1; page["perPage"] = 200; page["totalItems"] = 2; page["totalPages"] = 1
            return (try JSONSerialization.data(withJSONObject: page), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        let today = DayKey(rawValue: "2026-10-08")!
        let statistics = try await client.focusStatistics(today: today, local: [local], timeZone: utc)
        #expect(statistics.today == 15 * 60)
        let start = Int(FocusStatistics.windowStart(today: today, timeZone: utc).timeIntervalSince1970 * 1000)
        #expect(await filters.values == ["mode = 'complete' && lastTick >= \(start)"])
    }
}

private actor FilterLog {
    var values: [String] = []
    func append(_ value: String) { values.append(value) }
}
