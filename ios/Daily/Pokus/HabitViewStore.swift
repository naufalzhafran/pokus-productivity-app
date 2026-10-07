import DailyCore
import DailyPersistence
import Foundation
import PokusCore
import PokusNetworking

@MainActor
protocol HabitViewStore: Sendable {
    var histories: [HabitHistory] { get }
    var canWrite: Bool { get }
    func history(id: UUID) -> HabitHistory?
    var readIdentity: String { get }
    var cacheScopeIdentity: String { get }
    func dayIndex(_ day: DayKey) async throws -> HabitDayIndex
    func rows(ids: [String], on day: DayKey, index: HabitDayIndex) async throws -> [HabitHistory]
    func detail(id: UUID, on day: DayKey) async throws -> HabitHistory?
    func activity(year: Int, today: DayKey, habitID: UUID?) async throws -> HabitActivityYear
    func statistics(through day: DayKey, habitID: UUID?) async throws -> HabitStatistics
    func create(id: String, name: String, kind: HabitKind, unit: String, target: Double) async throws
    func edit(id: UUID, name: String?, target: Double?) async throws
    func setValue(_ value: Double, for id: UUID, on day: DayKey) async throws
    func delete(id: UUID) async throws
}
@MainActor
struct LocalHabitViewStore: HabitViewStore {
    let store: HabitStore
    var histories: [HabitHistory] { store.histories }
    var canWrite: Bool { true }
    func history(id: UUID) -> HabitHistory? { store.history(id: id) }
    var readIdentity: String { "local-\(store.revision)" }
    var cacheScopeIdentity: String { "local" }
    func dayIndex(_ day: DayKey) async throws -> HabitDayIndex {
        let eligible = histories.filter { $0.startDay <= day }
        let ids = eligible.map { $0.id.uuidString }, completed = eligible.filter { $0.isComplete(on: day) }.map { $0.id.uuidString }
        return HabitDayIndex(ids: ids, remaining: ids.filter { !completed.contains($0) }, completed: completed,
            values: Dictionary(eligible.map { ($0.id.uuidString, $0.value(on: day)) }, uniquingKeysWith: { _, last in last }),
            targets: Dictionary(eligible.map { ($0.id.uuidString, $0.target(on: day)) }, uniquingKeysWith: { _, last in last }), earliest: histories.map(\.startDay).min() ?? day)
    }
    func rows(ids: [String], on day: DayKey, index: HabitDayIndex) async throws -> [HabitHistory] { ids.compactMap { UUID(uuidString: $0).flatMap(store.history) } }
    func detail(id: UUID, on day: DayKey) async throws -> HabitHistory? { history(id: id) }
    func activity(year: Int, today: DayKey, habitID: UUID?) async throws -> HabitActivityYear {
        let selected = histories.filter { habitID == nil || $0.id == habitID }
        let days = DayKey.yearGrid(year).flatMap { $0 }.filter { $0.year == year }
        return HabitActivityYear(year: year, earliest: selected.map(\.startDay).min() ?? today,
            progress: Dictionary(days.map { ($0, ProgressCalculator.progress(on: $0, habits: selected)) }, uniquingKeysWith: { _, last in last }), individual: habitID == nil ? nil : selected.first)
    }
    func statistics(through day: DayKey, habitID: UUID?) async throws -> HabitStatistics {
        let selected = histories.filter { habitID == nil || $0.id == habitID }
        return HabitStatistics(overall: ProgressCalculator.streaks(habits: selected, today: day),
            byID: Dictionary(selected.map { ($0.id, Streaks(completed: $0.completedDays(through: day), today: day)) }, uniquingKeysWith: { _, last in last }))
    }
    func create(id: String, name: String, kind: HabitKind, unit: String, target: Double) async throws { try store.create(name: name, kind: kind, unit: unit, target: target) }
    func edit(id: UUID, name: String?, target: Double?) async throws { try store.edit(id: id, name: name, target: target) }
    func setValue(_ value: Double, for id: UUID, on day: DayKey) async throws { try store.setValue(value, for: id, on: day) }
    func delete(id: UUID) async throws { try store.delete(id: id) }
}
@MainActor
struct AccountHabitViewStore: HabitViewStore {
    let model: PokusModel
    let owner: String
    var histories: [HabitHistory] { model.account?.id == owner ? model.habitsState.histories : [] }
    var canWrite: Bool { model.account?.id == owner && model.canEdit }
    func history(id: UUID) -> HabitHistory? { model.account?.id == owner ? model.habitsState.byID[id] : nil }
    var readIdentity: String { "\(owner)-\(model.queryIdentity)" }
    var cacheScopeIdentity: String { "\(owner)-\(model.scope?.generation.uuidString ?? "signedout")" }
    private func api() throws -> PocketBaseClient {
        guard model.account?.id == owner else { throw PokusError.message("Your account changed. Open Habits again.") }
        return try model.readAPI()
    }
    func dayIndex(_ day: DayKey) async throws -> HabitDayIndex {
        let identity = readIdentity
        let value = try await api().habitDay(day)
        guard identity == readIdentity, !Task.isCancelled else { throw CancellationError() }
        return value
    }
    func rows(ids: [String], on day: DayKey, index: HabitDayIndex) async throws -> [HabitHistory] {
        let identity = readIdentity
        let rows = try await api().habitRows(ids: ids, on: day, index: index)
        guard identity == readIdentity, !Task.isCancelled else { throw CancellationError() }
        for (record, history) in rows { model.habitsState.remember(record, history: history) }
        return rows.map { $0.1 }
    }
    private func wireID(_ id: UUID) async throws -> String? {
        if let record = model.habitsState.recordsByID[id] { return record.id }
        var stream = PageStream<RecordID>(api: try api(), collection: "habits", fields: "id")
        while let record = try await stream.next() { if HabitWire.identity(record.id) == id { return record.id } }
        return nil
    }
    func detail(id: UUID, on day: DayKey) async throws -> HabitHistory? {
        let identity = readIdentity
        guard let wire = try await wireID(id), let (record, history) = try await api().habitDetail(wire, on: day) else { return nil }
        guard identity == readIdentity, !Task.isCancelled else { throw CancellationError() }
        model.habitsState.remember(record, history: history); return history
    }
    func activity(year: Int, today: DayKey, habitID: UUID?) async throws -> HabitActivityYear {
        let identity = readIdentity
        var wire: String?
        if let habitID { guard let resolved = try await wireID(habitID) else { throw HabitStoreError.missingHabit }; wire = resolved }
        let value = try await api().habitActivity(year: year, today: today, habit: wire)
        guard identity == readIdentity, !Task.isCancelled else { throw CancellationError() }
        return value
    }
    func statistics(through day: DayKey, habitID: UUID?) async throws -> HabitStatistics {
        let identity = readIdentity
        var wire: String?
        if let habitID { guard let resolved = try await wireID(habitID) else { throw HabitStoreError.missingHabit }; wire = resolved }
        guard model.account?.id == owner else { throw PokusError.message("Your account changed. Open Habits again.") }
        let value = try await model.habitStatistics(through: day, habit: wire)
        guard identity == readIdentity, !Task.isCancelled else { throw CancellationError() }
        return value
    }
    private func record(_ id: UUID) async throws -> HabitRecord {
        guard canWrite else { throw PokusError.message("Connect and sign in to edit habits.") }
        if model.habitsState.recordsByID[id] == nil { _ = try await detail(id: id, on: DayKey()) }
        guard let record = model.habitsState.recordsByID[id] else { throw HabitStoreError.missingHabit }
        return record
    }
    private func validate(name: String, unit: String, target: Double) throws -> String {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, clean.count <= 120 else { throw HabitStoreError.invalidName }
        guard unit.trimmingCharacters(in: .whitespacesAndNewlines).count <= 40 else { throw HabitStoreError.invalidUnit }
        guard target.isFinite, target > 0 else { throw HabitStoreError.invalidTarget }
        return clean
    }
    func create(id: String, name: String, kind: HabitKind, unit: String, target: Double) async throws {
        guard canWrite else { throw PokusError.message("Connect and sign in to edit habits.") }
        let clean = try validate(name: name, unit: kind == .number ? unit : "", target: target)
        let day = DayKey().rawValue
        try await model.writeHabits { api, owner in
            var requests: [(String, String, String?, [String: JSONValue])] = [("POST", "habits", nil, ["id": .string(id), "owner": .string(owner), "name": .string(clean), "kind": .string(kind.rawValue), "unit": .string(kind == .number ? unit.trimmingCharacters(in: .whitespacesAndNewlines) : ""), "startDay": .string(day)])]
            if kind == .number { requests.append(("POST", "habit_targets", nil, ["id": .string(HabitWire.dailyID("habit_targets", habit: id, day: day)), "owner": .string(owner), "habit": .string(id), "day": .string(day), "target": .number(target)])) }
            do { return try await api.habitBatch(requests) }
            catch {
                // Habit and initial target commit in one batch; an existing ID proves that batch committed.
                if let habit: HabitRecord = try? await api.record("habits", id: id) {
                    if kind == .number {
                        guard let revision: HabitTargetRecord = try await api.record("habit_targets", id: HabitWire.dailyID("habit_targets", habit: id, day: day)) else { throw error }
                        return [.habit(habit), .target(revision)]
                    }
                    return [.habit(habit)]
                }
                throw error
            }
        }
    }
    func edit(id: UUID, name: String?, target: Double?) async throws {
        let habit = try await record(id), day = DayKey().rawValue
        let clean = name?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let clean {
            guard !clean.isEmpty, clean.count <= 120 else { throw HabitStoreError.invalidName }
        }
        if let target {
            guard target.isFinite, target > 0 else { throw HabitStoreError.invalidTarget }
        }
        guard day >= habit.startDay else { throw HabitStoreError.invalidDate }
        guard clean != nil || (habit.kind == "number" && target != nil) else { return }
        try await model.writeHabits { api, owner in
            var requests: [(String, String, String?, [String: JSONValue])] = []
            if let clean { requests.append(("PATCH", "habits", habit.id, ["name": .string(clean)])) }
            if habit.kind == "number", let target {
                let revision = try await api.habitDailyID("habit_targets", habit: habit.id, day: day)
                requests.append(("PUT", "habit_targets", nil, ["id": .string(revision), "owner": .string(owner), "habit": .string(habit.id), "day": .string(day), "target": .number(target)]))
            }
            return try await api.habitBatch(requests)
        }
    }
    func setValue(_ value: Double, for id: UUID, on day: DayKey) async throws {
        let habit = try await record(id)
        guard value.isFinite, value >= 0, habit.kind == "number" || value == 0 || value == 1 else { throw HabitStoreError.invalidValue }
        guard day.rawValue >= habit.startDay, day <= DayKey() else { throw HabitStoreError.invalidDate }
        try await model.writeHabits { api, owner in
            let entry = try await api.habitDailyID("habit_entries", habit: habit.id, day: day.rawValue)
            return try await api.habitBatch([("PUT", "habit_entries", nil, ["id": .string(entry), "owner": .string(owner), "habit": .string(habit.id), "day": .string(day.rawValue), "value": .number(value)])])
        }
    }
    func delete(id: UUID) async throws {
        let habit = try await record(id)
        try await model.writeHabits { api, _ in
            do { try await api.delete("habits", id: habit.id) }
            catch let error as APIError where error.status == 404 { }
            return [.deleted(habit.id)]
        }
    }
}
