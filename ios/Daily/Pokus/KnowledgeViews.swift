import PokusCore
import PokusNetworking
import SwiftUI

struct KnowledgeListView: View {
    @Bindable var model: PokusModel
    @Environment(\.dynamicTypeSize) private var typeSize
    var projectID: String? = nil
    @State private var search = ""
    @State private var filter = NoteFilter()
    @State private var showingFilters = false
    @State private var creating = false
    @State private var confirmation: String?
    private var narrowed: Bool { filter.isActive || !search.isEmpty }
    private var status: String { filter.review.status }
    private var queryID: String { "\(projectID ?? "all")-\(status)-\(filter.category)" }
    var body: some View {
        List {
            AccountNotice(model: model)
            LibrarySaveNotice(message: confirmation)
            if filter.isActive { LibraryFilterSummary(text: filter.review.label + (filter.category.isEmpty ? "" : " · Category selected"), active: true) { filter = NoteFilter() } }
            PagedRows(model: model, query: LibraryReadQueries.searchedNotes(search, project: projectID, status: status, category: filter.category), identity: queryID, search: search,
                      emptyTitle: narrowed ? "No matching notes" : "No notes yet", symbol: "text.book.closed",
                      emptyDescription: narrowed ? "Clear your search and filters to see more notes." : "Write what you learn, or create a note from a capture.",
                      emptyActionTitle: narrowed ? "Clear search and filters" : "New note", emptyAction: emptyAction, emptyActionDisabled: !narrowed && !model.canEdit) { note in
                NavigationLink { KnowledgeDetailView(model: model, noteID: note.id) } label: {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(note.title).font(.headline)
                        if !note.summary.isEmpty { Text(note.summary).font(.subheadline).foregroundStyle(.secondary).lineLimit(typeSize.isAccessibilitySize ? 4 : 2) }
                        if note.isDue() { Label("Due for review", systemImage: "arrow.clockwise").font(.caption).foregroundStyle(.secondary) }
                        else if note.status == .evergreen && note.nextReviewAt > 0 { Text("Review \(LibraryDates.review(note.nextReviewAt))").font(.caption).foregroundStyle(.secondary) }
                    }.padding(.vertical, 6)
                }.accessibilityLabel(note.title).accessibilityValue(note.isDue() ? "Due for review" : note.status == .evergreen ? "Included in review" : "Not in review")
            }
        }.id("\(queryID)-\(search)").navigationTitle(projectID == nil ? "Notes" : "Project notes").searchable(text: $search, prompt: "Search notes").refreshable { await model.refresh() }
            .toolbar {
                ToolbarItem(placement: .primaryAction) { Button("New note", systemImage: "plus") { creating = true }.disabled(!model.canEdit) }
                ToolbarItem(placement: .topBarTrailing) { Button("Filter notes", systemImage: filter.isActive ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle") { showingFilters = true } }
            }
            .sheet(isPresented: $creating) { KnowledgeEditorView(model: model, projectID: projectID, onSaved: { _ in confirmation = "Note saved" }) }
            .sheet(isPresented: $showingFilters) {
                LibraryFilterSheet(title: "Filter notes", reset: { filter = NoteFilter() }) {
                    Picker("Review", selection: $filter.review) { ForEach(NoteReviewFilter.allCases, id: \.self) { Text($0.label).tag($0) } }
                    RecordSelectionLink(model: model, kind: .category, title: "Category", selection: $filter.category, none: "All categories")
                }
            }
    }
    private func emptyAction() { if narrowed { search = ""; filter = NoteFilter() } else { creating = true } }
}

struct KnowledgeDetailView: View {
    @Bindable var model: PokusModel
    let noteID: String
    @State private var record = ReadState<Knowledge?>()
    @State private var retry = 0
    @State private var editing = false
    @State private var deleting = false
    @State private var confirmation: String?
    @State private var save = SaveAction()
    @Environment(\.dismiss) private var dismiss
    private var note: Knowledge? { record.value ?? nil }
    var body: some View {
        List {
            AccountNotice(model: model)
            LibrarySaveNotice(message: confirmation)
            if let note {
                Section {
                    Text(note.title).font(.title2.weight(.semibold)).textSelection(.enabled)
                    if !note.summary.isEmpty { Text(note.summary).foregroundStyle(.secondary) }
                    RichDescription(html: note.body)
                }
                if !note.locator.isEmpty || !note.sources.isEmpty {
                    Section("Sources") {
                        if !note.locator.isEmpty { Text(note.locator).foregroundStyle(.secondary) }
                        if !note.sources.isEmpty {
                            PagedRows(model: model, query: RecordQueries.captures(ids: note.sources), identity: note.sources.sorted().joined(separator: ","), emptyTitle: "Sources unavailable", symbol: "tray") { capture in NavigationLink(capture.label) { CaptureDetailView(model: model, captureID: capture.id) } }
                        }
                    }
                }
                let projects = Array(Set(note.linkedProjects + (note.project.isEmpty ? [] : [note.project])))
                if !projects.isEmpty {
                    Section("Projects") {
                        PagedRows(model: model, query: RecordQueries.projects(ids: projects), identity: projects.sorted().joined(separator: ","), emptyTitle: "Projects unavailable", symbol: "folder") { project in
                            NavigationLink { ProjectTasksView(model: model, projectID: project.id) } label: {
                                VStack(alignment: .leading, spacing: 4) { Text(project.title); Text(project.id == note.project ? "Origin project" : "Linked project").font(.caption).foregroundStyle(.secondary) }
                            }
                        }
                    }
                }
                Section("Review") {
                    if note.status == .evergreen {
                        Text(note.isDue() ? "Due for review" : "Included in review")
                        if note.nextReviewAt > 0 { Text("Next review: \(LibraryDates.review(note.nextReviewAt))").foregroundStyle(.secondary) }
                        DisclosureGroup("Review now") {
                            Button("Remembered") { review(note, remembered: true) }.frame(minHeight: 44).disabled(!model.canEdit || save.isSaving)
                            Button("Review sooner") { review(note, remembered: false) }.frame(minHeight: 44).disabled(!model.canEdit || save.isSaving)
                        }
                    } else {
                        Text("Not included in review").foregroundStyle(.secondary)
                        Button("Include in review") { editing = true }.frame(minHeight: 44).disabled(!model.canEdit)
                    }
                }
                if save.isSaving { ProgressView("Saving review") }
            } else if record.isLoading { ProgressView("Loading note") }
            else if record.error == nil && record.value != nil { ContentUnavailableView("Note unavailable", systemImage: "text.book.closed", description: Text("It may have been deleted.")) }
            if let error = record.error { ReadError(message: error) { retry += 1 } }
        }.navigationTitle("Note").navigationBarTitleDisplayMode(.inline).refreshable { await model.refresh() }
            .task(id: "\(model.queryIdentity)-\(noteID)-\(retry)") { await record.load { try await model.readAPI().record("knowledge", id: noteID) } }
            .toolbar {
                if let note {
                    ToolbarItem(placement: .primaryAction) { Button("Edit note", systemImage: "pencil") { editing = true }.disabled(!model.canEdit || save.isSaving) }
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            ShareLink("Share note", item: "# \(note.title)\n\n\(note.summary)\n\n\(WorkspaceRules.plainText(note.body))\n\n\(note.locator)")
                            Button("Delete note", systemImage: "trash", role: .destructive) { deleting = true }.disabled(!model.canEdit || save.isSaving)
                        } label: { Label("Note actions", systemImage: "ellipsis.circle") }
                    }
                }
            }
            .sheet(isPresented: $editing) { if let note { KnowledgeEditorView(model: model, original: note, onSaved: { _ in confirmation = "Note saved" }) } }
            .alert("Delete this note?", isPresented: $deleting) {
                Button("Cancel", role: .cancel) { }
                Button("Delete note", role: .destructive) {
                    save.performAsync {
                        guard await model.write(collection: .knowledge, id: noteID, fields: [:], delete: true) else { throw PokusError.message(model.error ?? "Couldn't delete this note.") }
                    } onSuccess: { dismiss() }
                }
            } message: { Text("Source captures stay in your library.") }.saveAlert(save)
    }
    private func review(_ note: Knowledge, remembered: Bool) {
        let next = LibraryRules.review(step: note.reviewStep, remembered: remembered)
        save.performAsync {
            guard await model.write(collection: .knowledge, id: note.id, fields: ["reviewStep": .number(Double(next.step)), "nextReviewAt": .number(next.next)]) else { throw PokusError.message(model.error ?? "Couldn't save this review.") }
        } onSuccess: { confirmation = "Review saved. Next review \(LibraryDates.review(next.next))." }
    }
}

struct KnowledgeReviewView: View {
    @Bindable var model: PokusModel
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var session: LibraryReviewSession?
    @State private var queue = ReadState<[String]>()
    @State private var record = ReadState<Knowledge?>()
    @State private var schedule = ReadState<ReviewSchedule>()
    @State private var skipped: Set<String> = []
    @State private var restart = 0
    @State private var readRetry = 0
    @State private var revealedID: String?
    @State private var save = SaveAction()
    @Environment(\.dismiss) private var dismiss
    private var currentID: String? { session?.nextID(skipping: skipped) }
    private var current: Knowledge? { guard let note = record.value ?? nil, note.id == currentID else { return nil }; return note }
    var body: some View {
        List {
            AccountNotice(model: model)
            if let session, let note = current {
                Section {
                    Text("\(session.reviewedCount) of \(session.totalCount) reviewed").font(.subheadline).foregroundStyle(.secondary).accessibilityIdentifier("reviewProgress")
                    ProgressView(value: Double(session.reviewedCount), total: Double(max(1, session.totalCount))).accessibilityLabel("Review progress")
                    Text(note.title).font(.title2.weight(.semibold))
                    if revealedID != note.id { Text("Recall what you learned before revealing the note.").foregroundStyle(.secondary) }
                }
                if revealedID == note.id {
                    Section {
                        if !note.summary.isEmpty { Text(note.summary).foregroundStyle(.secondary) }
                        RichDescription(html: note.body)
                        if !note.locator.isEmpty { Text(note.locator).foregroundStyle(.secondary) }
                        NavigationLink("Open note and sources") { KnowledgeDetailView(model: model, noteID: note.id) }
                    }
                }
                Section {
                    DisclosureGroup("How review works") {
                        Text("Remembered notes return after 3, 7, 21, then 60 days. Review sooner starts again at one day.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
            } else if session != nil && currentID != nil {
                if let error = record.error { ReadError(message: error) { readRetry += 1 } }
                else { ProgressView("Loading note") }
            } else if let session {
                if session.totalCount > 0 {
                    ContentUnavailableView("Review complete", systemImage: "checkmark.circle", description: Text("You reviewed \(session.reviewedCount) \(session.reviewedCount == 1 ? "note" : "notes") in this session.")).accessibilityIdentifier("reviewComplete")
                    if !skipped.isEmpty { Text("\(skipped.count) \(skipped.count == 1 ? "note was" : "notes were") removed or no longer due.").font(.footnote).foregroundStyle(.secondary) }
                    Button("Done") { dismiss() }.frame(minHeight: 44)
                } else {
                    ContentUnavailableView("Nothing due", systemImage: "checkmark.circle", description: Text("Include a note in review to revisit it over time."))
                    NavigationLink("Browse notes") { KnowledgeListView(model: model) }
                }
                if let value = schedule.value {
                    if value.due > 0 { Button("Review remaining notes") { restart += 1 }.frame(minHeight: 44) }
                    if let next = value.next { Text("Next review: \(LibraryDates.review(next))").foregroundStyle(.secondary) }
                }
                if let error = schedule.error { ReadError(message: error) { readRetry += 1 } }
            } else if let error = queue.error { ReadError(message: error) { restart += 1 } }
            else { ProgressView("Loading reviews") }
        }.navigationTitle("Review").navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) {
                if let note = current {
                    VStack(spacing: 8) {
                        if save.isSaving { ProgressView("Saving review") }
                        if revealedID == note.id {
                            let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 12)) : AnyLayout(HStackLayout(spacing: 12))
                            layout { responseButtons(note) }
                        } else {
                            Button { revealedID = note.id } label: {
                                Text("Reveal note").frame(maxWidth: .infinity, minHeight: 44)
                            }.buttonStyle(.borderedProminent).accessibilityIdentifier("revealReviewNote")
                        }
                    }.padding().background(.bar)
                }
            }
            .refreshable { await model.refresh() }
            .task(id: "\(model.scope?.generation.uuidString ?? "signedout")-\(restart)") {
                session = nil; skipped = []; revealedID = nil; record.clear(); queue.clear()
                await queue.load {
                    var stream = PageStream<RecordID>(api: try model.readAPI(), collection: "knowledge", filter: LibraryReadQueries.due, sort: "nextReviewAt,id", fields: "id")
                    var ids: [String] = []
                    while let row = try await stream.next() { ids.append(row.id) }
                    return ids
                }
                if let ids = queue.value { session = LibraryReviewSession(noteIDs: ids) }
            }
            .task(id: "\(model.queryIdentity)-\(currentID ?? "none")-\(readRetry)") {
                if let id = currentID {
                    await record.load { try await model.readAPI().record("knowledge", id: id) }
                    if record.error == nil, let result = record.value, result?.isDue() != true { skipped.insert(id) }
                }
                await schedule.load { try await ReviewSchedule.load(model.readAPI()) }
            }.saveAlert(save)
    }
    @ViewBuilder private func responseButtons(_ note: Knowledge) -> some View {
        Button { review(note, remembered: false) } label: {
            Text("Review sooner").frame(maxWidth: .infinity, minHeight: 44)
        }.buttonStyle(.bordered).disabled(!model.canEdit || save.isSaving || record.isLoading)
        Button { review(note, remembered: true) } label: {
            Text("Remembered").frame(maxWidth: .infinity, minHeight: 44)
        }.buttonStyle(.borderedProminent).disabled(!model.canEdit || save.isSaving || record.isLoading)
    }
    private func review(_ note: Knowledge, remembered: Bool) {
        let next = LibraryRules.review(step: note.reviewStep, remembered: remembered)
        save.performAsync {
            guard await model.write(collection: .knowledge, id: note.id, fields: ["reviewStep": .number(Double(next.step)), "nextReviewAt": .number(next.next)]) else { throw PokusError.message(model.error ?? "Couldn't save this review.") }
        } onSuccess: { session?.confirm(note.id); revealedID = nil }
    }
}
