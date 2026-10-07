import DailyCore
import Foundation
import Observation
import PokusCore
import PokusNetworking

struct AccountScope: Equatable, Sendable {
    let owner: String
    let generation: UUID
}

@MainActor @Observable
final class FocusTimerState {
    var timer = TimerSnapshot()
    var isSaving = false
}

@MainActor @Observable
final class WorkspaceState {
    var value = Workspace()
    func apply(_ record: WorkspaceRecord) {
        switch record {
        case .project(let project): value.projects.upsert(project)
        case .task(let task): value.tasks.upsert(task)
        case .category(let category): value.categories.upsert(category)
        default: break
        }
        value.projects = Array(value.projects.prefix(25))
        value.tasks = Array(value.tasks.prefix(25))
        value.categories = Array(value.categories.prefix(25))
    }
}

@MainActor @Observable
final class LibraryState {
    var value = LibraryWorkspace()
    func apply(_ record: WorkspaceRecord) {
        switch record {
        case .capture(let capture): value.captures.upsert(capture)
        case .knowledge(let note): value.knowledge.upsert(note)
        default: break
        }
        value.captures = Array(value.captures.prefix(25))
        value.knowledge = Array(value.knowledge.prefix(25))
    }
}

@MainActor @Observable
final class HabitsState {
    private(set) var value = HabitWorkspace()
    private(set) var histories: [HabitHistory] = []
    private(set) var byID: [UUID: HabitHistory] = [:]
    private(set) var recordsByID: [UUID: HabitRecord] = [:]
    private var recentIDs: [UUID] = []

    func replace(_ value: HabitWorkspace, histories: [HabitHistory]) {
        self.value = value
        self.histories = histories
        recentIDs = histories.map(\.id)
        byID = Dictionary(histories.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
        recordsByID = Dictionary(value.habits.map { (HabitWire.identity($0.id), $0) }, uniquingKeysWith: { _, last in last })
    }
    func remember(_ record: HabitRecord, history: HabitHistory) {
        recentIDs.removeAll { $0 == history.id }; recentIDs.append(history.id)
        recordsByID[history.id] = record; byID[history.id] = history
        histories.upsert(history)
        while recentIDs.count > 100 { forget(recentIDs[0]) }
    }
    func forget(_ id: UUID) { recentIDs.removeAll { $0 == id }; recordsByID[id] = nil; byID[id] = nil; histories.removeAll { $0.id == id } }
    func apply(_ mutations: [HabitMutation]) {
        for mutation in mutations {
            switch mutation {
            case .habit(let record):
                let id = HabitWire.identity(record.id), previous = byID[id]
                guard let start = DayKey(rawValue: record.startDay), let kind = HabitKind(rawValue: record.kind) else { continue }
                remember(record, history: HabitHistory(id: id, name: record.name, kind: kind, unit: record.unit, startDay: start,
                    targets: previous?.targets ?? [], entries: previous?.entries ?? [:]))
            case .entry(let entry):
                let id = HabitWire.identity(entry.habit)
                if let old = byID[id], let record = recordsByID[id], let day = DayKey(rawValue: entry.day) {
                    var entries = old.entries; entries[day] = entry.value
                    remember(record, history: HabitHistory(id: id, name: old.name, kind: old.kind, unit: old.unit, startDay: old.startDay, targets: old.targets, entries: entries))
                }
            case .target(let target):
                let id = HabitWire.identity(target.habit)
                if let old = byID[id], let record = recordsByID[id], let day = DayKey(rawValue: target.day) {
                    var targets = old.targets.filter { $0.day != day }; targets.append(TargetChange(day: day, target: target.target))
                    remember(record, history: HabitHistory(id: id, name: old.name, kind: old.kind, unit: old.unit, startDay: old.startDay, targets: targets, entries: old.entries))
                }
            case .deleted(let id): forget(HabitWire.identity(id))
            }
        }
    }
}

extension Array where Element: Identifiable {
    mutating func upsert(_ record: Element) {
        if let index = firstIndex(where: { $0.id == record.id }) { self[index] = record }
        else { insert(record, at: 0) }
    }
}
