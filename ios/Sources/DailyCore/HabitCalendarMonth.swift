import Foundation

/// A Monday-first month of date-only habit entries, independent of time zone.
public struct HabitCalendarMonth: Equatable, Sendable {
    public let firstDay: DayKey

    public init(containing day: DayKey) {
        firstDay = DayKey(rawValue: String(format: "%04d-%02d-01", day.year, day.month))!
    }

    public var days: [DayKey] {
        let count = Self.calendar.range(of: .day, in: .month, for: firstDay.date)!.count
        return Array((0..<count).map { firstDay.adding(days: $0) }.prefix {
            $0.year == firstDay.year && $0.month == firstDay.month
        })
    }

    public var grid: [DayKey?] {
        let leading = Array<DayKey?>(repeating: nil, count: firstDay.weekdayIndex)
        let dates = leading + days.map(Optional.some)
        return dates + Array(repeating: nil, count: (7 - dates.count % 7) % 7)
    }

    public func adding(months: Int) -> Self? {
        guard let date = Self.calendar.date(byAdding: .month, value: months, to: firstDay.date) else { return nil }
        let year = Self.calendar.component(.year, from: date)
        guard (1...9999).contains(year), Self.calendar.component(.era, from: date) == 1 else { return nil }
        return Self(containing: DayKey(date: date, timeZone: Self.calendar.timeZone))
    }

    public func canMove(by months: Int, earliest: DayKey, latest: DayKey) -> Bool {
        guard let destination = adding(months: months) else { return false }
        return destination.firstDay >= Self(containing: earliest).firstDay
            && destination.firstDay <= Self(containing: latest).firstDay
    }

    private static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }
}
