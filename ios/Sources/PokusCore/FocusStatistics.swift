import DailyCore
import Foundation

/// Focus seconds credited on one local calendar day.
public struct FocusDay: Equatable, Identifiable, Sendable {
    public let day: DayKey
    public let seconds: Int
    public var id: DayKey { day }
    public init(day: DayKey, seconds: Int) { self.day = day; self.seconds = seconds }
}

/// Today, this week, streak, and the last seven days, from completed sessions.
/// A session counts on the local day it ended (`lastTick`).
public struct FocusStatistics: Equatable, Sendable {
    public let today: Int
    public let week: Int
    /// Consecutive days with focus, ending today. A day without focus yet doesn't break
    /// the streak until it's over, so it counts back from yesterday until then.
    public let streak: Int
    /// Oldest first, ending today.
    public let lastSevenDays: [FocusDay]

    public init(today: Int = 0, week: Int = 0, streak: Int = 0, lastSevenDays: [FocusDay] = []) {
        self.today = today; self.week = week; self.streak = streak; self.lastSevenDays = lastSevenDays
    }

    public init(sessions: [FocusSession], today: DayKey, timeZone: TimeZone = .autoupdatingCurrent,
                firstWeekday: Int = DayKey.firstWeekday) {
        let byDay = Self.secondsByDay(sessions, timeZone: timeZone)
        let weekStart = today.startOfWeek(firstWeekday: firstWeekday)
        self.today = byDay[today] ?? 0
        week = byDay.filter { $0.key >= weekStart && $0.key <= today }.values.reduce(0, +)
        lastSevenDays = (0..<7).reversed().map { offset in
            let day = today.adding(days: -offset)
            return FocusDay(day: day, seconds: byDay[day] ?? 0)
        }
        var day = (byDay[today] ?? 0) > 0 ? today : today.adding(days: -1), count = 0
        while (byDay[day] ?? 0) > 0 { count += 1; day = day.adding(days: -1) }
        streak = count
    }

    /// Completed sessions only, each counted once even when it appears in more than one source.
    public static func secondsByDay(_ sessions: [FocusSession], timeZone: TimeZone) -> [DayKey: Int] {
        var seen = Set<String>(), totals: [DayKey: Int] = [:]
        for session in sessions where session.mode == .complete && session.creditedSeconds > 0 && seen.insert(session.id).inserted {
            totals[day(of: session, timeZone: timeZone), default: 0] += session.creditedSeconds
        }
        return totals
    }

    public static func day(of session: FocusSession, timeZone: TimeZone) -> DayKey {
        DayKey(date: Date(timeIntervalSince1970: session.lastTick / 1000), timeZone: timeZone)
    }

    /// The earliest instant a query needs so the streak and charts can be computed for `today`.
    public static func windowStart(today: DayKey, days: Int = 60, timeZone: TimeZone = .autoupdatingCurrent) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let parts = today.adding(days: -(days - 1)).rawValue.split(separator: "-").compactMap { Int($0) }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))!
    }

    /// A task's total including a just-finished session PocketBase hasn't counted yet.
    public static func taskTotal(recorded: Int, session: FocusSession?, task: String, pending: Bool) -> Int {
        guard let session, pending, session.mode == .complete, session.task == task else { return max(0, recorded) }
        return max(0, recorded) + session.creditedSeconds
    }

    /// "2h 10m" or "25m", for compact labels.
    public static func duration(_ seconds: Int) -> String {
        let minutes = max(0, seconds) / 60
        return minutes < 60 ? "\(minutes)m" : "\(minutes / 60)h \(minutes % 60)m"
    }
}
