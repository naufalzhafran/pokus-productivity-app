import DailyCore
import Foundation
import PokusCore

extension RecordQueries {
    public static func calendarProjects(from start: DayKey, through end: DayKey) -> RecordQuery<Project> {
        calendarProjectQuery("dueDate >= \(RecordFilters.literal(start.rawValue)) && dueDate <= \(RecordFilters.literal(end.rawValue))")
    }

    public static func calendarTasks(from start: DayKey, through end: DayKey) -> RecordQuery<FocusTask> {
        calendarTaskQuery(date: { field in
            "\(field) >= \(RecordFilters.literal(start.rawValue)) && \(field) <= \(RecordFilters.literal(end.rawValue))"
        })
    }

    public static func calendarUnscheduledProjects() -> RecordQuery<Project> {
        calendarProjectQuery("dueDate = '' && status != 'completed'")
    }

    public static func calendarUnscheduledTasks() -> RecordQuery<FocusTask> {
        calendarTaskQuery(date: { "\($0) = ''" }, openOnly: true)
    }

    static func calendarProjectQuery(_ filter: String) -> RecordQuery<Project> {
        RecordQuery("projects", segments: [RecordSegment(filter: RecordFilters.and(["isDone = false", filter]), sort: "dueDate,created,id")],
                    fields: "id,title,isDone,status,dueDate,created")
    }

    static func calendarTaskQuery(date: (String) -> String, openOnly: Bool = false) -> RecordQuery<FocusTask> {
        let effectiveDate = "(dueDate != '' && (\(date("dueDate")))) || (dueDate = '' && ((project = '' && (\(date("dueDate")))) || (project != '' && (\(date("project.dueDate"))))))"
        let filter = RecordFilters.and(["project = '' || project.isDone = false", effectiveDate, openOnly ? "isDone = false" : ""])
        var query = RecordQuery<FocusTask>("tasks", segments: [RecordSegment(filter: filter, sort: "created,id")],
            fields: "id,title,isDone,focusedSeconds,project,priority,category,dueDate,created,expand.project.title,expand.project.dueDate,expand.project.isDone,expand.category.name")
        query.expand = "project,category"
        return query
    }

    static func calendarCaptures(_ filter: String) -> RecordQuery<Capture> {
        RecordQuery("captures", segments: [RecordSegment(filter: filter, sort: "reminderAt,id")],
                    fields: "id,kind,url,title,note,author,preview,isProcessed,reminderAt,reminderDone,created,updated")
    }
}

extension PocketBaseClient {
    public func calendarWindow(from start: DayKey, through end: DayKey, timeZone: TimeZone = .autoupdatingCurrent) async throws -> CalendarWindow {
        guard start <= end else { return CalendarWindow(items: [], habits: []) }
        let lower = Int(CalendarProjection.startOfDay(start, timeZone: timeZone).timeIntervalSince1970 * 1000)
        let upper = Int(CalendarProjection.startOfDay(end.adding(days: 1), timeZone: timeZone).timeIntervalSince1970 * 1000)
        async let projects = calendarRecords(RecordQueries.calendarProjects(from: start, through: end))
        async let tasks = calendarRecords(RecordQueries.calendarTasks(from: start, through: end))
        async let captures = calendarRecords(RecordQueries.calendarCaptures("reminderAt >= \(lower) && reminderAt < \(upper) && reminderAt > 0"))
        async let habits = calendarRecords(RecordQuery<HabitRecord>("habits", segments: [RecordSegment(filter: "startDay <= \(RecordFilters.literal(end.rawValue))", sort: "created,id")], fields: "id,name,kind,unit,startDay"))
        let values = try await (projects, tasks, captures, habits)
        let items = values.0.compactMap(CalendarProjection.project) + values.1.compactMap(CalendarProjection.task)
            + values.2.compactMap { CalendarProjection.reminder($0, timeZone: timeZone) }
        return CalendarWindow(items: CalendarProjection.sorted(items.filter { $0.day.map { $0 >= start && $0 <= end } == true }), habits: values.3)
    }

    public func calendarOverdue(before day: DayKey, timeZone: TimeZone = .autoupdatingCurrent) async throws -> [CalendarItem] {
        let dateFilter = "dueDate != '' && dueDate < \(RecordFilters.literal(day.rawValue)) && status != 'completed'"
        let cutoff = Int(CalendarProjection.startOfDay(day, timeZone: timeZone).timeIntervalSince1970 * 1000)
        async let projects = calendarRecords(RecordQueries.calendarProjectQuery(dateFilter))
        async let tasks = calendarRecords(RecordQueries.calendarTaskQuery(date: { "\($0) != '' && \($0) < \(RecordFilters.literal(day.rawValue))" }, openOnly: true))
        async let captures = calendarRecords(RecordQueries.calendarCaptures("reminderAt > 0 && reminderAt < \(cutoff) && reminderDone = false"))
        let values = try await (projects, tasks, captures)
        return CalendarProjection.sorted(values.0.compactMap(CalendarProjection.project) + values.1.compactMap(CalendarProjection.task)
            + values.2.compactMap { CalendarProjection.reminder($0, timeZone: timeZone) })
    }

    public func calendarUnscheduled() async throws -> [CalendarItem] {
        async let projects = calendarRecords(RecordQueries.calendarUnscheduledProjects())
        async let tasks = calendarRecords(RecordQueries.calendarUnscheduledTasks())
        let values = try await (projects, tasks)
        return CalendarProjection.sorted(values.0.compactMap(CalendarProjection.project) + values.1.compactMap(CalendarProjection.task))
    }

    public func calendarReminders() async throws -> [Capture] {
        try await calendarRecords(RecordQueries.calendarCaptures("reminderAt > 0 && reminderDone = false"))
    }

    private func calendarRecords<T>(_ query: RecordQuery<T>) async throws -> [T] {
        let reader = RecordReader(api: self, query: query)
        var records: [T] = []
        while true {
            let batch = try await reader.next()
            records += batch.items
            await reader.accept()
            if !batch.hasMore { return records }
        }
    }
}
