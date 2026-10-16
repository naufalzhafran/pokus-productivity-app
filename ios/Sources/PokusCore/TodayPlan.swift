import DailyCore
import Foundation

extension Effort {
    /// Pokus a task is expected to take.
    public var cost: Int { switch self { case .small: 1; case .medium: 2; case .large: 4 } }
    /// Days before the due date a task starts showing up in the plan.
    public var leadDays: Int { switch self { case .small: 0; case .medium: 1; case .large: 3 } }
}

extension Priority {
    /// Extra lead days for higher-priority work.
    public var leadDays: Int { switch self { case .high: 1; case .urgent: 2; default: 0 } }
}

/// `overdue` and `due` are must-do work; `early` starts ahead of its due date; `filler` is undated high-priority work.
public enum PlanReason: String, Sendable {
    case overdue, due, early, filler
}

public struct PlanEntry: Identifiable, Equatable, Sendable {
    public let task: FocusTask
    /// Effective due date, or nil for filler.
    public let due: DayKey?
    public let reason: PlanReason
    public let cost: Int
    public var id: String { task.id }
    public init(task: FocusTask, due: DayKey?, reason: PlanReason, cost: Int) {
        self.task = task; self.due = due; self.reason = reason; self.cost = cost
    }
}

public struct PlanDay: Identifiable, Equatable, Sendable {
    public let day: DayKey
    public let entries: [PlanEntry]
    /// Pokus planned; above `capacity` only when must-do work overflows.
    public let used: Int
    public let capacity: Int
    public var id: String { day.rawValue }
}

/// Matches `web/src/lib/today-plan.ts`. Nothing here is persisted.
public enum TodayPlan {
    public static let defaultCapacity = 6
    public static let capacityRange = 1...12
    public static let days = 14
    public static let capacityKey = "pokus.dailyCapacity"

    /// The task's own due date, or its project's when it has none.
    public static func effectiveDue(_ task: FocusTask) -> DayKey? {
        if let own = task.dueDate.flatMap(DayKey.init(rawValue:)) { return own }
        if let own = task.dueDate, !own.isEmpty { return nil }
        return task.project.isEmpty ? nil : task.projectDueDate.flatMap(DayKey.init(rawValue:))
    }

    private struct Candidate {
        let task: FocusTask
        let due: DayKey?
        let start: DayKey?
        let cost: Int
    }

    private static func precedes(_ a: Candidate, _ b: Candidate) -> Bool {
        let dueA = a.due?.rawValue ?? "9999-99-99", dueB = b.due?.rawValue ?? "9999-99-99"
        if dueA != dueB { return dueA < dueB }
        let priorityA = (a.task.priority ?? .none).rank, priorityB = (b.task.priority ?? .none).rank
        if priorityA != priorityB { return priorityA > priorityB }
        let effortA = (a.task.effort ?? .small).rank, effortB = (b.task.effort ?? .small).rank
        if effortA != effortB { return effortA > effortB }
        let title = a.task.title.localizedCompare(b.task.title)
        if title != .orderedSame { return title == .orderedAscending }
        return a.task.id < b.task.id
    }

    /// Spreads open tasks over `days` days from `today`. Work due on or before a day is always placed on it;
    /// other tasks start once their lead window opens (bigger and higher-priority work opens earlier) and fill the
    /// day up to `capacity` Pokus, otherwise carrying over. Today alone also takes undated high and urgent tasks.
    public static func planDays(_ tasks: [FocusTask], today: DayKey, days: Int = days, capacity: Int = defaultCapacity) -> [PlanDay] {
        var pending: [Candidate] = []
        for task in tasks {
            if task.isDone || (!task.project.isEmpty && task.projectIsArchived) { continue }
            let effort = task.effort ?? .small
            let due = effectiveDue(task)
            let start = due?.adding(days: -(effort.leadDays + (task.priority ?? .none).leadDays))
            pending.append(Candidate(task: task, due: due, start: start, cost: effort.cost))
        }
        pending.sort(by: precedes)

        var plan: [PlanDay] = []
        var placed = Set<String>()
        for index in 0..<max(0, days) {
            let day = today.adding(days: index)
            var entries: [PlanEntry] = []
            var used = 0
            func place(_ candidate: Candidate, _ reason: PlanReason) {
                placed.insert(candidate.task.id)
                entries.append(PlanEntry(task: candidate.task, due: candidate.due, reason: reason, cost: candidate.cost))
                used += candidate.cost
            }
            let open = pending.filter { !placed.contains($0.task.id) }
            for candidate in open {
                if let due = candidate.due, due <= day { place(candidate, due < today ? .overdue : .due) }
            }
            for candidate in open where !placed.contains(candidate.task.id) {
                if let start = candidate.start, start <= day, used + candidate.cost <= capacity { place(candidate, .early) }
            }
            if index == 0 {
                for candidate in open where candidate.due == nil {
                    let priority = candidate.task.priority ?? .none
                    if priority == .high || priority == .urgent, used + candidate.cost <= capacity { place(candidate, .filler) }
                }
            }
            plan.append(PlanDay(day: day, entries: entries, used: used, capacity: capacity))
        }
        return plan
    }

    /// Why a task is on `day`'s plan, such as "Due Fri · start early".
    public static func label(_ entry: PlanEntry, on day: DayKey) -> String {
        if entry.reason == .filler { return entry.task.priority == .urgent ? "Urgent, no date" : "High priority, no date" }
        guard let due = entry.due else { return "" }
        switch entry.reason {
        case .overdue:
            let late = CalendarProjection.days(from: due, to: day)
            return "\(late) \(late == 1 ? "day" : "days") late"
        case .due:
            return due == day ? "Due today" : "Due \(due.formatted("MMM d"))"
        default:
            let ahead = CalendarProjection.days(from: day, to: due)
            let when = ahead == 1 ? "tomorrow" : ahead <= 6 ? weekday(due) : due.formatted("MMM d")
            return "Due \(when) · start early"
        }
    }

    private static func weekday(_ day: DayKey) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return day.date.formatted(Date.FormatStyle(locale: Locale(identifier: "en_US"), calendar: calendar,
                                                   timeZone: calendar.timeZone).weekday(.abbreviated))
    }
}
