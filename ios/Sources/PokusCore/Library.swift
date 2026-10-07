import Foundation

public enum CaptureKind: String, Codable, CaseIterable, Sendable {
    case note, article, social, video, drive, book
    public var label: String { rawValue.capitalized }
    public var icon: String {
        switch self { case .note: return "note.text"; case .article: return "doc.text"; case .social: return "bubble.left"; case .video: return "play.rectangle"; case .drive: return "doc"; case .book: return "book" }
    }
}
public struct LinkPreview: Codable, Sendable {
    public var title: String?
    public var description: String?
    public var image: String?
    public var siteName: String?
    public var author: String?
}
public struct Capture: Codable, Identifiable, Sendable {
    public var id: String
    public var kind: CaptureKind
    public var url: String?
    public var title: String
    public var note: String
    public var author: String?
    public var preview: LinkPreview?
    public var isProcessed: Bool
    public var reminderAt: Double
    public var reminderDone: Bool
    public var created: String
    public var updated: String
    private enum CodingKeys: String, CodingKey { case id, kind, url, title, note, author, preview, isProcessed, reminderAt, reminderDone, created, updated }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id); kind = try c.decode(CaptureKind.self, forKey: .kind)
        url = try c.decodeIfPresent(String.self, forKey: .url); title = try c.decode(String.self, forKey: .title)
        note = try c.decode(String.self, forKey: .note); author = try c.decodeIfPresent(String.self, forKey: .author)
        preview = try c.decodeIfPresent(LinkPreview.self, forKey: .preview); isProcessed = try c.decode(Bool.self, forKey: .isProcessed)
        reminderAt = try c.decodeIfPresent(Double.self, forKey: .reminderAt) ?? 0
        reminderDone = try c.decodeIfPresent(Bool.self, forKey: .reminderDone) ?? false
        created = try c.decode(String.self, forKey: .created); updated = try c.decode(String.self, forKey: .updated)
    }
    public var label: String {
        if !title.isEmpty { return title }
        if let title = preview?.title, !title.isEmpty { return title }
        if !note.isEmpty { return String(WorkspaceRules.plainText(note).prefix(160)) }
        return url.flatMap { URL(string: $0)?.host } ?? "Untitled capture"
    }
}
public enum KnowledgeStatus: String, Codable, CaseIterable, Sendable { case draft, evergreen }
public struct Knowledge: Codable, Identifiable, Sendable {
    public var id: String
    public var title: String
    public var summary: String
    public var body: String
    public var project: String
    public var linkedProjects: [String]
    public var sources: [String]
    public var locator: String
    public var category: String
    public var status: KnowledgeStatus
    public var reviewStep: Int
    public var nextReviewAt: Double
    public var created: String
    public var updated: String
    public func isDue(at date: Date = .now) -> Bool { status == .evergreen && nextReviewAt > 0 && nextReviewAt <= date.timeIntervalSince1970 * 1000 }
    private enum CodingKeys: String, CodingKey { case id, title, summary, body, project, linkedProjects, sources, locator, category, status, reviewStep, nextReviewAt, created, updated }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id); title = try c.decode(String.self, forKey: .title)
        summary = try c.decode(String.self, forKey: .summary); body = try c.decodeIfPresent(String.self, forKey: .body) ?? ""
        project = try c.decode(String.self, forKey: .project); linkedProjects = try c.decode([String].self, forKey: .linkedProjects)
        sources = try c.decode([String].self, forKey: .sources); locator = try c.decode(String.self, forKey: .locator)
        category = try c.decode(String.self, forKey: .category); status = try c.decode(KnowledgeStatus.self, forKey: .status)
        reviewStep = try c.decode(Int.self, forKey: .reviewStep); nextReviewAt = try c.decode(Double.self, forKey: .nextReviewAt)
        created = try c.decode(String.self, forKey: .created); updated = try c.decode(String.self, forKey: .updated)
    }
}
public struct LibraryWorkspace: Codable, Sendable {
    public var captures: [Capture] = []
    public var knowledge: [Knowledge] = []
    public init() {}
}
public enum LibraryRules {
    public static func parseCaptureText(_ text: String) -> (kind: CaptureKind, url: URL?, note: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = captureURL(trimmed) { return (captureKind(for: url), url, "") }
        var url: URL?
        if let range = trimmed.range(of: #"(?i)\bhttps?://[^\s<>"']+"#, options: .regularExpression) {
            var link = String(trimmed[range])
            while let last = link.last, ").,;!?".contains(last) { link.removeLast() }
            url = captureURL(link)
        }
        return (url.map { captureKind(for: $0) } ?? .note, url, trimmed)
    }
    public static func captureURL(_ text: String) -> URL? {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.contains(where: { $0.isWhitespace }) else { return nil }
        if value.contains(":") { return safeURL(value) }
        guard value.range(of: #"^[^/]+\.[a-zA-Z]{2,}(/|$)"#, options: .regularExpression) != nil else { return nil }
        return safeURL("https://" + value)
    }
    public static func captureKind(for url: URL) -> CaptureKind {
        let host = url.host?.lowercased() ?? ""
        func matches(_ domains: [String]) -> Bool { domains.contains { host == $0 || host.hasSuffix("." + $0) } }
        if matches(["youtube.com", "youtu.be", "youtube-nocookie.com"]) { return .video }
        if matches(["drive.google.com", "docs.google.com"]) { return .drive }
        if matches(["x.com", "twitter.com", "instagram.com", "threads.net", "threads.com", "tiktok.com", "linkedin.com", "facebook.com", "fb.watch", "reddit.com", "bsky.app", "mastodon.social", "pinterest.com", "tumblr.com"]) { return .social }
        return .article
    }
    public static func safeURL(_ text: String) -> URL? {
        guard let url = URL(string: text), ["https", "http"].contains(url.scheme?.lowercased() ?? ""),
              url.host?.isEmpty == false, url.user == nil, url.password == nil else { return nil }
        return url
    }
    public static func review(step: Int, remembered: Bool, now: Date = .now, calendar: Calendar = .autoupdatingCurrent) -> (step: Int, next: Double) {
        let intervals = [1, 3, 7, 21, 60]
        let nextStep = remembered ? min(max(0, step) + 1, intervals.count - 1) : 0
        let day = calendar.date(byAdding: .day, value: intervals[nextStep], to: calendar.startOfDay(for: now))!
        return (nextStep, day.timeIntervalSince1970 * 1000)
    }
    public static func firstReview(now: Date = .now) -> Double { review(step: 0, remembered: false, now: now).next }
    public static func captureStage(_ capture: Capture, projects: [Project], notes: [Knowledge]) -> String {
        if capture.isProcessed { return "processed" }
        return projects.contains { ($0.captures ?? []).contains(capture.id) } || notes.contains { $0.sources.contains(capture.id) } ? "in_progress" : "inbox"
    }
}
