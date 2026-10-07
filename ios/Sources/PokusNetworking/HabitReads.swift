import DailyCore
import Foundation
import PokusCore

public struct PageStream<T: Decodable & Sendable>: Sendable {
    private let api: PocketBaseClient, collection: String, filter: String, sort: String, fields: String
    private var page = 1, buffer: [T] = [], position = 0, exhausted = false
    public init(api: PocketBaseClient, collection: String, filter: String = "", sort: String = "created,id", fields: String = "") {
        self.api = api; self.collection = collection; self.filter = filter; self.sort = sort; self.fields = fields
    }
    public mutating func next() async throws -> T? {
        try Task.checkCancellation()
        if position >= buffer.count {
            guard !exhausted else { return nil }
            let result: RecordPage<T> = try await api.listPage(collection, page: page, perPage: 100, filter: filter, sort: sort, fields: fields)
            buffer = result.items; position = 0; exhausted = page >= result.totalPages; page += 1
            if buffer.isEmpty { return nil }
        }
        let value = buffer[position]; position += 1; return value
    }
}
private struct HabitMetadata: Decodable, Sendable { let id, kind, startDay: String }
private struct CompletionRun: Sendable {
    var last: DayKey?, run = 0, longest = 0, count = 0
    mutating func append(_ day: DayKey) {
        guard last != day else { return }
        run = last?.adding(days: 1) == day ? run + 1 : 1
        longest = max(longest, run); count += 1; last = day
    }
    func result(_ today: DayKey) -> Streaks {
        Streaks(current: last == today || last == today.adding(days: -1) ? run : 0, longest: longest, completedDays: count)
    }
}
extension PocketBaseClient {
    public func count(_ collection: String, filter: String = "", cacheKey: String? = nil) async throws -> Int {
        let page: RecordPage<RecordID> = try await listPage(collection, perPage: 1, filter: filter, fields: "id", cacheKey: cacheKey)
        return page.totalItems
    }
    public func focusedTotal(pending: [FocusSession]) async throws -> Int {
        struct Seconds: Decodable, Sendable { let id: String; let durationMinutes, remainingSeconds: Int }
        var stream = PageStream<Seconds>(api: self, collection: "pomodoro_sessions", filter: "mode = 'complete'", fields: "id,durationMinutes,remainingSeconds")
        var total = 0, local = Dictionary(pending.map { ($0.id, $0.creditedSeconds) }, uniquingKeysWith: { _, last in last })
        while let row = try await stream.next() { total += max(0, row.durationMinutes * 60 - row.remainingSeconds); local[row.id] = nil }
        return total + local.values.reduce(0, +)
    }
    public func projectSummary(_ id: String, includeFocus: Bool = true) async throws -> (completed: Int, total: Int, seconds: Int) {
        let filter = "project = \(RecordFilters.literal(id))"
        if !includeFocus {
            async let total = count("tasks", filter: filter)
            async let completed = count("tasks", filter: RecordFilters.and([filter, "isDone = true"]))
            return try await (completed, total, 0)
        }
        struct TaskSummary: Decodable, Sendable { let isDone: Bool; let focusedSeconds: Int }
        var stream = PageStream<TaskSummary>(api: self, collection: "tasks", filter: filter, fields: "isDone,focusedSeconds")
        var done = 0, total = 0, seconds = 0
        while let task = try await stream.next() { total += 1; done += task.isDone ? 1 : 0; seconds += task.focusedSeconds }
        return (done, total, seconds)
    }
    public func effectiveTargets(_ ids: [String], on day: DayKey) async throws -> [String: Double] {
        try await withThrowingTaskGroup(of: (String, Double).self) { group in
            var next = ids.makeIterator(), result: [String: Double] = [:]
            func submit(_ id: String) {
                group.addTask {
                    let rows: RecordPage<HabitTargetRecord> = try await self.listPage("habit_targets", perPage: 1,
                        filter: "habit = \(RecordFilters.literal(id)) && day <= \(RecordFilters.literal(day.rawValue))", sort: "-day,id", fields: "id,habit,day,target")
                    guard let target = rows.items.first, target.target.isFinite, target.target > 0, DayKey(rawValue: target.day) != nil else {
                        throw PokusError.message("A habit's effective target is missing or invalid.")
                    }
                    return (id, target.target)
                }
            }
            for _ in 0..<4 { if let id = next.next() { submit(id) } }
            while let (id, target) = try await group.next() {
                result[id] = target
                if let id = next.next() { submit(id) }
            }
            return result
        }
    }
    public func habitDay(_ day: DayKey) async throws -> HabitDayIndex {
        var metadata = PageStream<HabitMetadata>(api: self, collection: "habits", filter: "startDay <= \(RecordFilters.literal(day.rawValue))", sort: "created,id", fields: "id,kind,startDay")
        var records: [HabitMetadata] = [], earliest = day
        while let record = try await metadata.next() {
            guard let start = DayKey(rawValue: record.startDay), HabitKind(rawValue: record.kind) != nil else { throw PokusError.message("Invalid habit data.") }
            earliest = min(earliest, start); records.append(record)
        }
        var stream = PageStream<HabitEntryRecord>(api: self, collection: "habit_entries", filter: "day = \(RecordFilters.literal(day.rawValue))")
        var values: [String: Double] = [:]
        while let entry = try await stream.next() {
            guard entry.value.isFinite, entry.value >= 0 else { throw PokusError.message("Invalid habit entry.") }
            values[entry.habit] = entry.value
        }
        guard records.filter({ $0.kind == "check" }).allSatisfy({ values[$0.id] == nil || values[$0.id] == 0 || values[$0.id] == 1 }) else {
            throw PokusError.message("Invalid checkbox entry.")
        }
        let numeric = records.filter { $0.kind == "number" && (values[$0.id] ?? 0) > 0 }.map(\.id)
        let targets = try await effectiveTargets(numeric, on: day)
        let completed = records.filter { (values[$0.id] ?? 0) >= ($0.kind == "check" ? 1 : targets[$0.id] ?? .infinity) }.map(\.id)
        let completeIDs = Set(completed)
        return HabitDayIndex(ids: records.map(\.id), remaining: records.filter { !completeIDs.contains($0.id) }.map(\.id),
            completed: completed, values: values, targets: targets, earliest: earliest)
    }
    public func habitRows(ids: [String], on day: DayKey, index: HabitDayIndex) async throws -> [(HabitRecord, HabitHistory)] {
        guard !ids.isEmpty else { return [] }
        let result: RecordPage<HabitRecord> = try await listPage("habits", perPage: 25, filter: RecordFilters.ids(ids))
        var targets = index.targets
        let missing = result.items.filter { $0.kind == "number" && targets[$0.id] == nil }.map(\.id)
        targets.merge(try await effectiveTargets(missing, on: day)) { _, last in last }
        let records = Dictionary(result.items.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
        return try ids.compactMap { id in
            guard let record = records[id] else { return nil }
            return (record, try self.dayHistory(record, on: day, value: index.values[id] ?? 0, target: targets[id]))
        }
    }
    public func habitDetail(_ id: String, on day: DayKey) async throws -> (HabitRecord, HabitHistory)? {
        guard let record: HabitRecord = try await record("habits", id: id) else { return nil }
        let entries: RecordPage<HabitEntryRecord> = try await listPage("habit_entries", perPage: 1,
            filter: "habit = \(RecordFilters.literal(id)) && day = \(RecordFilters.literal(day.rawValue))")
        let target = record.kind == "number" ? try await effectiveTargets([id], on: day)[id] : nil
        return (record, try dayHistory(record, on: day, value: entries.items.first?.value ?? 0, target: target))
    }
    private func dayHistory(_ record: HabitRecord, on day: DayKey, value: Double, target: Double?) throws -> HabitHistory {
        guard let start = DayKey(rawValue: record.startDay), let kind = HabitKind(rawValue: record.kind),
              value.isFinite, value >= 0, kind == .number || value == 0 || value == 1,
              kind == .check || target.map({ $0.isFinite && $0 > 0 }) == true else { throw PokusError.message("Invalid habit day data.") }
        return HabitHistory(id: HabitWire.identity(record.id), name: record.name, kind: kind, unit: record.unit, startDay: start,
            targets: target.map { [TargetChange(day: day, target: $0)] } ?? [], entries: [day: value])
    }
    public func habitStatistics(through today: DayKey, habit: String? = nil) async throws -> HabitStatistics {
        let filter = habit.map { "id = \(RecordFilters.literal($0))" } ?? ""
        var stream = PageStream<HabitMetadata>(api: self, collection: "habits", filter: filter, fields: "id,kind,startDay")
        var metadata: [String: HabitMetadata] = [:]
        while let record = try await stream.next() {
            guard DayKey(rawValue: record.startDay) != nil, HabitKind(rawValue: record.kind) != nil else { throw PokusError.message("Invalid habit data.") }
            metadata[record.id] = record
        }
        let relation = habit.map { "habit = \(RecordFilters.literal($0))" } ?? ""
        let range = RecordFilters.and([relation, "day <= \(RecordFilters.literal(today.rawValue))"])
        var targets = PageStream<HabitTargetRecord>(api: self, collection: "habit_targets", filter: range, sort: "day,habit,id", fields: "id,habit,day,target")
        var entries = PageStream<HabitEntryRecord>(api: self, collection: "habit_entries", filter: range, sort: "day,habit,id", fields: "id,habit,day,value")
        var nextTarget = try await targets.next(), effective: [String: Double] = [:]
        var runs: [String: CompletionRun] = [:], overall = CompletionRun()
        while let entry = try await entries.next() {
            while let target = nextTarget, target.day <= entry.day {
                guard target.target.isFinite, target.target > 0, DayKey(rawValue: target.day) != nil else { throw PokusError.message("Invalid habit target.") }
                effective[target.habit] = target.target; nextTarget = try await targets.next()
            }
            guard let record = metadata[entry.habit] else { continue }
            guard let day = DayKey(rawValue: entry.day), day.rawValue >= record.startDay,
                  entry.value.isFinite, entry.value >= 0, record.kind == "number" || entry.value == 0 || entry.value == 1 else { throw PokusError.message("Invalid habit entry.") }
            let threshold: Double
            if record.kind == "check" { threshold = 1 }
            else if let target = effective[entry.habit] { threshold = target }
            else { throw PokusError.message("A habit's historical target is missing.") }
            if entry.value >= threshold { runs[entry.habit, default: CompletionRun()].append(day); overall.append(day) }
        }
        let summaries = Dictionary(metadata.keys.map { (HabitWire.identity($0), (runs[$0] ?? CompletionRun()).result(today)) }, uniquingKeysWith: { _, last in last })
        return HabitStatistics(overall: overall.result(today), byID: summaries)
    }
    public func habitActivity(year: Int, today: DayKey, habit: String? = nil) async throws -> HabitActivityYear {
        guard let first = DayKey(rawValue: String(format: "%04d-01-01", year)), let last = DayKey(rawValue: String(format: "%04d-12-31", year)) else { throw PokusError.message("Invalid year.") }
        var stream = PageStream<HabitRecord>(api: self, collection: "habits", filter: habit.map { "id = \(RecordFilters.literal($0))" } ?? "", fields: "id,name,kind,unit,startDay")
        var records: [HabitRecord] = []
        while let record = try await stream.next() {
            guard DayKey(rawValue: record.startDay) != nil, HabitKind(rawValue: record.kind) != nil else { throw PokusError.message("Invalid habit data.") }
            records.append(record)
        }
        let relation = habit.map { "habit = \(RecordFilters.literal($0))" } ?? ""
        let range = RecordFilters.and([relation, "day >= \(RecordFilters.literal(first.rawValue)) && day <= \(RecordFilters.literal(min(last, today).rawValue))"])
        var entries = PageStream<HabitEntryRecord>(api: self, collection: "habit_entries", filter: range, sort: "day,habit,id", fields: "id,habit,day,value")
        var targetStream = PageStream<HabitTargetRecord>(api: self, collection: "habit_targets", filter: range, sort: "day,habit,id", fields: "id,habit,day,target")
        let baselineIDs = records.filter { $0.kind == "number" && $0.startDay <= first.rawValue }.map(\.id)
        var effective = try await effectiveTargets(baselineIDs, on: first), target = try await targetStream.next()
        let byID = Dictionary(records.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
        var completed: [DayKey: Int] = [:], individualEntries: [DayKey: Double] = [:], individualTargets: [TargetChange] = []
        if let habit, let baseline = effective[habit] { individualTargets.append(TargetChange(day: first, target: baseline)) }
        while let entry = try await entries.next() {
            while let revision = target, revision.day <= entry.day {
                guard let day = DayKey(rawValue: revision.day), revision.target.isFinite, revision.target > 0 else { throw PokusError.message("Invalid habit target.") }
                effective[revision.habit] = revision.target
                if revision.habit == habit { individualTargets.append(TargetChange(day: day, target: revision.target)) }
                target = try await targetStream.next()
            }
            guard let record = byID[entry.habit], let day = DayKey(rawValue: entry.day), entry.day >= record.startDay,
                  entry.value.isFinite, entry.value >= 0, record.kind == "number" || entry.value == 0 || entry.value == 1 else { throw PokusError.message("Invalid habit activity.") }
            let threshold = record.kind == "check" ? 1 : effective[entry.habit]
            guard let threshold else { throw PokusError.message("A habit's historical target is missing.") }
            if entry.value >= threshold { completed[day, default: 0] += 1 }
            if entry.habit == habit { individualEntries[day] = entry.value }
        }
        while let revision = target {
            guard let day = DayKey(rawValue: revision.day), revision.target.isFinite, revision.target > 0 else { throw PokusError.message("Invalid habit target.") }
            if revision.habit == habit { individualTargets.append(TargetChange(day: day, target: revision.target)) }
            target = try await targetStream.next()
        }
        var progress: [DayKey: DayProgress] = [:]
        let starts = try records.map { record -> DayKey in
            guard let day = DayKey(rawValue: record.startDay) else { throw PokusError.message("Invalid habit start date.") }; return day
        }.sorted()
        var eligible = 0
        for day in DayKey.days(from: first, through: last) {
            while eligible < starts.count && starts[eligible] <= day { eligible += 1 }
            progress[day] = DayProgress(completed: completed[day] ?? 0, total: eligible)
        }
        var individual: HabitHistory?
        if let record = records.first, habit != nil, let kind = HabitKind(rawValue: record.kind), let start = DayKey(rawValue: record.startDay) {
            individual = HabitHistory(id: HabitWire.identity(record.id), name: record.name, kind: kind, unit: record.unit, startDay: start, targets: individualTargets, entries: individualEntries)
        }
        return HabitActivityYear(year: year, earliest: starts.first ?? today, progress: progress, individual: individual)
    }
}
