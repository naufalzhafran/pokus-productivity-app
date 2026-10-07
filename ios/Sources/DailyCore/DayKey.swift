import Foundation

/// A Gregorian calendar date, not an instant. Its identity survives timezone changes.
public struct DayKey: Hashable, Comparable, Codable, Sendable, Identifiable {
    public let rawValue: String
    public var id: String { rawValue }

    public init(date: Date = .now, timeZone: TimeZone = .autoupdatingCurrent) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        rawValue = String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!)
    }

    public init?(rawValue: String) {
        let parts = rawValue.split(separator: "-").compactMap { Int($0) }
        guard rawValue.count == 10, parts.count == 3,
              (1...9999).contains(parts[0]), (1...12).contains(parts[1]), (1...31).contains(parts[2]),
              let date = Self.calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])),
              DayKey(date: date, timeZone: Self.calendar.timeZone).rawValue == rawValue else { return nil }
        self.rawValue = rawValue
    }

    public static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }

    /// Noon UTC is used only for calendar arithmetic and display, never as the entry's identity.
    public var date: Date {
        let parts = rawValue.split(separator: "-").map { Int($0)! }
        return Self.calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))!
    }

    public var year: Int { Self.calendar.component(.year, from: date) }
    public var month: Int { Self.calendar.component(.month, from: date) }
    /// Monday = 0, Sunday = 6.
    public var weekdayIndex: Int { (Self.calendar.component(.weekday, from: date) + 5) % 7 }

    public func adding(days: Int) -> Self {
        Self(date: Self.calendar.date(byAdding: .day, value: days, to: date)!, timeZone: Self.calendar.timeZone)
    }

    public func formatted(_ template: String = "EEEE, MMMM d") -> String {
        let base = Date.FormatStyle(locale: Locale(identifier: "en_US"), calendar: Self.calendar,
                                    timeZone: Self.calendar.timeZone)
        let style: Date.FormatStyle
        switch template {
        case "MMM": style = base.month(.abbreviated)
        case "MMMM d, yyyy": style = base.month(.wide).day().year()
        case "EEEE, MMMM d, yyyy": style = base.weekday(.wide).month(.wide).day().year()
        default: style = base.weekday(.wide).month(.wide).day()
        }
        return date.formatted(style)
    }

    public static func days(from start: Self, through end: Self) -> [Self] {
        guard start <= end else { return [] }
        let count = calendar.dateComponents([.day], from: start.date, to: end.date).day ?? 0
        return (0...count).map { start.adding(days: $0) }
    }

    public static func yearGrid(_ year: Int) -> [[Self]] {
        guard let first = Self(rawValue: String(format: "%04d-01-01", year)),
              let last = Self(rawValue: String(format: "%04d-12-31", year)) else { return [] }
        let start = first.adding(days: -first.weekdayIndex)
        let end = last.adding(days: 6 - last.weekdayIndex)
        let dates = days(from: start, through: end)
        return stride(from: 0, to: dates.count, by: 7).map { Array(dates[$0..<($0 + 7)]) }
    }

    private static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }
}
