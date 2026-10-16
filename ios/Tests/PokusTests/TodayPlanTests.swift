import DailyCore
import Foundation
import PokusCore
import PokusNetworking
import Testing

private let today = DayKey(rawValue: "2026-10-16")!

private func planTask(_ id: String, due: String = "", effort: String? = nil, priority: String = "", isDone: Bool = false,
                      project: String = "", projectDue: String = "", archived: Bool = false) throws -> FocusTask {
    var json: [String: Any] = ["id": id, "title": id, "isDone": isDone, "focusedSeconds": 0, "project": project,
                               "priority": priority, "dueDate": due, "created": "2026-10-01"]
    if let effort { json["effort"] = effort }
    if !project.isEmpty { json["expand"] = ["project": ["title": "Launch", "dueDate": projectDue, "isDone": archived]] }
    return try JSONDecoder().decode(FocusTask.self, from: JSONSerialization.data(withJSONObject: json))
}

private func ids(_ day: PlanDay) -> [String] { day.entries.map(\.task.id) }

@Suite struct TodayPlanTests {
    @Test func effortDecodesLenientlyAndEncodesWhenSet() throws {
        #expect(try planTask("a", effort: "").effort == nil)
        #expect(try planTask("a", effort: "huge").effort == nil)
        #expect(try planTask("a").effort == nil)
        let large = try planTask("a", effort: "large")
        #expect(large.effort == .large)
        let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(large)) as? [String: Any]
        #expect(encoded?["effort"] as? String == "large")
    }

    @Test func largeTaskDueInThreeDaysStartsToday() throws {
        let plan = TodayPlan.planDays([try planTask("big", due: "2026-10-19", effort: "large")], today: today)
        #expect(ids(plan[0]) == ["big"])
        #expect(plan[0].entries[0].reason == .early)
        #expect(plan[0].used == 4)
        #expect(TodayPlan.label(plan[0].entries[0], on: today) == "Due Mon · start early")
    }

    @Test func smallTaskDueTomorrowWaitsForItsDay() throws {
        let plan = TodayPlan.planDays([try planTask("small", due: "2026-10-17", effort: "small")], today: today)
        #expect(plan[0].entries.isEmpty)
        #expect(ids(plan[1]) == ["small"])
        #expect(plan[1].entries[0].reason == .due)
        #expect(TodayPlan.label(plan[1].entries[0], on: plan[1].day) == "Due today")
    }

    @Test func unsetEffortCountsAsSmall() throws {
        let plan = TodayPlan.planDays([try planTask("plain", due: "2026-10-16")], today: today)
        #expect(plan[0].used == 1)
        #expect(plan[0].entries[0].cost == 1)
    }

    @Test func urgentWidensTheWindow() throws {
        // Small and urgent: two lead days, so a task due Sunday starts Friday.
        let urgent = TodayPlan.planDays([try planTask("u", due: "2026-10-18", priority: "urgent")], today: today)
        #expect(ids(urgent[0]) == ["u"])
        #expect(TodayPlan.label(urgent[0].entries[0], on: today) == "Due Sun · start early")
        let plain = TodayPlan.planDays([try planTask("p", due: "2026-10-18")], today: today)
        #expect(plain[0].entries.isEmpty)
        #expect(ids(plain[2]) == ["p"])
    }

    @Test func capacitySpillsToNextDayButNeverPastTheDueDate() throws {
        let tasks = [try planTask("a", due: "2026-10-19", effort: "large"), try planTask("b", due: "2026-10-19", effort: "large"),
                     try planTask("c", due: "2026-10-19", effort: "large")]
        let plan = TodayPlan.planDays(tasks, today: today)
        #expect(ids(plan[0]) == ["a"])
        #expect(ids(plan[1]) == ["b"])
        #expect(ids(plan[2]) == ["c"])
        #expect(plan[2].entries[0].reason == .early)
        #expect(TodayPlan.label(plan[0].entries[0], on: today) == "Due Mon · start early")
        #expect(TodayPlan.label(plan[2].entries[0], on: plan[2].day) == "Due tomorrow · start early")

        // Four large tasks: the last can't fit before Monday, so it lands on its due date.
        let crowded = TodayPlan.planDays(tasks + [try planTask("d", due: "2026-10-19", effort: "large")], today: today)
        #expect(ids(crowded[3]) == ["d"])
        #expect(crowded[3].entries[0].reason == .due)
        #expect(crowded.dropFirst(4).allSatisfy { $0.entries.isEmpty })
    }

    @Test func mustDoOverCapacityIsReported() throws {
        let tasks = [try planTask("late", due: "2026-10-13", effort: "large"), try planTask("now", due: "2026-10-16", effort: "large")]
        let plan = TodayPlan.planDays(tasks, today: today)
        #expect(ids(plan[0]) == ["late", "now"])
        #expect(plan[0].used == 8)
        #expect(plan[0].capacity == 6)
        #expect(plan[0].used > plan[0].capacity)
        #expect(plan[0].entries[0].reason == .overdue)
        #expect(TodayPlan.label(plan[0].entries[0], on: today) == "3 days late")
        #expect(plan.dropFirst().allSatisfy { $0.entries.isEmpty })
    }

    @Test func undatedHighPriorityFillsTodayOnly() throws {
        let tasks = [try planTask("urgent", priority: "urgent"), try planTask("high", priority: "high"),
                     try planTask("medium", priority: "medium"), try planTask("none")]
        let plan = TodayPlan.planDays(tasks, today: today)
        #expect(ids(plan[0]) == ["urgent", "high"])
        #expect(plan[0].entries.allSatisfy { $0.reason == .filler })
        #expect(TodayPlan.label(plan[0].entries[0], on: today) == "Urgent, no date")
        #expect(TodayPlan.label(plan[0].entries[1], on: today) == "High priority, no date")
        #expect(plan.dropFirst().allSatisfy { $0.entries.isEmpty })

        // A full day leaves no room for filler, and it doesn't come back tomorrow.
        let full = TodayPlan.planDays([try planTask("big", due: "2026-10-16", effort: "large"),
                                       try planTask("mid", due: "2026-10-16", effort: "medium"),
                                       try planTask("urgent", priority: "urgent")], today: today)
        #expect(ids(full[0]) == ["big", "mid"])
        #expect(full.allSatisfy { !ids($0).contains("urgent") })
    }

    @Test func doneAndArchivedProjectTasksAreExcluded() throws {
        let tasks = [try planTask("done", due: "2026-10-16", isDone: true),
                     try planTask("archived", project: "p", projectDue: "2026-10-16", archived: true),
                     try planTask("inherited", project: "q", projectDue: "2026-10-16")]
        let plan = TodayPlan.planDays(tasks, today: today)
        #expect(ids(plan[0]) == ["inherited"])
        #expect(plan[0].entries[0].due == today)
    }

    @Test func farDueDatesUseTheDate() throws {
        let plan = TodayPlan.planDays([try planTask("far", due: "2026-10-24", effort: "large", priority: "urgent")], today: today, capacity: 6)
        let day = try #require(plan.first { !$0.entries.isEmpty })
        #expect(day.day.rawValue == "2026-10-19")
        #expect(TodayPlan.label(day.entries[0], on: day.day) == "Due Sat · start early")
        let early = PlanEntry(task: day.entries[0].task, due: DayKey(rawValue: "2026-10-30"), reason: .early, cost: 4)
        #expect(TodayPlan.label(early, on: today) == "Due Oct 30 · start early")
    }

    @Test func planQueriesMatchDueOverdueAndUndatedHighPriority() throws {
        func row(_ due: String, project: String = "", priority: String = "", isDone: Bool = false) -> [String: JSONValue] {
            ["dueDate": .string(due), "project": .string(project), "priority": .string(priority), "isDone": .bool(isDone)]
        }
        let tables: RecordTables = [
            "projects": ["p": ["dueDate": .string("2026-10-20"), "isDone": .bool(false)],
                         "gone": ["dueDate": .string("2026-10-20"), "isDone": .bool(true)]],
            "tasks": ["late": row("2026-10-01"), "soon": row("2026-10-29"), "later": row("2026-10-30"),
                      "inherited": row("", project: "p"), "archived": row("", project: "gone"), "done": row("2026-10-16", isDone: true),
                      "urgent": row("", priority: "urgent"), "high": row("", priority: "high"), "low": row("", priority: "low"),
                      "datedUrgent": row("2026-11-30", priority: "urgent")]
        ]
        let queries = RecordQueries.calendarPlanTasks(through: today.adding(days: 13))
        func matching(_ query: RecordQuery<FocusTask>) -> Set<String> {
            let filter = RecordFilter.parse(query.segments[0].filter)
            return Set(tables["tasks"]!.filter { filter.matches($0.value, collection: "tasks", tables: tables) }.keys)
        }
        #expect(matching(queries.dated) == ["late", "soon", "inherited"])
        #expect(matching(queries.undated) == ["urgent", "high"])
        #expect(queries.dated.fields.contains("effort"))
    }
}
