import Foundation
import PokusCore

extension RecordQueries {
    /// Unarchived projects in progress, for shortcuts such as Library's recent projects.
    public static let activeProjectsFilter = "isDone = false && (status = 'active' || status = '')"
}

extension PocketBaseClient {
    /// Active, unarchived projects, the most recently changed first.
    public func recentProjects(limit: Int = 5) async throws -> [Project] {
        let page: RecordPage<Project> = try await listPage("projects", perPage: max(1, limit), filter: RecordQueries.activeProjectsFilter,
            sort: "-updated,id", fields: "id,title,isDone,status,dueDate,created")
        return page.items
    }

    /// Whether the account has nothing yet: no projects, tasks, captures, or saved focus sessions.
    public func isWorkspaceEmpty() async throws -> Bool {
        for collection in ["projects", "tasks", "captures"] {
            if try await count(collection) > 0 { return false }
        }
        // Sorted by end time, so the device copy of recent sessions can answer.
        let sessions: RecordPage<RecordID> = try await listPage("pomodoro_sessions", perPage: 1, filter: "mode = 'complete'",
            sort: "-lastTick,id", fields: "id")
        return sessions.items.isEmpty
    }
}

/// One JSON file with everything the account keeps: projects, tasks, categories, captures,
/// notes, habits with their targets and check-ins, and completed focus sessions.
public enum WorkspaceExport {
    public struct Part: Sendable {
        public let key: String
        public let collection: String
        public let filter: String
        public let sort: String
    }
    public static let version = 1
    public static let parts: [Part] = [
        Part(key: "projects", collection: "projects", filter: "", sort: "created,id"),
        Part(key: "tasks", collection: "tasks", filter: "", sort: "created,id"),
        Part(key: "categories", collection: "categories", filter: "", sort: "name,id"),
        Part(key: "captures", collection: "captures", filter: "", sort: "created,id"),
        Part(key: "notes", collection: "knowledge", filter: "", sort: "created,id"),
        Part(key: "habits", collection: "habits", filter: "", sort: "created,id"),
        Part(key: "habitTargets", collection: "habit_targets", filter: "", sort: "day,id"),
        Part(key: "habitEntries", collection: "habit_entries", filter: "", sort: "day,id"),
        Part(key: "focusSessions", collection: "pomodoro_sessions", filter: "mode = 'complete'", sort: "-lastTick,id")
    ]
    /// Server bookkeeping that means nothing outside PocketBase.
    private static let omittedFields: Set<String> = ["collectionId", "collectionName", "expand"]

    /// Reads every record through `api` (the device copy when it has them) and returns pretty-printed JSON.
    /// Completed sessions saved on this device but not yet synced are included too.
    public static func data(from api: PocketBaseClient, account: Account, unsyncedSessions: [FocusSession] = [],
                            exportedAt: Date = .now) async throws -> Data {
        var document: [String: JSONValue] = [
            "format": .string("pokus-export"),
            "version": .number(Double(version)),
            "exportedAt": .string(ISO8601DateFormatter().string(from: exportedAt)),
            "account": .object(["id": .string(account.id), "email": .string(account.email ?? ""), "name": .string(account.name ?? "")])
        ]
        for part in parts {
            try Task.checkCancellation()
            var rows: [[String: JSONValue]] = try await api.list(part.collection, filter: part.filter, sort: part.sort)
            if part.collection == "pomodoro_sessions" {
                let saved = Set(rows.compactMap { row -> String? in if case .string(let id)? = row["id"] { return id } else { return nil } })
                for session in unsyncedSessions where session.mode == .complete && !saved.contains(session.id) {
                    let encoded = try JSONDecoder().decode([String: JSONValue].self, from: JSONEncoder().encode(session))
                    rows.append(encoded)
                }
                rows.sort { lastTick($0) > lastTick($1) }
            }
            document[part.key] = .array(rows.map { .object($0.filter { !omittedFields.contains($0.key) }) })
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(JSONValue.object(document))
    }

    /// A file name such as "Pokus export 2026-10-09.json", dated in the device's time zone.
    public static func fileName(exportedAt: Date = .now) -> String {
        "Pokus export \(WorkspaceRules.dayKey(exportedAt)).json"
    }

    private static func lastTick(_ row: [String: JSONValue]) -> Double {
        if case .number(let value)? = row["lastTick"] { return value }
        return 0
    }
}
