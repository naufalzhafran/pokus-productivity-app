import Foundation

/// One day's habit reminder: the local day it belongs to and the wall-clock time it fires.
public struct DailyReminderOccurrence: Equatable, Sendable {
    public let day: DayKey
    /// Year, month, day, hour, and minute with no time zone, so the alert follows the device's local time.
    public let components: DateComponents
}

/// Habit reminders are scheduled one day at a time, so a day whose habits are all done can be skipped.
public enum DailyReminderSchedule {
    public static let days = 7

    /// The next `count` reminders from `now`: today's only if its time hasn't passed and today isn't
    /// skipped, then one per following day.
    public static func occurrences(after now: Date, hour: Int, minute: Int, count: Int = days,
                                   skipping skipped: DayKey? = nil, timeZone: TimeZone = .autoupdatingCurrent) -> [DailyReminderOccurrence] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let today = DayKey(date: now, timeZone: timeZone)
        var result: [DailyReminderOccurrence] = []
        var offset = 0
        while result.count < max(0, count) && offset <= count {
            let day = today.adding(days: offset)
            offset += 1
            guard day != skipped else { continue }
            let parts = day.rawValue.split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3 else { continue }
            let components = DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: hour, minute: minute)
            if day == today {
                guard let fire = calendar.date(from: components), fire > now else { continue }
            }
            result.append(DailyReminderOccurrence(day: day, components: components))
        }
        return result
    }
}
