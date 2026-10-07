import Foundation
import PokusCore

extension PocketBaseClient {
    public func habits() async throws -> HabitWorkspace {
        async let habits: [HabitRecord] = list("habits", sort: "created,id")
        async let entries: [HabitEntryRecord] = list("habit_entries")
        async let targets: [HabitTargetRecord] = list("habit_targets", sort: "day")
        var result = HabitWorkspace()
        result.habits = try await habits; result.entries = try await entries; result.targets = try await targets
        return result
    }
    public func habitDailyID(_ collection: String, habit: String, day: String) async throws -> String {
        guard habit.count == 15, habit.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }),
              day.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", options: .regularExpression) != nil else { throw PokusError.message("Invalid habit or date.") }
        struct DailyRecord: Decodable { let id: String }
        let records: [DailyRecord] = try await list(collection, filter: "habit = '\(habit)' && day = '\(day)'", limit: 1)
        return records.first?.id ?? HabitWire.dailyID(collection, habit: habit, day: day)
    }
    @discardableResult
    public func habitBatch(_ requests: [(method: String, collection: String, id: String?, fields: [String: JSONValue])]) async throws -> [HabitMutation] {
        struct Response: Decodable { let status: Int; let body: JSONValue }
        let data = try await request("api/batch", method: "POST", body: ["requests": .array(requests.map { item in
            .object(["method": .string(item.method), "url": .string("/api/collections/\(item.collection)/records" + (item.id.map { "/\($0)" } ?? "")), "body": .object(item.fields)])
        })])
        let responses = try JSONDecoder().decode([Response].self, from: data)
        guard responses.count == requests.count else { throw URLError(.badServerResponse) }
        return try zip(requests, responses).map { item, response in
            guard (200..<300).contains(response.status) else { throw APIError(status: response.status, detail: nil) }
            let body = try JSONEncoder().encode(response.body)
            switch item.collection {
            case "habits": return .habit(try JSONDecoder().decode(HabitRecord.self, from: body))
            case "habit_entries": return .entry(try JSONDecoder().decode(HabitEntryRecord.self, from: body))
            case "habit_targets": return .target(try JSONDecoder().decode(HabitTargetRecord.self, from: body))
            default: throw URLError(.badServerResponse)
            }
        }
    }
}
