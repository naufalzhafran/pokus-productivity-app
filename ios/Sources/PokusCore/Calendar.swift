import DailyCore
import Foundation

public enum CalendarItemKind: String, Sendable, CaseIterable {
    case project, task, reminder
}

public struct CalendarItem: Identifiable, Equatable, Sendable {
    public let kind: CalendarItemKind
    public let sourceID: String
    public let title: String
    public let day: DayKey?
    public let reminderAt: Double?
    public let isComplete: Bool
    public let projectID: String
    public let projectTitle: String
    public let inheritsProjectDate: Bool
    public var id: String { "\(kind.rawValue):\(sourceID)" }

    public init(kind: CalendarItemKind, sourceID: String, title: String, day: DayKey?, reminderAt: Double? = nil,
                isComplete: Bool, projectID: String = "", projectTitle: String = "", inheritsProjectDate: Bool = false) {
        self.kind = kind; self.sourceID = sourceID; self.title = title; self.day = day; self.reminderAt = reminderAt
        self.isComplete = isComplete; self.projectID = projectID; self.projectTitle = projectTitle
        self.inheritsProjectDate = inheritsProjectDate
    }
}

public struct CalendarWindow: Sendable {
    public let items: [CalendarItem]
    public let habits: [HabitRecord]
    public init(items: [CalendarItem], habits: [HabitRecord]) { self.items = items; self.habits = habits }
}

public enum CalendarProjection {
    public static func project(_ project: Project) -> CalendarItem? {
        guard !project.isDone else { return nil }
        return CalendarItem(kind: .project, sourceID: project.id, title: project.title,
                            day: day(project.dueDate), isComplete: project.lifecycle == .completed,
                            projectID: project.id, projectTitle: project.title)
    }

    public static func task(_ task: FocusTask) -> CalendarItem? {
        guard task.project.isEmpty || !task.projectIsArchived else { return nil }
        let ownDay = day(task.dueDate)
        let inheritedDay = task.project.isEmpty ? nil : day(task.projectDueDate)
        return CalendarItem(kind: .task, sourceID: task.id, title: task.title,
                            day: ownDay ?? inheritedDay, isComplete: task.isDone,
                            projectID: task.project, projectTitle: task.projectTitle,
                            inheritsProjectDate: ownDay == nil && inheritedDay != nil)
    }

    public static func reminder(_ capture: Capture, timeZone: TimeZone = .autoupdatingCurrent) -> CalendarItem? {
        guard capture.reminderAt.isFinite, capture.reminderAt > 0,
              capture.reminderAt <= 253_402_300_799_000 else { return nil }
        let date = Date(timeIntervalSince1970: capture.reminderAt / 1000)
        return CalendarItem(kind: .reminder, sourceID: capture.id, title: capture.label,
                            day: DayKey(date: date, timeZone: timeZone), reminderAt: capture.reminderAt,
                            isComplete: capture.reminderDone)
    }

    public static func sorted(_ items: [CalendarItem]) -> [CalendarItem] {
        items.sorted {
            if $0.day != $1.day { return ($0.day?.rawValue ?? "9999-99-99") < ($1.day?.rawValue ?? "9999-99-99") }
            if $0.isComplete != $1.isComplete { return !$0.isComplete }
            if $0.reminderAt != $1.reminderAt { return ($0.reminderAt ?? 0) < ($1.reminderAt ?? 0) }
            let comparison = $0.title.localizedStandardCompare($1.title)
            return comparison == .orderedSame ? $0.id < $1.id : comparison == .orderedAscending
        }
    }

    public static func startOfDay(_ day: DayKey, timeZone: TimeZone) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let parts = day.rawValue.split(separator: "-").compactMap { Int($0) }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))!
    }

    private static func day(_ value: String?) -> DayKey? { value.flatMap(DayKey.init(rawValue:)) }
}
