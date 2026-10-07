import CryptoKit
import DailyCore
import Foundation

public struct HabitRecord: Codable, Identifiable, Sendable {
    public var id, name, kind, unit, startDay: String
}
public struct HabitDayIndex: Sendable {
    public var ids: [String]
    public var remaining: [String]
    public var completed: [String]
    public var values: [String: Double]
    public var targets: [String: Double]
    public var earliest: DayKey
    public var progress: DayProgress { DayProgress(completed: completed.count, total: ids.count) }
    public init(ids: [String], remaining: [String], completed: [String], values: [String: Double], targets: [String: Double], earliest: DayKey) {
        self.ids = ids; self.remaining = remaining; self.completed = completed; self.values = values; self.targets = targets; self.earliest = earliest
    }
}
public struct HabitStatistics: Sendable {
    public var overall: Streaks
    public var byID: [UUID: Streaks]
    public init(overall: Streaks, byID: [UUID: Streaks]) { self.overall = overall; self.byID = byID }
}
public struct HabitActivityYear: Sendable {
    public var year: Int
    public var earliest: DayKey
    public var progress: [DayKey: DayProgress]
    public var individual: HabitHistory?
    public init(year: Int, earliest: DayKey, progress: [DayKey: DayProgress], individual: HabitHistory?) {
        self.year = year; self.earliest = earliest; self.progress = progress; self.individual = individual
    }
}
public struct HabitEntryRecord: Codable, Sendable {
    public var id, habit, day: String
    public var value: Double
}
public struct HabitTargetRecord: Codable, Sendable {
    public var id, habit, day: String
    public var target: Double
}
public struct HabitWorkspace: Codable, Sendable {
    public var habits: [HabitRecord] = []
    public var entries: [HabitEntryRecord] = []
    public var targets: [HabitTargetRecord] = []
    public init() {}
    public mutating func apply(_ mutations: [HabitMutation]) {
        for mutation in mutations {
            switch mutation {
            case .habit(let record):
                if let index = habits.firstIndex(where: { $0.id == record.id }) { habits[index] = record }
                else { habits.append(record) }
            case .entry(let record):
                entries.removeAll { $0.id == record.id }; entries.append(record)
            case .target(let record):
                targets.removeAll { $0.id == record.id }; targets.append(record)
            case .deleted(let id):
                habits.removeAll { $0.id == id }
                entries.removeAll { $0.habit == id }
                targets.removeAll { $0.habit == id }
            }
        }
    }
    public func histories() throws -> [HabitHistory] {
        let entriesByHabit = Dictionary(grouping: entries, by: \.habit)
        let targetsByHabit = Dictionary(grouping: targets, by: \.habit)
        var days: [String: DayKey] = [:]
        func day(_ raw: String) -> DayKey? {
            if let cached = days[raw] { return cached }
            let parsed = DayKey(rawValue: raw)
            days[raw] = parsed
            return parsed
        }
        return try habits.map { habit in
            guard let start = day(habit.startDay), let kind = HabitKind(rawValue: habit.kind),
                  !habit.name.isEmpty else { throw PokusError.message("Your saved habits couldn't be read.") }
            var values: [DayKey: Double] = [:]
            for entry in entriesByHabit[habit.id] ?? [] {
                guard let day = day(entry.day), day >= start, entry.value.isFinite, entry.value >= 0,
                      kind == .number || entry.value == 0 || entry.value == 1 else { throw PokusError.message("Your saved habit entries couldn't be read.") }
                values[day] = entry.value
            }
            let revisions = try (targetsByHabit[habit.id] ?? []).map { revision -> TargetChange in
                guard let day = day(revision.day), day >= start, revision.target.isFinite, revision.target > 0 else { throw PokusError.message("Your saved habit targets couldn't be read.") }
                return TargetChange(day: day, target: revision.target)
            }
            guard kind == .check || revisions.contains(where: { $0.day == start }) else { throw PokusError.message("A saved habit's initial target is missing.") }
            return HabitHistory(id: HabitWire.identity(habit.id), name: habit.name, kind: kind, unit: habit.unit, startDay: start, targets: revisions, entries: values)
        }
    }
}
public enum HabitMutation: Sendable {
    case habit(HabitRecord), entry(HabitEntryRecord), target(HabitTargetRecord), deleted(String)
}

/// A single validated conversion shared by the cache and its observable presentation.
public struct ValidatedHabits: Sendable {
    public let workspace: HabitWorkspace
    public let histories: [HabitHistory]
    public init(_ workspace: HabitWorkspace) throws {
        self.workspace = workspace
        histories = try workspace.histories()
    }
}
public enum HabitWire {
    public static func dailyID(_ collection: String, habit: String, day: String) -> String {
        String(digest("\(collection):\(habit):\(day)").prefix(15))
    }
    public static func identity(_ id: String) -> UUID {
        let bytes = Array(SHA256.hash(data: Data(id.utf8)).prefix(16))
        return UUID(uuid: (bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7], bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]))
    }
    private static func digest(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
