import DailyCore
import Foundation
import PokusCore
import PokusNetworking

/// An isolated, in-memory transport used only with explicit UI-test launch arguments.
actor UITestPocketBase {
    private var records: [String: [[String: JSONValue]]] = [:]
    private var failedWrite = false
    init() {
        records["projects"] = [["id": .string("testproject0001"), "title": .string("Test project"), "description": .string("<p>Project description</p>"), "isDone": .bool(false), "status": .string("active"), "captures": .array([.string("testcapture0001")]), "created": .string("2026-01-01")]]
        records["captures"] = [["id": .string("testcapture0001"), "kind": .string("article"), "url": .string("https://example.com"), "title": .string("Test capture"), "note": .string("<p>Source notes</p>"), "isProcessed": .bool(false), "created": .string("2026-01-01"), "updated": .string("2026-01-01")]]
        records["knowledge"] = [["id": .string("testknowledge01"), "title": .string("Test knowledge"), "summary": .string("Recall this idea"), "body": .string("<p>Knowledge body</p>"), "project": .string("testproject0001"), "linkedProjects": .array([]), "sources": .array([.string("testcapture0001")]), "locator": .string("Page 2"), "category": .string(""), "status": .string("evergreen"), "reviewStep": .number(0), "nextReviewAt": .number(1), "created": .string("2026-01-01"), "updated": .string("2026-01-01")]]
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-calendar") {
            let today = DayKey().rawValue
            var inherited = Self.defaults("tasks")
            inherited["id"] = .string("calendartask001")
            inherited["title"] = .string("Calendar inherited task")
            inherited["project"] = .string("testproject0001")
            var completed = Self.defaults("tasks")
            completed["id"] = .string("calendartask002")
            completed["title"] = .string("Calendar completed task")
            completed["dueDate"] = .string(today)
            completed["isDone"] = .bool(true)
            records["tasks"] = [inherited, completed]
            records["habits"] = [
                ["id": .string("calendarhabit01"), "name": .string("Calendar check-in"), "kind": .string("check"), "unit": .string(""), "startDay": .string(today)],
                ["id": .string("calendarhabit02"), "name": .string("Calendar pages"), "kind": .string("number"), "unit": .string("pages"), "startDay": .string(today)]
            ]
            records["habit_targets"] = [["id": .string(HabitWire.dailyID("habit_targets", habit: "calendarhabit02", day: today)),
                "habit": .string("calendarhabit02"), "day": .string(today), "target": .number(5)]]
            records["habit_entries"] = [["id": .string(HabitWire.dailyID("habit_entries", habit: "calendarhabit02", day: today)),
                "habit": .string("calendarhabit02"), "day": .string(today), "value": .number(2)]]
        }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-many-records") {
            for index in 1...60 {
                var row = Self.defaults("knowledge")
                row["id"] = .string(String(format: "pagednote%06d", index))
                row["title"] = .string(String(format: "Paged note %02d", index))
                row["body"] = .string("<p>Page boundary fixture</p>")
                row["created"] = .string(String(format: "2026-01-%02d", 1 + index % 28))
                records["knowledge", default: []].append(row)
            }
        }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-many-tasks") {
            for index in 1...120 {
                var row = Self.defaults("tasks")
                row["id"] = .string(String(format: "projecttask%04d", index))
                row["title"] = .string(String(format: "Project task %03d", index))
                row["project"] = .string("testproject0001")
                row["priority"] = .string("none")
                row["isDone"] = .bool(index > 100)
                records["tasks", default: []].append(row)
            }
        }
    }
    func respond(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let parts = request.url!.path.split(separator: "/").map(String.init)
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("-ui-testing"), arguments.contains("-ui-testing-offline-library"),
           request.httpMethod == "GET", parts.contains("records"), !parts.contains("pomodoro_sessions") {
            throw URLError(.notConnectedToInternet)
        }
        if arguments.contains("-ui-testing"), request.httpMethod != "GET", parts.contains("records") || parts.last == "batch" {
            if parts.contains("records"), arguments.contains("-ui-testing-delayed-save") { try await Task.sleep(for: .seconds(5)) }
            if arguments.contains("-ui-testing-fail-write"), !failedWrite {
                failedWrite = true
                return (Data(#"{"message":"Test save failed. Try again."}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 500, httpVersion: nil, headerFields: nil)!)
            }
        }
        if arguments.contains("-ui-testing"), arguments.contains("-ui-testing-delay-library"), request.httpMethod == "GET", parts.contains("captures") || parts.contains("knowledge") {
            try await Task.sleep(for: .seconds(10))
        }
        var result: JSONValue = .object([:])
        var status = 200
        if parts.last == "batch", let body = request.httpBody,
           case .array(let operations) = try JSONDecoder().decode([String: JSONValue].self, from: body)["requests"] {
            var responses: [JSONValue] = []
            for operation in operations {
                guard case .object(let item) = operation, case .string(let path) = item["url"], case .string(let method) = item["method"] else { continue }
                var nested = URLRequest(url: URL(string: path, relativeTo: request.url!)!)
                nested.httpMethod = method; nested.httpBody = try JSONEncoder().encode(item["body"])
                let (data, response) = try await respond(nested)
                responses.append(.object(["status": .number(Double(response.statusCode)), "body": try JSONDecoder().decode(JSONValue.self, from: data)]))
            }
            result = .array(responses)
        } else if parts.last == "auth-refresh" {
            let claims = Data(#"{"exp":4102444800}"#.utf8).base64EncodedString().replacingOccurrences(of: "=", with: "")
            result = .object(["token": .string("test.\(claims).test"), "record": .object(["id": .string("uitestaccount"), "name": .string("Test account")])])
        } else if parts.count >= 4, parts[1] == "collections" {
            let collection = parts[2]
            if request.httpMethod == "GET" {
                var list = records[collection] ?? []
                let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
                func value(_ name: String) -> String { query.first { $0.name == name }?.value ?? "" }
                let predicate = RecordFilter.parse(value("filter")), index = BackRelationIndex()
                let tables = records.mapValues { rows in
                    Dictionary(rows.map { row -> (String, [String: JSONValue]) in
                        if case .string(let id)? = row["id"] { return (id, row) } else { return ("", row) }
                    }, uniquingKeysWith: { _, last in last })
                }
                list = list.filter { predicate.matches($0, collection: collection, tables: tables, index: index) }
                if parts.count > 4 {
                    if let record = list.first(where: { $0["id"] == .string(parts[4]) }) { result = .object(record) }
                    else { status = 404 }
                } else {
                    RecordFilter.sort(&list, by: value("sort"))
                    let total = list.count, page = max(1, Int(value("page")) ?? 1), perPage = max(1, Int(value("perPage")) ?? 25)
                    let lower = min(total, (page - 1) * perPage)
                    list = Array(list[lower..<min(total, lower + perPage)])
                    if collection == "tasks", !value("expand").isEmpty {
                        list = list.map { original in
                            var row = original, expand: [String: JSONValue] = [:]
                            if let project = records["projects"]?.first(where: { $0["id"] == row["project"] }) {
                                expand["project"] = .object(["title": project["title"] ?? .string(""), "dueDate": project["dueDate"] ?? .string(""), "isDone": project["isDone"] ?? .bool(false)])
                            }
                            if let category = records["categories"]?.first(where: { $0["id"] == row["category"] }) { expand["category"] = .object(["name": category["name"] ?? .string("")]) }
                            row["expand"] = .object(expand); return row
                        }
                    }
                    let fields = Set(value("fields").split(separator: ",").map { String($0).components(separatedBy: ".")[0] })
                    if !fields.isEmpty { list = list.map { row in row.filter { fields.contains($0.key) } } }
                    result = .object(["items": .array(list.map(JSONValue.object)), "page": .number(Double(page)), "perPage": .number(Double(perPage)),
                        "totalItems": .number(Double(total)), "totalPages": .number(Double(max(1, (total + perPage - 1) / perPage)))])
                }
            } else {
                var fields = try request.httpBody.map { try JSONDecoder().decode([String: JSONValue].self, from: $0) } ?? [:]
                let id: String
                if parts.count > 4 { id = parts[4] }
                else if case .string(let value) = fields["id"] { id = value }
                else { id = FocusSession.makeID() }
                if request.httpMethod == "DELETE" { records[collection]?.removeAll { $0["id"] == .string(id) } }
                else {
                    var list = records[collection] ?? []
                    let index = list.firstIndex { $0["id"] == .string(id) }
                    var record = index.map { list[$0] } ?? Self.defaults(collection)
                    fields["id"] = .string(id)
                    for (key, value) in fields {
                        if key.hasSuffix("+") || key.hasSuffix("-"), case .array(let changes) = value {
                            let field = String(key.dropLast())
                            let existing: [JSONValue]; if case .array(let values) = record[field] { existing = values } else { existing = [] }
                            record[field] = .array(key.hasSuffix("+") ? existing + changes.filter { !existing.contains($0) } : existing.filter { !changes.contains($0) })
                        } else { record[key] = value }
                    }
                    if let index { list[index] = record } else { list.append(record) }
                    records[collection] = list; result = .object(record)
                }
            }
        }
        return (try JSONEncoder().encode(result), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
    private static func defaults(_ collection: String) -> [String: JSONValue] {
        var record: [String: JSONValue] = ["created": .string("2026-01-01"), "updated": .string("2026-01-01")]
        for field in ["title", "description", "summary", "body", "project", "category", "locator", "url", "note", "author", "dueDate"] { record[field] = .string("") }
        record["isDone"] = .bool(false); record["isProcessed"] = .bool(false); record["focusedSeconds"] = .number(0)
        record["reminderAt"] = .number(0); record["reminderDone"] = .bool(false)
        record["kind"] = .string("note"); record["status"] = .string(collection == "knowledge" ? "draft" : "active")
        for field in ["sources", "linkedProjects", "captures"] { record[field] = .array([]) }
        record["reviewStep"] = .number(0); record["nextReviewAt"] = .number(0)
        return record
    }
}
