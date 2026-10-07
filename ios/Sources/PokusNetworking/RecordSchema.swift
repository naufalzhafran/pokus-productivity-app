import Foundation

/// The parts of `pb_schema.json` the on-device replica needs to behave like PocketBase.
public enum RecordSchema {
    struct Relation: Sendable {
        let collection: String
        let multiple: Bool
        let cascade: Bool
    }

    /// Pulled in this order so related rows usually arrive before rows that point at them.
    public static let replicated = ["categories", "projects", "tasks", "captures", "knowledge",
                                    "habits", "habit_targets", "habit_entries", "pomodoro_sessions"]

    /// Large text kept only for recent, active, or recently opened records.
    public static let heavyFields: [String: Set<String>] = [
        "projects": ["description"], "tasks": ["description"], "captures": ["note"], "knowledge": ["body"]
    ]

    static let relations: [String: [String: Relation]] = [
        "projects": ["captures": Relation(collection: "captures", multiple: true, cascade: false)],
        "tasks": ["project": Relation(collection: "projects", multiple: false, cascade: false),
                  "category": Relation(collection: "categories", multiple: false, cascade: false)],
        "pomodoro_sessions": ["task": Relation(collection: "tasks", multiple: false, cascade: false)],
        "knowledge": ["project": Relation(collection: "projects", multiple: false, cascade: false),
                      "linkedProjects": Relation(collection: "projects", multiple: true, cascade: false),
                      "sources": Relation(collection: "captures", multiple: true, cascade: false),
                      "category": Relation(collection: "categories", multiple: false, cascade: false)],
        "habit_entries": ["habit": Relation(collection: "habits", multiple: false, cascade: true)],
        "habit_targets": ["habit": Relation(collection: "habits", multiple: false, cascade: true)]
    ]

    private static let defaults: [String: [String: JSONValue]] = [
        "categories": ["owner": .string(""), "name": .string(""), "color": .string("")],
        "projects": ["owner": .string(""), "title": .string(""), "description": .string(""), "isDone": .bool(false),
                     "status": .string(""), "dueDate": .string(""), "captures": .array([])],
        "tasks": ["owner": .string(""), "project": .string(""), "title": .string(""), "isDone": .bool(false),
                  "focusedSeconds": .number(0), "description": .string(""), "priority": .string(""),
                  "category": .string(""), "dueDate": .string("")],
        "captures": ["owner": .string(""), "kind": .string(""), "url": .string(""), "title": .string(""), "note": .string(""),
                     "author": .string(""), "isProcessed": .bool(false), "preview": .null, "reminderAt": .number(0),
                     "reminderDone": .bool(false)],
        "knowledge": ["owner": .string(""), "title": .string(""), "summary": .string(""), "body": .string(""),
                      "project": .string(""), "linkedProjects": .array([]), "sources": .array([]), "locator": .string(""),
                      "category": .string(""), "status": .string(""), "reviewStep": .number(0), "nextReviewAt": .number(0)],
        "habits": ["owner": .string(""), "name": .string(""), "kind": .string(""), "unit": .string(""), "startDay": .string("")],
        "habit_entries": ["owner": .string(""), "habit": .string(""), "day": .string(""), "value": .number(0)],
        "habit_targets": ["owner": .string(""), "habit": .string(""), "day": .string(""), "target": .number(0)],
        "pomodoro_sessions": ["owner": .string(""), "task": .string(""), "durationMinutes": .number(0), "mode": .string(""),
                              "remainingSeconds": .number(0), "isActive": .bool(false), "lastTick": .number(0)]
    ]

    static func relation(_ collection: String, field: String) -> String? {
        relations[collection]?[field]?.collection
    }

    static func emptyRecord(_ collection: String) -> [String: JSONValue] { defaults[collection] ?? [:] }

    static func ids(_ value: JSONValue?) -> [String] {
        switch value {
        case .string(let id)? where !id.isEmpty: return [id]
        case .array(let values)?: return values.compactMap { if case .string(let id) = $0, !id.isEmpty { return id } else { return nil } }
        default: return []
        }
    }

    /// PocketBase's `updated` format, which sorts lexicographically in time order.
    public static func timestamp(_ date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second, .nanosecond], from: date)
        return String(format: "%04d-%02d-%02d %02d:%02d:%02d.%03dZ", parts.year!, parts.month!, parts.day!,
                      parts.hour!, parts.minute!, parts.second!, min(999, parts.nanosecond! / 1_000_000))
    }
}
