import DailyCore
import Foundation
import Observation
import SwiftData

public enum HabitStoreError: LocalizedError {
    case invalidName, invalidTarget, invalidValue, invalidDate, missingHabit, invalidData

    public var errorDescription: String? {
        switch self {
        case .invalidName: return "Give your habit a name."
        case .invalidTarget: return "Enter a daily target greater than zero."
        case .invalidValue: return "Enter a number of zero or more."
        case .invalidDate: return "Choose a date between this habit's creation and today."
        case .missingHabit: return "This habit could not be found."
        case .invalidData: return "Some saved habit data could not be read. Your data has not been changed."
        }
    }
}

@MainActor
@Observable
public final class HabitStore {
    public private(set) var histories: [HabitHistory] = []
    public let container: ModelContainer
    @ObservationIgnored private let context: ModelContext
    @ObservationIgnored private let saveChanges: (ModelContext) throws -> Void

    public static func makeContainer(inMemory: Bool = false, url: URL? = nil) throws -> ModelContainer {
        let schema = Schema([Habit.self, DailyEntry.self, TargetRevision.self])
        let configuration: ModelConfiguration
        if let url {
            configuration = ModelConfiguration(schema: schema, url: url, cloudKitDatabase: .none)
        } else {
            configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: inMemory, cloudKitDatabase: .none)
        }
        return try ModelContainer(for: schema, configurations: [configuration])
    }

    public init(container: ModelContainer, saveChanges: @escaping (ModelContext) throws -> Void = { try $0.save() }) throws {
        self.container = container
        self.context = ModelContext(container)
        self.context.autosaveEnabled = false
        self.saveChanges = saveChanges
        try reload()
    }

    public func history(id: UUID) -> HabitHistory? { histories.first { $0.id == id } }

    public func create(name: String, kind: HabitKind, unit: String = "", target: Double = 1,
                       today: DayKey = DayKey()) throws {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty else { throw HabitStoreError.invalidName }
        guard target.isFinite, target > 0 else { throw HabitStoreError.invalidTarget }
        try transact {
            let habit = Habit(name: cleanName, kindRaw: kind.rawValue,
                              unit: kind == .number ? unit.trimmingCharacters(in: .whitespacesAndNewlines) : "",
                              startDayRaw: today.rawValue)
            context.insert(habit)
            if kind == .number {
                context.insert(TargetRevision(habitID: habit.id, dayRaw: today.rawValue, target: target))
            }
        }
    }

    public func edit(id: UUID, name: String, target: Double, today: DayKey = DayKey()) throws {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty else { throw HabitStoreError.invalidName }
        guard target.isFinite, target > 0 else { throw HabitStoreError.invalidTarget }
        guard let history = history(id: id), today >= history.startDay else { throw HabitStoreError.invalidDate }
        try transact {
            let habit = try model(id: id)
            habit.name = cleanName
            if habit.kindRaw == HabitKind.number.rawValue, target != history.target(on: today) {
                let key = "\(id.uuidString):\(today.rawValue)"
                let request = FetchDescriptor<TargetRevision>(predicate: #Predicate { $0.key == key })
                if let revision = try context.fetch(request).first {
                    revision.target = target
                } else {
                    context.insert(TargetRevision(habitID: id, dayRaw: today.rawValue, target: target))
                }
            }
        }
    }

    public func setValue(_ value: Double, for id: UUID, on day: DayKey, today: DayKey = DayKey()) throws {
        guard value.isFinite, value >= 0 else { throw HabitStoreError.invalidValue }
        guard let habit = history(id: id) else { throw HabitStoreError.missingHabit }
        guard day >= habit.startDay, day <= today else { throw HabitStoreError.invalidDate }
        guard habit.kind == .number || value == 0 || value == 1 else { throw HabitStoreError.invalidValue }
        try transact {
            let key = "\(id.uuidString):\(day.rawValue)"
            let request = FetchDescriptor<DailyEntry>(predicate: #Predicate { $0.key == key })
            if let entry = try context.fetch(request).first {
                entry.value = value
            } else {
                context.insert(DailyEntry(habitID: id, dayRaw: day.rawValue, value: value))
            }
        }
    }

    public func delete(id: UUID) throws {
        try transact {
            let habit = try model(id: id)
            for entry in try context.fetch(FetchDescriptor<DailyEntry>(predicate: #Predicate { $0.habitID == id })) {
                context.delete(entry)
            }
            for revision in try context.fetch(FetchDescriptor<TargetRevision>(predicate: #Predicate { $0.habitID == id })) {
                context.delete(revision)
            }
            context.delete(habit)
        }
    }

    private func model(id: UUID) throws -> Habit {
        guard let habit = try context.fetch(FetchDescriptor<Habit>(predicate: #Predicate { $0.id == id })).first else {
            throw HabitStoreError.missingHabit
        }
        return habit
    }

    private func transact(_ changes: () throws -> Void) throws {
        do {
            try changes()
            // Construct the next UI snapshot before committing, so a read failure never looks like a failed save.
            let next = try fetchHistories()
            try saveChanges(context)
            histories = next
        } catch {
            context.rollback()
            throw error
        }
    }

    private func reload() throws { histories = try fetchHistories() }

    private func fetchHistories() throws -> [HabitHistory] {
        let habits = try context.fetch(FetchDescriptor<Habit>(sortBy: [SortDescriptor(\.createdAt)]))
        let entries = Dictionary(grouping: try context.fetch(FetchDescriptor<DailyEntry>()), by: \.habitID)
        let revisions = Dictionary(grouping: try context.fetch(FetchDescriptor<TargetRevision>()), by: \.habitID)
        return try habits.map { habit in
            guard let start = DayKey(rawValue: habit.startDayRaw), let kind = HabitKind(rawValue: habit.kindRaw) else {
                throw HabitStoreError.invalidData
            }
            var values: [DayKey: Double] = [:]
            for entry in entries[habit.id] ?? [] {
                guard let day = DayKey(rawValue: entry.dayRaw), entry.value.isFinite, entry.value >= 0 else {
                    throw HabitStoreError.invalidData
                }
                values[day] = entry.value
            }
            let targets = try (revisions[habit.id] ?? []).map { revision in
                guard let day = DayKey(rawValue: revision.dayRaw), revision.target.isFinite, revision.target > 0 else {
                    throw HabitStoreError.invalidData
                }
                return TargetChange(day: day, target: revision.target)
            }
            guard kind == .check || targets.contains(where: { $0.day == start }) else {
                throw HabitStoreError.invalidData
            }
            return HabitHistory(id: habit.id, name: habit.name, kind: kind, unit: habit.unit,
                                startDay: start, targets: targets, entries: values)
        }
    }
}
