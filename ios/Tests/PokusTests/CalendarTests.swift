import DailyCore
import Foundation
import PokusCore
import PokusNetworking
import Testing

private func calendarTask(date: String = "", projectDate: String = "2026-10-10", archived: Bool = false, project: String = "project") throws -> FocusTask {
    let json: [String: Any] = ["id": "task", "title": "Write", "isDone": false, "focusedSeconds": 0,
        "project": project, "dueDate": date, "created": "2026-10-01",
        "expand": ["project": ["title": "Launch", "dueDate": projectDate, "isDone": archived]]]
    return try JSONDecoder().decode(FocusTask.self, from: JSONSerialization.data(withJSONObject: json))
}

@Suite struct CalendarTests {
    @Test func taskDateOverridesProjectAndClearingRestoresInheritance() throws {
        var task = try calendarTask(date: "2026-11-02")
        let own = try #require(CalendarProjection.task(task))
        #expect(own.day?.rawValue == "2026-11-02")
        #expect(!own.inheritsProjectDate)
        task.dueDate = ""
        let inherited = try #require(CalendarProjection.task(task))
        #expect(inherited.day?.rawValue == "2026-10-10")
        #expect(inherited.inheritsProjectDate)
        task.projectDueDate = "2026-10-21"
        #expect(CalendarProjection.task(task)?.day?.rawValue == "2026-10-21")
        task.project = ""
        #expect(CalendarProjection.task(task)?.day == nil)
        #expect(CalendarProjection.task(try calendarTask(archived: true)) == nil)
    }

    @Test func legacyModelsDefaultToUnscheduledAndExpandedDatesSurviveEncoding() throws {
        let legacyTask = try JSONDecoder().decode(FocusTask.self, from: Data(#"{"id":"t","title":"Old task","isDone":false,"focusedSeconds":0,"project":"","created":"2026-01-01"}"#.utf8))
        #expect(legacyTask.dueDate == nil)
        #expect(CalendarProjection.task(legacyTask)?.day == nil)
        let legacyCapture = try JSONDecoder().decode(Capture.self, from: Data(#"{"id":"c","kind":"note","title":"Old capture","note":"","isProcessed":true,"created":"2026-01-01","updated":"2026-01-01"}"#.utf8))
        #expect(legacyCapture.reminderAt == 0)
        #expect(!legacyCapture.reminderDone)
        #expect(CalendarProjection.reminder(legacyCapture) == nil)
        let task = try calendarTask(date: "2026-10-11")
        let reopened = try JSONDecoder().decode(FocusTask.self, from: JSONEncoder().encode(task))
        #expect(reopened.dueDate == task.dueDate)
        #expect(reopened.projectDueDate == task.projectDueDate)
        #expect(reopened.projectTitle == task.projectTitle)
    }

    @Test func processedCaptureReminderKeepsIndependentCompletionAndLocalDate() throws {
        var capture = try JSONDecoder().decode(Capture.self, from: Data(#"{"id":"c","kind":"note","title":"Read this","note":"","isProcessed":true,"reminderAt":1791248400000,"reminderDone":false,"created":"2026-01-01","updated":"2026-01-01"}"#.utf8))
        let jakarta = try #require(TimeZone(identifier: "Asia/Jakarta"))
        let utc = try #require(TimeZone(secondsFromGMT: 0))
        let item = try #require(CalendarProjection.reminder(capture, timeZone: jakarta))
        #expect(item.day == DayKey(date: Date(timeIntervalSince1970: capture.reminderAt / 1000), timeZone: jakarta))
        #expect(!item.isComplete)
        capture.reminderDone = true
        #expect(CalendarProjection.reminder(capture, timeZone: utc)?.isComplete == true)
        let saved = try JSONDecoder().decode(Capture.self, from: JSONEncoder().encode(capture))
        #expect(saved.reminderDone && saved.isProcessed)
        #expect(saved.reminderAt == capture.reminderAt)
    }

    @Test func civilDayBoundsRespectDaylightSaving() throws {
        let zone = try #require(TimeZone(identifier: "America/New_York"))
        let spring = try #require(DayKey(rawValue: "2026-03-08"))
        let fall = try #require(DayKey(rawValue: "2026-11-01"))
        #expect(CalendarProjection.startOfDay(spring.adding(days: 1), timeZone: zone).timeIntervalSince(CalendarProjection.startOfDay(spring, timeZone: zone)) == 23 * 3600)
        #expect(CalendarProjection.startOfDay(fall.adding(days: 1), timeZone: zone).timeIntervalSince(CalendarProjection.startOfDay(fall, timeZone: zone)) == 25 * 3600)
    }

    @Test func calendarRangeExhaustsPagesAndUsesExpandedInheritedDates() async throws {
        let server = CalendarPageServer(count: 61)
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        let start = try #require(DayKey(rawValue: "2026-10-01")), end = try #require(DayKey(rawValue: "2026-10-31"))
        let result = try await api.calendarWindow(from: start, through: end, timeZone: TimeZone(secondsFromGMT: 0)!)
        #expect(result.items.count == 61)
        #expect(Set(result.items.map(\.id)).count == 61)
        #expect(result.items.allSatisfy { $0.day?.rawValue == "2026-10-10" && $0.inheritsProjectDate })
        #expect(await server.taskPages == [1, 2, 3])
    }

    @Test func reminderReadExhaustsPagesWithoutLosingReminderFields() async throws {
        let server = CalendarPageServer(count: 53, collection: "captures")
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        let reminders = try await api.calendarReminders()
        #expect(reminders.count == 53)
        #expect(reminders.allSatisfy { $0.reminderAt > 0 && !$0.reminderDone && $0.isProcessed })
    }
}

private actor CalendarPageServer {
    let count: Int
    let collection: String
    var taskPages: [Int] = []
    init(count: Int, collection: String = "tasks") { self.count = count; self.collection = collection }
    func respond(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        let components = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!
        func query(_ name: String) -> String { components.queryItems?.first { $0.name == name }?.value ?? "" }
        let page = Int(query("page")) ?? 1, perPage = Int(query("perPage")) ?? 25
        let matching = components.path.contains("/\(collection)/")
        let total = matching ? count : 0
        let lower = min(total, (page - 1) * perPage), upper = min(total, lower + perPage)
        if matching && collection == "tasks" { taskPages.append(page) }
        let fields = Set(query("fields").split(separator: ",").map { String($0).components(separatedBy: ".")[0] })
        let rows: [[String: Any]] = (lower..<upper).map { index in
            let record: [String: Any]
            if collection == "tasks" {
                record = ["id": "task\(index)", "title": "Task \(index)", "isDone": false, "focusedSeconds": 0,
                    "project": "project", "dueDate": "", "created": "2026-10-01",
                    "expand": ["project": ["title": "Launch", "dueDate": "2026-10-10", "isDone": false]]]
            } else {
                record = ["id": "capture\(index)", "title": "Capture \(index)", "kind": "note", "note": "", "isProcessed": true,
                          "reminderAt": 1_800_000_000_000, "reminderDone": false, "created": "2026-10-01", "updated": "2026-10-01"]
            }
            return fields.isEmpty ? record : record.filter { fields.contains($0.key) }
        }
        let data = try JSONSerialization.data(withJSONObject: ["items": rows, "page": page, "perPage": perPage,
            "totalItems": total, "totalPages": max(1, (total + perPage - 1) / perPage)])
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
}
