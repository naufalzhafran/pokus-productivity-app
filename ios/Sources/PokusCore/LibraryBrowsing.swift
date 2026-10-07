import Foundation

public enum CaptureStage: String, CaseIterable, Sendable {
    case all, inbox, inProgress = "in_progress", processed
    public var label: String {
        switch self { case .all: "All captures"; case .inbox: "Inbox"; case .inProgress: "In progress"; case .processed: "Processed" }
    }
}

public struct CaptureFilter: Equatable, Sendable {
    public var stage: CaptureStage = .all
    public var kind: CaptureKind? = nil
    public init() {}
    public var isActive: Bool { stage != .all || kind != nil }
}

public enum NoteReviewFilter: String, CaseIterable, Sendable {
    case all, unscheduled, scheduled
    public var label: String { switch self { case .all: "All notes"; case .unscheduled: "Not in review"; case .scheduled: "Included in review" } }
    public var status: String { switch self { case .all: "all"; case .unscheduled: "draft"; case .scheduled: "evergreen" } }
}

public struct NoteFilter: Equatable, Sendable {
    public var review: NoteReviewFilter = .all
    public var category = ""
    public init() {}
    public var isActive: Bool { review != .all || !category.isEmpty }
}

public enum LibrarySearch {
    public static func matches(_ values: [String], query: String) -> Bool {
        let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return query.isEmpty || WorkspaceRules.plainText(values.joined(separator: " ")).localizedStandardContains(query)
    }
}

public struct LibraryReviewSession: Sendable {
    public let noteIDs: [String]
    public private(set) var reviewedIDs: Set<String> = []
    public init(noteIDs: [String]) {
        var seen: Set<String> = []
        self.noteIDs = noteIDs.filter { seen.insert($0).inserted }
    }
    public var reviewedCount: Int { reviewedIDs.count }
    public var totalCount: Int { noteIDs.count }
    public func nextID(skipping: Set<String> = []) -> String? {
        noteIDs.first { !reviewedIDs.contains($0) && !skipping.contains($0) }
    }
    public mutating func confirm(_ id: String) {
        if noteIDs.contains(id) { reviewedIDs.insert(id) }
    }
}
