import Foundation
import PokusCore

public struct RecordID: Decodable, Sendable { public let id: String }
public struct RecordSegment: Sendable {
    public var filter: String
    public var sort: String
    public init(filter: String = "", sort: String = "-created,id") { self.filter = filter; self.sort = sort }
}
public struct RecordQuery<T: Decodable & Identifiable & Sendable>: Sendable where T.ID == String {
    public var collection: String
    public var segments: [RecordSegment]
    public var fields: String
    public var expand: String = ""
    /// Stable operation identity for queries whose current-time cutoff changes between reads.
    public var cacheKey: String?
    public var matches: @Sendable (T) -> Bool = { _ in true }
    public var trim: @Sendable (T) -> T = { $0 }
    public var alphabeticalTitle: (@Sendable (T) -> String)?
    public init(_ collection: String, segments: [RecordSegment] = [RecordSegment()], fields: String = "") {
        self.collection = collection; self.segments = segments; self.fields = fields
    }
    func pageCacheKey(segment: Int, page: Int, perPage: Int = 25) -> String? {
        cacheKey.map { key in
            ([key, collection, String(segment), String(page), String(perPage), segments[segment].sort, fields, expand])
                .joined(separator: "\u{1F}")
        }
    }
}
public struct BrowseBatch<T: Sendable>: Sendable {
    public let items: [T]
    public let hasMore: Bool
    public init(items: [T], hasMore: Bool) { self.items = items; self.hasMore = hasMore }
}
/// The cursor advances only after an entire batch succeeds, so retries never skip rows.
public actor RecordReader<T: Decodable & Identifiable & Sendable> where T.ID == String {
    private let api: PocketBaseClient
    private let query: RecordQuery<T>
    private var segment = 0, page = 1, offset = 0
    private var orderedIDs: [String]?
    private var indexOffset = 0
    private var pending: BrowseBatch<T>?
    private var firstPages: [Int: Task<RecordPage<T>, Error>] = [:]
    public init(api: PocketBaseClient, query: RecordQuery<T>) { self.api = api; self.query = query }
    deinit { for task in firstPages.values { task.cancel() } }
    public func next() async throws -> BrowseBatch<T> {
        do { return try await nextBatch() }
        catch {
            if Task.isCancelled { discardFirstPages { _ in true } }
            throw error
        }
    }
    private func nextBatch() async throws -> BrowseBatch<T> {
        if let pending { return pending }
        if let title = query.alphabeticalTitle {
            let batch = try await alphabetical(title); pending = batch; return batch
        }
        var nextSegment = segment, nextPage = page, nextOffset = offset
        var items: [T] = []
        while items.count < 25 && nextSegment < query.segments.count {
            try Task.checkCancellation()
            let result = try await readPage(segment: nextSegment, page: nextPage)
            var position = nextOffset
            while position < result.items.count && items.count < 25 {
                let item = result.items[position]; position += 1
                if query.matches(item) { items.append(query.trim(item)) }
            }
            if position < result.items.count { nextOffset = position }
            else if nextPage < result.totalPages { nextPage += 1; nextOffset = 0 }
            else { nextSegment += 1; nextPage = 1; nextOffset = 0 }
        }
        segment = nextSegment; page = nextPage; offset = nextOffset
        discardFirstPages { $0 < segment || ($0 == segment && page > 1) }
        let batch = BrowseBatch(items: items, hasMore: segment < query.segments.count)
        pending = batch; return batch
    }
    public func accept() { pending = nil }
    private func readPage(segment: Int, page: Int) async throws -> RecordPage<T> {
        let part = query.segments[segment]
        guard page == 1, query.segments.count > 1 else {
            return try await api.listPage(query.collection, page: page, filter: part.filter,
                sort: part.sort, fields: query.fields, expand: query.expand,
                cacheKey: query.pageCacheKey(segment: segment, page: page))
        }
        if firstPages[segment] == nil {
            let window = segment..<min(segment + 4, query.segments.count)
            discardFirstPages { !window.contains($0) }
            let missing = window.filter { firstPages[$0] == nil }
            let api = api, query = query
            for index in missing {
                let part = query.segments[index]
                firstPages[index] = Task.detached(priority: Task.currentPriority) {
                    try await api.listPage(query.collection, filter: part.filter,
                        sort: part.sort, fields: query.fields, expand: query.expand,
                        cacheKey: query.pageCacheKey(segment: index, page: 1))
                }
            }
        }
        guard let request = firstPages[segment] else { throw CancellationError() }
        let requests = Array(firstPages.values)
        do {
            let result = try await withTaskCancellationHandler { try await request.value } onCancel: {
                for task in requests { task.cancel() }
            }
            try Task.checkCancellation()
            return result
        } catch {
            firstPages[segment] = nil
            if Task.isCancelled { discardFirstPages { _ in true } }
            throw error
        }
    }
    private func discardFirstPages(where shouldDiscard: (Int) -> Bool) {
        for index in Array(firstPages.keys) where shouldDiscard(index) {
            firstPages.removeValue(forKey: index)?.cancel()
        }
    }
    private func alphabetical(_ title: @Sendable (T) -> String) async throws -> BrowseBatch<T> {
        if orderedIDs == nil {
            var index: [(id: String, title: String)] = []
            for (segment, part) in query.segments.enumerated() {
                var page = 1
                while true {
                    let result: RecordPage<T> = try await api.listPage(query.collection, page: page, perPage: 100,
                        filter: part.filter, sort: part.sort, fields: query.fields, expand: query.expand,
                        cacheKey: query.pageCacheKey(segment: segment, page: page, perPage: 100))
                    index += result.items.filter(query.matches).map { ($0.id, title($0)) }
                    if page >= result.totalPages { break }; page += 1
                }
            }
            try Task.checkCancellation()
            orderedIDs = index.sorted {
                let order = $0.title.localizedCaseInsensitiveCompare($1.title)
                return order == .orderedSame ? $0.id < $1.id : order == .orderedAscending
            }.map(\.id)
        }
        let ids = orderedIDs ?? []
        var position = indexOffset, rows: [T] = []
        while rows.count < 25 && position < ids.count {
            let slice = Array(ids[position..<min(position + 25 - rows.count, ids.count)])
            let result: RecordPage<T> = try await api.listPage(query.collection, perPage: 25,
                filter: RecordFilters.ids(slice), fields: query.fields, expand: query.expand)
            let byID = Dictionary(result.items.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
            rows += slice.compactMap { byID[$0] }.filter(query.matches).map(query.trim)
            position += slice.count
        }
        indexOffset = position
        return BrowseBatch(items: rows, hasMore: position < ids.count)
    }
}
public enum RecordFilters {
    public static func literal(_ value: String) -> String { "'" + value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'") + "'" }
    public static func and(_ filters: [String]) -> String { filters.filter { !$0.isEmpty }.map { "(\($0))" }.joined(separator: " && ") }
    public static func ids(_ ids: [String]) -> String { ids.isEmpty ? "id = ''" : ids.map { "id = \(literal($0))" }.joined(separator: " || ") }
    public static let inProgress = "isProcessed = false && (projects_via_captures.id ?!= '' || knowledge_via_sources.id ?!= '')"
}
public enum RecordQueries {
    public static func projects(search: String = "", status: String = "any", ids: [String]? = nil) -> RecordQuery<Project> {
        let state: String
        switch status {
        case "any": state = ""
        case "archived": state = "isDone = true"
        case "all": state = "isDone = false"
        case "due":
            let end = WorkspaceRules.dayKey(Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date())
            state = "isDone = false && status != 'completed' && dueDate != '' && dueDate <= \(RecordFilters.literal(end))"
        case "active": state = "isDone = false && (status = 'active' || status = '')"
        default: state = "isDone = false && status = \(RecordFilters.literal(status))"
        }
        let base = RecordFilters.and([state, ids.map(RecordFilters.ids) ?? ""])
        var query = RecordQuery<Project>("projects", segments: [
            RecordSegment(filter: RecordFilters.and([base, "dueDate != ''"]), sort: "dueDate,-created,id"),
            RecordSegment(filter: RecordFilters.and([base, "dueDate = ''"]), sort: "-created,id")
        ], fields: "id,title,isDone,status,dueDate,created" + (search.isEmpty ? "" : ",description"))
        query.matches = { search.isEmpty || ($0.title + " " + WorkspaceRules.plainText($0.description)).localizedCaseInsensitiveContains(search) }
        query.trim = { var row = $0; row.description = ""; return row }
        return query
    }
    public static func tasks(project: String? = nil, status: String = "open", priority: String = "all", category: String = "",
        sort: String = "smart", search: String = "", timer: Bool = false) -> RecordQuery<FocusTask> {
        let state = status == "all" ? "" : "isDone = \(status == "completed" ? "true" : "false")"
        let base = RecordFilters.and([project.map { "project = \(RecordFilters.literal($0))" } ?? "", state,
            category.isEmpty ? "" : "category = \(RecordFilters.literal(category))"])
        var segments: [RecordSegment] = []
        let bucketed = sort == "smart" || sort == "priority"
        let statuses = sort == "smart" && status == "all" ? ["isDone = false", "isDone = true"] : [""]
        let priorities = priority == "all" ? ["urgent", "high", "medium", "low", "none"] : [priority]
        if bucketed {
            for state in statuses { for rank in priorities {
                let filter = rank == "none" ? "(priority = 'none' || priority = '')" : "priority = \(RecordFilters.literal(rank))"
                segments.append(RecordSegment(filter: RecordFilters.and([base, state, filter])))
            } }
        } else {
            let order = sort == "oldest" ? "created,id" : sort == "focused" ? "-focusedSeconds,-created,id" : "-created,id"
            let rank = priority == "all" ? "" : priority == "none" ? "(priority = 'none' || priority = '')" : "priority = \(RecordFilters.literal(priority))"
            segments = [RecordSegment(filter: RecordFilters.and([base, rank]), sort: order)]
        }
        var query = RecordQuery<FocusTask>("tasks", segments: segments,
            fields: "id,title,isDone,focusedSeconds,project,priority,category,dueDate,created,expand.project.title,expand.project.dueDate,expand.project.isDone,expand.category.name" + (search.isEmpty ? "" : ",description"))
        query.expand = "project,category"
        query.matches = { search.isEmpty || ($0.title + " " + (timer ? $0.projectTitle : WorkspaceRules.plainText($0.description ?? "") + " " + $0.categoryName)).localizedCaseInsensitiveContains(search) }
        query.trim = { var row = $0; row.description = nil; return row }
        if sort == "alphabetical" { query.alphabeticalTitle = { $0.title } }
        return query
    }
    public static func captures(project: String? = nil, stage: String = "all", kind: String = "all", search: String = "", ids: [String]? = nil) -> RecordQuery<Capture> {
        let state = stage == "processed" ? "isProcessed = true" : stage == "in_progress" ? RecordFilters.inProgress : stage == "inbox" ? "isProcessed = false && projects_via_captures.id = '' && knowledge_via_sources.id = ''" : ""
        let filter = RecordFilters.and([state, kind == "all" ? "" : "kind = \(RecordFilters.literal(kind))",
            project.map { "projects_via_captures.id ?= \(RecordFilters.literal($0))" } ?? "", ids.map(RecordFilters.ids) ?? ""])
        var query = RecordQuery<Capture>("captures", segments: [RecordSegment(filter: filter)], fields: "id,kind,url,title,note,author,preview,isProcessed,reminderAt,reminderDone,created,updated")
        query.matches = { search.isEmpty || WorkspaceRules.plainText([$0.label, $0.note, $0.url ?? "", $0.author ?? "", $0.preview?.description ?? ""].joined(separator: " ")).localizedCaseInsensitiveContains(search) }
        query.trim = { var row = $0; row.note = String(WorkspaceRules.plainText(row.note).prefix(160)); return row }
        return query
    }
    public static func knowledge(project: String? = nil, status: String = "all", category: String = "", search: String = "", source: String? = nil,
        due: Bool = false, ids: [String]? = nil) -> RecordQuery<Knowledge> {
        let filters: [String] = [project.map { "project = \(RecordFilters.literal($0)) || linkedProjects ?= \(RecordFilters.literal($0))" } ?? "",
            status == "all" ? "" : "status = \(RecordFilters.literal(status))", category.isEmpty ? "" : "category = \(RecordFilters.literal(category))",
            source.map { "sources ?= \(RecordFilters.literal($0))" } ?? "", ids.map(RecordFilters.ids) ?? ""]
        let filter = RecordFilters.and(filters + [
            due ? "status = 'evergreen' && nextReviewAt > 0 && nextReviewAt <= \(Int(Date().timeIntervalSince1970 * 1000))" : ""])
        var query = RecordQuery<Knowledge>("knowledge", segments: [RecordSegment(filter: filter, sort: due ? "nextReviewAt,id" : "-updated,id")],
            fields: "id,title,summary,project,linkedProjects,sources,locator,category,status,reviewStep,nextReviewAt,created,updated" + (search.isEmpty ? "" : ",body"))
        if due { query.cacheKey = "due-knowledge:\(RecordFilters.and(filters))" }
        query.matches = { search.isEmpty || [$0.title, $0.summary, $0.locator, WorkspaceRules.plainText($0.body)].joined(separator: " ").localizedCaseInsensitiveContains(search) }
        query.trim = { var row = $0; row.body = ""; return row }
        return query
    }
    public static func categories(search: String = "") -> RecordQuery<FocusCategory> {
        var query = RecordQuery<FocusCategory>("categories", segments: [RecordSegment(sort: "name,id")])
        query.matches = { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) }; return query
    }
    public static func history() -> RecordQuery<FocusSession> {
        RecordQuery("pomodoro_sessions", segments: [RecordSegment(filter: "mode = 'complete'", sort: "-lastTick,id")])
    }
}
