import Foundation

public enum ProjectStatus: String, Codable, CaseIterable, Sendable {
    case planned, active, onHold = "on_hold", completed
    public var label: String { self == .onHold ? "On hold" : rawValue.capitalized }
    public init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        let raw = try value.decode(String.self)
        if raw.isEmpty { self = .active }
        else if let status = Self(rawValue: raw) { self = status }
        else { throw DecodingError.dataCorruptedError(in: value, debugDescription: "Unknown project status: \(raw)") }
    }
}
public enum Priority: String, Codable, CaseIterable, Sendable {
    case none, low, medium, high, urgent
    public var rank: Int { Self.allCases.firstIndex(of: self)! }
    public init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        let raw = try value.decode(String.self)
        if raw.isEmpty { self = .none }
        else if let priority = Self(rawValue: raw) { self = priority }
        else { throw DecodingError.dataCorruptedError(in: value, debugDescription: "Unknown task priority: \(raw)") }
    }
}
public struct Project: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var title: String
    public var description: String
    public var isDone: Bool
    public var status: ProjectStatus?
    public var dueDate: String?
    public var created: String
    public var captures: [String]?
    public var lifecycle: ProjectStatus { status ?? .active }
    private enum CodingKeys: String, CodingKey { case id, title, description, isDone, status, dueDate, created, captures }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id); title = try c.decode(String.self, forKey: .title)
        description = try c.decodeIfPresent(String.self, forKey: .description) ?? ""
        isDone = try c.decode(Bool.self, forKey: .isDone); status = try c.decodeIfPresent(ProjectStatus.self, forKey: .status)
        dueDate = try c.decodeIfPresent(String.self, forKey: .dueDate); created = try c.decode(String.self, forKey: .created)
        captures = try c.decodeIfPresent([String].self, forKey: .captures)
    }
}
public struct FocusTask: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var title: String
    public var description: String?
    public var isDone: Bool
    public var focusedSeconds: Int
    public var project: String
    public var priority: Priority?
    public var category: String?
    public var dueDate: String?
    public var created: String
    public var projectTitle = ""
    public var projectDueDate: String?
    public var projectIsArchived = false
    public var categoryName = ""
    private enum CodingKeys: String, CodingKey { case id, title, description, isDone, focusedSeconds, project, priority, category, dueDate, created, expand }
    private struct RelatedLabel: Codable { var title: String?; var name: String?; var dueDate: String?; var isDone: Bool? }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id); title = try c.decode(String.self, forKey: .title)
        description = try c.decodeIfPresent(String.self, forKey: .description); isDone = try c.decode(Bool.self, forKey: .isDone)
        focusedSeconds = try c.decode(Int.self, forKey: .focusedSeconds); project = try c.decode(String.self, forKey: .project)
        priority = try c.decodeIfPresent(Priority.self, forKey: .priority); category = try c.decodeIfPresent(String.self, forKey: .category)
        dueDate = try c.decodeIfPresent(String.self, forKey: .dueDate)
        created = try c.decode(String.self, forKey: .created)
        let related = try c.decodeIfPresent([String: RelatedLabel].self, forKey: .expand)
        projectTitle = related?["project"]?.title ?? ""; categoryName = related?["category"]?.name ?? ""
        projectDueDate = related?["project"]?.dueDate; projectIsArchived = related?["project"]?.isDone ?? false
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id); try c.encode(title, forKey: .title); try c.encodeIfPresent(description, forKey: .description)
        try c.encode(isDone, forKey: .isDone); try c.encode(focusedSeconds, forKey: .focusedSeconds); try c.encode(project, forKey: .project)
        try c.encodeIfPresent(priority, forKey: .priority); try c.encodeIfPresent(category, forKey: .category); try c.encode(created, forKey: .created)
        try c.encodeIfPresent(dueDate, forKey: .dueDate)
        if !projectTitle.isEmpty || projectDueDate != nil || projectIsArchived || !categoryName.isEmpty {
            try c.encode(["project": RelatedLabel(title: projectTitle, dueDate: projectDueDate, isDone: projectIsArchived),
                          "category": RelatedLabel(name: categoryName)], forKey: .expand)
        }
    }
}
public struct FocusCategory: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var color: String
}
public struct Account: Codable, Equatable, Sendable {
    public var id: String
    public var email: String?
    public var name: String?
    public init(id: String, email: String? = nil, name: String? = nil) {
        self.id = id; self.email = email; self.name = name
    }
}
public struct Authentication: Codable, Sendable {
    public var token: String
    public var record: Account
    public init(token: String, record: Account) { self.token = token; self.record = record }
    public var isValid: Bool {
        let segments = token.split(separator: ".")
        guard segments.count == 3 else { return false }
        var encoded = String(segments[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
        guard let data = Data(base64Encoded: encoded),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let expiry = json["exp"] as? Double else { return false }
        return expiry > Date().timeIntervalSince1970
    }
}
public struct Workspace: Codable, Sendable {
    public var projects: [Project] = []
    public var tasks: [FocusTask] = []
    public var categories: [FocusCategory] = []
    public var history: [FocusSession] = []
    public init() {}
}
public enum PokusError: LocalizedError {
    case message(String)
    public var errorDescription: String? { switch self { case .message(let text): return text } }
}
public enum WorkspaceRules {
    public static func normalizeTitle(_ text: String) -> String {
        text.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }
    public static func validateTitle(_ text: String, maximum: Int, original: String? = nil) throws -> String {
        let normalized = normalizeTitle(text)
        guard !normalized.isEmpty else { throw PokusError.message("Enter a title.") }
        if text == original { return text }
        guard normalized.utf16.count <= maximum else { throw PokusError.message("Keep the title to \(maximum) characters or fewer.") }
        return normalized
    }
    public static func paragraphHTML(_ text: String) -> String {
        guard !text.isEmpty else { return "" }
        let escaped = text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
        return escaped.components(separatedBy: .newlines).map { "<p>\($0)</p>" }.joined()
    }
    public static func plainText(_ html: String) -> String {
        HTMLText.decode(html)
    }
    public static func dayKey(_ date: Date = .now) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .autoupdatingCurrent
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!)
    }
    public static func dueSoon(_ project: Project, now: Date = .now) -> Bool {
        guard !project.isDone, project.lifecycle != .completed, let day = project.dueDate, !day.isEmpty else { return false }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .autoupdatingCurrent
        let limit = calendar.date(byAdding: .day, value: 7, to: now)!
        return day <= dayKey(limit)
    }
    public static func focused(_ seconds: Int) -> String {
        let minutes = max(0, seconds) / 60
        return minutes < 60 ? "\(minutes)m focused" : "\(minutes / 60)h \(minutes % 60)m focused"
    }
}
