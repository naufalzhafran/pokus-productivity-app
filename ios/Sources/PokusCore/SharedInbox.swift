import DailyCore
import Foundation

/// The App Group the app, the Share extension, and the widget share.
public enum PokusAppGroup {
    public static let identifier = "group.com.centaurwarrunner.Daily"
    public static var container: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    }
    public static var defaults: UserDefaults? { UserDefaults(suiteName: identifier) }
}

/// Something shared from another app, waiting for Pokus to save it as a capture.
public struct SharedCapture: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var text: String
    public var created: Date
    public init(id: String = FocusSession.makeID(), text: String, created: Date = .now) {
        self.id = id; self.text = text; self.created = created
    }
    /// A shared page usually arrives as a URL plus its title; keep both, link last so it's detected.
    public static func text(url: URL?, text: String?) -> String {
        let note = text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard let url else { return note }
        let link = url.absoluteString
        if note.isEmpty || note == link { return link }
        return note.contains(link) ? note : "\(note)\n\(link)"
    }
}

/// A folder of shared items. The Share extension adds files; the app saves each as a capture
/// through its offline-first replica, then removes it. Each item is its own file, so a crash
/// mid-import never loses or duplicates another item, and the capture ID makes retries idempotent.
public struct SharedCaptureInbox: Sendable {
    public let directory: URL
    public init(directory: URL) { self.directory = directory }
    public init?() {
        guard let container = PokusAppGroup.container else { return nil }
        directory = container.appendingPathComponent("SharedCaptures", isDirectory: true)
    }

    public func add(_ item: SharedCapture) throws {
        guard !item.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .millisecondsSince1970
        try encoder.encode(item).write(to: file(item.id), options: .atomic)
    }

    /// Oldest first. Unreadable files are skipped and left for inspection.
    public func pending() -> [SharedCapture] {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .millisecondsSince1970
        return files.filter { $0.pathExtension == "json" }
            .compactMap { try? decoder.decode(SharedCapture.self, from: Data(contentsOf: $0)) }
            .sorted { $0.created == $1.created ? $0.id < $1.id : $0.created < $1.created }
    }

    public func remove(_ id: String) { try? FileManager.default.removeItem(at: file(id)) }

    private func file(_ id: String) -> URL {
        let safe = id.filter { $0.isASCII && ($0.isLetter || $0.isNumber) }
        return directory.appendingPathComponent("\(safe.isEmpty ? "item" : safe).json")
    }
}

/// What the Home Screen widget shows: today's focus and any running session.
public struct FocusWidgetSnapshot: Codable, Equatable, Sendable {
    public var day: String
    public var todaySeconds: Int
    public var deadline: Date?
    public var paused: Bool
    public var remainingSeconds: Int
    public init(day: DayKey, todaySeconds: Int, deadline: Date? = nil, paused: Bool = false, remainingSeconds: Int = 0) {
        self.day = day.rawValue; self.todaySeconds = todaySeconds; self.deadline = deadline
        self.paused = paused; self.remainingSeconds = remainingSeconds
    }
    public static let key = "pokus.widgetSnapshot"

    /// Today's total, or zero once the saved day has passed.
    public func todaySeconds(on today: DayKey) -> Int { day == today.rawValue ? todaySeconds : 0 }
    /// A running session that hasn't reached its deadline yet.
    public func isRunning(at now: Date) -> Bool { paused || (deadline.map { $0 > now } ?? false) }

    public static func read(from defaults: UserDefaults?) -> FocusWidgetSnapshot? {
        guard let data = defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(Self.self, from: data)
    }
    public func write(to defaults: UserDefaults?) {
        guard let defaults, let data = try? JSONEncoder().encode(self) else { return }
        defaults.set(data, forKey: Self.key)
    }
}
