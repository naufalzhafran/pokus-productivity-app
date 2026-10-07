import Foundation

public enum HabitKind: String, Codable, CaseIterable, Sendable {
    case check
    case number

    public var title: String { self == .check ? "Checkbox" : "Number" }
}

public struct TargetChange: Equatable, Sendable {
    public let day: DayKey
    public let target: Double

    public init(day: DayKey, target: Double) {
        self.day = day
        self.target = target
    }
}

public struct HabitHistory: Identifiable, Sendable {
    public let id: UUID
    public let name: String
    public let kind: HabitKind
    public let unit: String
    public let startDay: DayKey
    public let targets: [TargetChange]
    public let entries: [DayKey: Double]

    public init(id: UUID, name: String, kind: HabitKind, unit: String = "", startDay: DayKey,
                targets: [TargetChange] = [], entries: [DayKey: Double] = [:]) {
        self.id = id
        self.name = name
        self.kind = kind
        self.unit = unit
        self.startDay = startDay
        self.targets = targets.sorted { $0.day < $1.day }
        self.entries = entries
    }

    public func value(on day: DayKey) -> Double { entries[day] ?? 0 }

    public func target(on day: DayKey) -> Double {
        guard kind == .number else { return 1 }
        return targets.last(where: { $0.day <= day })?.target ?? 1
    }

    public func fraction(on day: DayKey) -> Double {
        guard day >= startDay else { return 0 }
        return min(max(value(on: day) / target(on: day), 0), 1)
    }

    public func isComplete(on day: DayKey) -> Bool { day >= startDay && value(on: day) >= target(on: day) }

    public func completedDays(through today: DayKey) -> Set<DayKey> {
        Set(entries.keys.filter { $0 <= today && isComplete(on: $0) })
    }
}

public struct Streaks: Equatable, Sendable {
    public let current: Int
    public let longest: Int
    public let completedDays: Int
    public init(current: Int, longest: Int, completedDays: Int) { self.current = current; self.longest = longest; self.completedDays = completedDays }

    public init(completed: Set<DayKey>, today: DayKey) {
        let days = completed.filter { $0 <= today }.sorted()
        var longest = 0
        var run = 0
        var previous: DayKey?
        for day in days {
            run = previous?.adding(days: 1) == day ? run + 1 : 1
            longest = max(longest, run)
            previous = day
        }
        var current = 0
        var cursor = completed.contains(today) ? today : today.adding(days: -1)
        while completed.contains(cursor) {
            current += 1
            cursor = cursor.adding(days: -1)
        }
        self.current = current
        self.longest = longest
        self.completedDays = days.count
    }
}

public struct DayProgress: Equatable, Sendable {
    public let completed: Int
    public let total: Int
    public var fraction: Double { total == 0 ? 0 : Double(completed) / Double(total) }
    public init(completed: Int, total: Int) { self.completed = completed; self.total = total }
}

public enum ProgressCalculator {
    public static func progress(on day: DayKey, habits: [HabitHistory]) -> DayProgress {
        let eligible = habits.filter { $0.startDay <= day }
        return DayProgress(completed: eligible.filter { $0.isComplete(on: day) }.count, total: eligible.count)
    }

    public static func streaks(habits: [HabitHistory], today: DayKey) -> Streaks {
        Streaks(completed: habits.reduce(into: Set<DayKey>()) { $0.formUnion($1.completedDays(through: today)) }, today: today)
    }

    public static func intensity(for fraction: Double) -> Int {
        guard fraction.isFinite, fraction > 0 else { return 0 }
        if fraction >= 1 { return 4 }
        return min(3, max(1, Int(ceil(fraction * 3))))
    }
}

public enum NumberText {
    public static func display(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...6)))
    }

    public static func parse(_ text: String, locale: Locale = .current) -> Double? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let separator = locale.decimalSeparator ?? "."
        let normalized = separator == "." ? trimmed : trimmed.replacingOccurrences(of: separator, with: ".")
        // No grouping separators, signs, exponents, or partially parsed input.
        guard normalized.range(of: "^[0-9]+(?:\\.[0-9]+)?$", options: .regularExpression) != nil,
              let value = Double(normalized), value.isFinite, value >= 0 else { return nil }
        return value
    }

    public static func editable(_ value: Double, locale: Locale = .current) -> String {
        guard value.isFinite, value >= 0 else { return String(value) }
        if value == 0 { return "0" }
        // Swift's shortest representation round-trips to the original Double.
        // Expand its exponent so the decimal keyboard and strict parser can use it.
        let parts = String(value).split(separator: "e")
        var decimal = String(parts[0])
        if parts.count == 2, let exponent = Int(parts[1]) {
            let mantissa = decimal.split(separator: ".")
            let digits = mantissa.joined()
            let point = mantissa[0].count + exponent
            if point <= 0 {
                decimal = "0." + String(repeating: "0", count: -point) + digits
            } else if point >= digits.count {
                decimal = digits + String(repeating: "0", count: point - digits.count)
            } else {
                let index = digits.index(digits.startIndex, offsetBy: point)
                decimal = String(digits[..<index]) + "." + String(digits[index...])
            }
        }
        if decimal.contains(".") {
            while decimal.last == "0" { decimal.removeLast() }
            if decimal.last == "." { decimal.removeLast() }
        }
        return decimal.replacingOccurrences(of: ".", with: locale.decimalSeparator ?? ".")
    }
}
