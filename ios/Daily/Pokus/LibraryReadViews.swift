import PokusCore
import PokusNetworking
import SwiftUI

struct ReviewSchedule: Sendable {
    let due: Int
    let next: Double?
    static func load(_ api: PocketBaseClient) async throws -> Self {
        async let due = api.count("knowledge", filter: LibraryReadQueries.due, cacheKey: "knowledge-due-count")
        async let next: RecordPage<Knowledge> = api.listPage("knowledge", perPage: 1,
            filter: "status = 'evergreen' && nextReviewAt > \(Int(Date().timeIntervalSince1970 * 1000))", sort: "nextReviewAt,id", fields: LibraryReadQueries.noteFields,
            cacheKey: "knowledge-next-review")
        return try await Self(due: due, next: next.items.first?.nextReviewAt)
    }
}

struct LibraryOverviewSummary: Sendable {
    let captures: Int
    let notes: Int
    let projects: Int
    let unassigned: Int
    let categories: Int
    let due: Int
    let nextReview: Double?
    static func load(_ api: PocketBaseClient) async throws -> Self {
        async let captures = api.count("captures")
        async let notes = api.count("knowledge")
        async let projects = api.count("projects", filter: "isDone = false")
        async let unassigned = api.count("tasks", filter: "project = '' && isDone = false")
        async let categories = api.count("categories")
        async let due = api.count("knowledge", filter: LibraryReadQueries.due, cacheKey: "knowledge-due-count")
        async let next: RecordPage<Knowledge> = api.listPage("knowledge", perPage: 1,
            filter: "status = 'evergreen' && nextReviewAt > \(Int(Date().timeIntervalSince1970 * 1000))", sort: "nextReviewAt,id", fields: LibraryReadQueries.noteFields,
            cacheKey: "knowledge-next-review")
        return try await Self(captures: captures, notes: notes, projects: projects, unassigned: unassigned,
                              categories: categories, due: due, nextReview: next.items.first?.nextReviewAt)
    }
}

enum LibraryReadQueries {
    static var due: String { "status = 'evergreen' && nextReviewAt > 0 && nextReviewAt <= \(Int(Date().timeIntervalSince1970 * 1000))" }
    static let noteFields = "id,title,summary,project,linkedProjects,sources,locator,category,status,reviewStep,nextReviewAt,created,updated"
    static func filedProjects(_ captureID: String, search: String = "") -> RecordQuery<Project> {
        var query = RecordQueries.projects(search: search)
        query.segments = query.segments.map { .init(filter: RecordFilters.and([$0.filter, "captures ?= \(RecordFilters.literal(captureID))"]), sort: $0.sort) }
        return query
    }
    static func searchedCaptures(_ search: String, project: String? = nil, stage: String = "all", kind: String = "all") -> RecordQuery<Capture> {
        var query = RecordQueries.captures(project: project, stage: stage, kind: kind, search: search)
        query.matches = { LibrarySearch.matches([$0.label, $0.note, $0.url ?? "", $0.author ?? "", $0.preview?.description ?? ""], query: search) }
        return query
    }
    static func searchedNotes(_ search: String, project: String? = nil, status: String = "all", category: String = "", source: String? = nil) -> RecordQuery<Knowledge> {
        var query = RecordQueries.knowledge(project: project, status: status, category: category, search: search, source: source)
        query.matches = { LibrarySearch.matches([$0.title, $0.summary, $0.locator, $0.body], query: search) }
        return query
    }
    static func searchedProjects(_ search: String, status: String = "any") -> RecordQuery<Project> {
        var query = RecordQueries.projects(search: search, status: status)
        query.matches = { LibrarySearch.matches([$0.title, $0.description], query: search) }
        return query
    }
    static func searchedTasks(_ search: String, project: String? = nil, status: String = "all", priority: String = "all", category: String = "", sort: String = "smart") -> RecordQuery<FocusTask> {
        var query = RecordQueries.tasks(project: project, status: status, priority: priority, category: category, sort: sort, search: search)
        query.matches = { LibrarySearch.matches([$0.title, $0.description ?? "", $0.categoryName], query: search) }
        return query
    }
    static func captureStage(_ capture: Capture, api: PocketBaseClient) async throws -> CaptureStage {
        if capture.isProcessed { return .processed }
        let count = try await api.count("captures", filter: RecordFilters.and(["id = \(RecordFilters.literal(capture.id))", RecordFilters.inProgress]))
        return count > 0 ? .inProgress : .inbox
    }
}

struct ProjectSummaryView: View {
    let model: PokusModel
    let id: String
    var includeFocus = false
    @State private var summary = ReadState<(completed: Int, total: Int, seconds: Int)>()
    @State private var retry = 0
    var body: some View {
        Group {
            if let value = summary.value {
                Text("\(value.completed) of \(value.total) tasks complete")
                if includeFocus { Text(WorkspaceRules.focused(value.seconds)) }
            } else if summary.isLoading || summary.error == nil { ProgressView("Loading task summary") }
            if let error = summary.error {
                if includeFocus { ReadError(message: error) { retry += 1 } }
                else { Text("Task summary unavailable").font(.caption) }
            }
        }.font(.subheadline).foregroundStyle(.secondary)
            .task(id: "\(model.queryIdentity)-\(id)-\(includeFocus)-\(retry)") { await summary.load { try await model.readAPI().projectSummary(id, includeFocus: includeFocus) } }
    }
}

struct ProjectResourcesView: View {
    let model: PokusModel
    let projectID: String
    @State private var counts = ReadState<(captures: Int, notes: Int)>()
    @State private var retry = 0
    var body: some View {
        NavigationLink { CapturesView(model: model, projectID: projectID) } label: { resource("Captures", count: counts.value?.captures) }.accessibilityIdentifier("projectCaptures")
        NavigationLink { KnowledgeListView(model: model, projectID: projectID) } label: { resource("Notes", count: counts.value?.notes) }.accessibilityIdentifier("projectNotes")
        if let error = counts.error { ReadError(message: error) { retry += 1 } }
        Color.clear.frame(height: 0).accessibilityHidden(true)
            .task(id: "\(model.queryIdentity)-\(projectID)-\(retry)") {
                await counts.load {
                    let api = try model.readAPI(), id = RecordFilters.literal(projectID)
                    async let captures = api.count("captures", filter: "projects_via_captures.id ?= \(id)")
                    async let notes = api.count("knowledge", filter: "project = \(id) || linkedProjects ?= \(id)")
                    return try await (captures, notes)
                }
            }
    }
    private func resource(_ title: String, count: Int?) -> some View {
        HStack { Text(title); Spacer(); Text(count.map { "\($0)" } ?? "Loading…").foregroundStyle(.secondary) }
    }
}
