import DailyCore
import PokusCore
import PokusNetworking
import SwiftUI

struct PokusLibraryView: View {
    @Bindable var model: PokusModel
    let habitStore: (any HabitViewStore)?
    let today: DayKey
    @Binding var habitsProgress: Bool
    @State private var search = ""
    @State private var creating: Creation?
    @State private var confirmation: String?
    @State private var summary = ReadState<LibraryOverviewSummary>()
    @State private var retry = 0
    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: .body) private var destinationSymbolSize: CGFloat = 22
    private enum Creation: String, Identifiable { case capture, note, task, project; var id: String { rawValue } }
    private var searching: Bool { !search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var reviewDetail: String {
        guard let value = summary.value else { return summary.error == nil ? "Loading review schedule" : "Review schedule unavailable" }
        if value.due > 0 { return "\(value.due) \(value.due == 1 ? "note" : "notes") due" }
        if let next = value.nextReview { return "Next review \(LibraryDates.review(next))" }
        return "Include a note in review to revisit what you learn"
    }
    var body: some View {
        List {
            AccountNotice(model: model)
            if habitStore != nil && !searching {
                Section { NavigationLink(value: LibraryRoute.habits) { destination("Habits", symbol: "checkmark.circle", detail: "Daily check-ins and progress") }.accessibilityIdentifier("libraryHabits") }
            }
            if model.account != nil {
                LibrarySaveNotice(message: confirmation)
                if searching { searchResults }
                else {
                    if summary.isLoading && summary.value == nil { ProgressView("Loading library") }
                    if let error = summary.error { ReadError(message: error) { retry += 1 } }
                    Section("Review") {
                        NavigationLink(value: LibraryRoute.review) {
                            destination((summary.value?.due ?? 0) > 0 ? "Start review" : "Review", symbol: "arrow.clockwise", detail: reviewDetail)
                        }.accessibilityLabel((summary.value?.due ?? 0) > 0 ? "Start review" : "Review").accessibilityValue(reviewDetail).accessibilityIdentifier("libraryReview")
                    }
                    Section("Browse") {
                        NavigationLink(value: LibraryRoute.captures) { destination("Captures", symbol: "tray", detail: "Saved links, books, and thoughts", count: summary.value?.captures) }.accessibilityLabel("Captures").accessibilityIdentifier("libraryCaptures")
                        NavigationLink(value: LibraryRoute.notes) { destination("Notes", symbol: "text.book.closed", detail: "Keep and connect what you learn", count: summary.value?.notes) }.accessibilityLabel("Notes").accessibilityIdentifier("libraryNotes")
                        NavigationLink(value: LibraryRoute.projects) { destination("Projects", symbol: "folder", detail: "Tasks and resources", count: summary.value?.projects) }.accessibilityLabel("Projects").accessibilityIdentifier("libraryProjects")
                    }
                    Section("Organize") {
                        NavigationLink(value: LibraryRoute.calendar) { destination("Calendar", symbol: "calendar", detail: "Deadlines, tasks, habits, and reminders by date") }.accessibilityLabel("Calendar").accessibilityIdentifier("libraryCalendar")
                        NavigationLink(value: LibraryRoute.unassigned) { destination("Unassigned tasks", symbol: "checklist", detail: "Tasks without a project", count: summary.value?.unassigned) }.accessibilityLabel("Unassigned tasks")
                        NavigationLink(value: LibraryRoute.categories) { destination("Categories", symbol: "tag", detail: "Organize tasks and notes", count: summary.value?.categories) }.accessibilityLabel("Categories")
                    }
                }
            }
        }.navigationTitle("Library").searchable(text: $search, prompt: "Search your library")
            .scrollDismissesKeyboard(.interactively).refreshable { await model.refresh() }
            .navigationDestination(for: LibraryRoute.self) { route in
                switch route {
                case .habits:
                    if let habitStore { HabitsView(store: habitStore, today: today, showingProgress: $habitsProgress).refreshable { await model.refresh() } }
                case .calendar: PokusCalendarView(model: model, today: today, selectedCapture: .constant(nil))
                case .captures: CapturesView(model: model)
                case .notes: KnowledgeListView(model: model)
                case .projects: PokusProjectsView(model: model)
                case .review: KnowledgeReviewView(model: model)
                case .unassigned: ProjectTasksView(model: model, projectID: "")
                case .categories: CategoriesView(model: model)
                case .capture(let id): CaptureDetailView(model: model, captureID: id)
                case .note(let id): KnowledgeDetailView(model: model, noteID: id)
                case .project(let id): ProjectTasksView(model: model, projectID: id)
                case .task(let id): TaskDetailView(model: model, taskID: id)
                }
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button("New capture", systemImage: "tray") { creating = .capture }
                        Button("New note", systemImage: "square.and.pencil") { creating = .note }
                        Button("New task", systemImage: "checklist") { creating = .task }
                        Button("New project", systemImage: "folder.badge.plus") { creating = .project }
                    } label: { Label("Create", systemImage: "plus") }.disabled(!model.canEdit)
                }
            }
            .sheet(item: $creating) { creation in
                switch creation {
                case .capture: CaptureEditorView(model: model, onSaved: { _ in confirmation = "Capture saved" })
                case .note: KnowledgeEditorView(model: model, onSaved: { _ in confirmation = "Note saved" })
                case .task: TaskEditorView(model: model, original: nil, projectID: "", onSaved: { _ in confirmation = "Task saved" })
                case .project: ProjectEditorView(model: model, original: nil, onSaved: { _ in confirmation = "Project saved" })
                }
            }
            .task(id: "\(model.queryIdentity)-\(retry)") {
                guard model.account != nil else { return }
                await summary.load { try await LibraryOverviewSummary.load(model.readAPI()) }
            }
    }
    @ViewBuilder private var searchResults: some View {
        Section("Captures") {
            PagedRows(model: model, query: LibraryReadQueries.searchedCaptures(search), search: search, emptyTitle: "No matching captures") { capture in
                NavigationLink(value: LibraryRoute.capture(capture.id)) { CaptureRow(capture: capture) }
                    .accessibilityLabel(CaptureRow.singleLine(CaptureDisplay(capture).title)).accessibilityValue(CaptureRow.accessibilityValue(capture))
                    .accessibilityIdentifier("libraryResult-capture:\(capture.id)")
            }
        }
        Section("Notes") {
            PagedRows(model: model, query: LibraryReadQueries.searchedNotes(search), search: search, emptyTitle: "No matching notes", symbol: "text.book.closed") { note in
                NavigationLink(value: LibraryRoute.note(note.id)) { searchRow(note.title, detail: note.summary) }.accessibilityIdentifier("libraryResult-note:\(note.id)")
            }
        }
        Section("Projects") {
            PagedRows(model: model, query: LibraryReadQueries.searchedProjects(search), search: search, emptyTitle: "No matching projects", symbol: "folder") { project in
                NavigationLink(value: LibraryRoute.project(project.id)) { searchRow(project.title, detail: project.isDone ? "Archived" : project.lifecycle.label) }.accessibilityIdentifier("libraryResult-project:\(project.id)")
            }
        }
        Section("Tasks") {
            PagedRows(model: model, query: LibraryReadQueries.searchedTasks(search), search: search, emptyTitle: "No matching tasks", symbol: "checklist") { task in
                NavigationLink(value: LibraryRoute.task(task.id)) { searchRow(task.title, detail: task.isDone ? "Completed" : "Open") }.accessibilityIdentifier("libraryResult-task:\(task.id)")
            }
        }
        Button("Clear search") { search = "" }.frame(minHeight: 44)
    }
    private func searchRow(_ title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 4) { Text(title).font(.headline); if !detail.isEmpty { Text(detail).font(.subheadline).foregroundStyle(.secondary).lineLimit(2) } }.padding(.vertical, 4)
    }
    private func destination(_ title: String, symbol: String, detail: String, count: Int? = nil) -> some View {
        let countDescription = count.map { "\($0) \(title == "Unassigned tasks" ? "open" : title == "Projects" ? "unarchived" : "saved")" }
        return HStack(alignment: .center, spacing: 12) {
            Image(systemName: symbol).foregroundStyle(DailyTheme.accent)
                .font(.system(size: min(destinationSymbolSize, 28))).frame(width: 28).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.headline)
                Text(detail).font(.subheadline).foregroundStyle(.secondary)
                if typeSize.isAccessibilitySize, let countDescription {
                    Text(countDescription).font(.caption).foregroundStyle(.secondary)
                }
            }.fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
            if !typeSize.isAccessibilitySize, let count {
                Text(count, format: .number).font(.subheadline).monospacedDigit()
                    .foregroundStyle(.secondary).fixedSize()
            }
        }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).padding(.vertical, 6)
            .contentShape(Rectangle()).accessibilityElement(children: .combine)
            .accessibilityLabel(title).accessibilityValue([detail, countDescription].compactMap { $0 }.joined(separator: ", "))
    }
}

struct CapturesView: View {
    @Bindable var model: PokusModel
    var projectID: String? = nil
    @State private var search = ""
    @State private var filter = CaptureFilter()
    @State private var creating = false
    @State private var deleting: Capture?
    @State private var confirmation: String?
    @State private var save = SaveAction()
    @Environment(\.dynamicTypeSize) private var typeSize
    private var narrowed: Bool { filter.isActive || !search.isEmpty }
    private var queryID: String { "\(projectID ?? "all")-\(filter.stage.rawValue)-\(filter.kind?.rawValue ?? "all")" }
    private var editable: Bool { model.canEdit && !save.isSaving }
    var body: some View {
        List {
            Section {
                if typeSize.isAccessibilitySize {
                    stagePicker.pickerStyle(.menu)
                } else {
                    stagePicker.pickerStyle(.segmented)
                        .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                }
            }
            Section {
                AccountNotice(model: model)
                LibrarySaveNotice(message: confirmation)
                if let kind = filter.kind { LibraryFilterSummary(text: "Type: \(kind.label)", active: true) { filter = CaptureFilter() } }
                PagedRows(model: model, query: LibraryReadQueries.searchedCaptures(search, project: projectID, stage: filter.stage.rawValue, kind: filter.kind?.rawValue ?? "all"), identity: queryID, search: search,
                          emptyTitle: narrowed ? "No matching captures" : "No captures yet", symbol: "tray",
                          emptyDescription: narrowed ? "Clear your search and filters to see more captures." : "Save a link, book, or thought. You can organize it later.",
                          emptyActionTitle: narrowed ? "Clear search and filters" : "New capture", emptyAction: emptyAction, emptyActionDisabled: !narrowed && !model.canEdit) { capture in
                    NavigationLink { CaptureDetailView(model: model, captureID: capture.id, projectID: projectID) } label: { CaptureRow(capture: capture) }
                        .accessibilityLabel(CaptureRow.singleLine(CaptureDisplay(capture).title)).accessibilityValue(CaptureRow.accessibilityValue(capture))
                        .swipeActions(edge: .leading) { processedButton(capture).tint(CaptureStage.processed.tint) }
                        .swipeActions(edge: .trailing) { Button("Delete", systemImage: "trash", role: .destructive) { deleting = capture }.disabled(!editable) }
                        .contextMenu {
                            if let link = CaptureDisplay(capture).link { Link(destination: link) { Label("Open original", systemImage: "safari") } }
                            processedButton(capture)
                            Divider()
                            Button("Delete capture", systemImage: "trash", role: .destructive) { deleting = capture }.disabled(!editable)
                        }
                }
            }
        }.id("\(queryID)-\(search)").listSectionSpacing(.compact)
            .navigationTitle(projectID == nil ? "Captures" : "Project captures").searchable(text: $search, prompt: "Search captures")
            .scrollDismissesKeyboard(.interactively).refreshable { await model.refresh() }
            .toolbar {
                ToolbarItem(placement: .primaryAction) { Button("New capture", systemImage: "plus") { creating = true }.disabled(!model.canEdit) }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Type", selection: $filter.kind) {
                            Label("All types", systemImage: "square.grid.2x2").tag(CaptureKind?.none)
                            ForEach(CaptureKind.allCases, id: \.self) { Label($0.label, systemImage: $0.icon).tag(Optional($0)) }
                        }
                    } label: { Label("Filter by type", systemImage: filter.kind == nil ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill") }
                        .accessibilityIdentifier("captureFilters")
                }
            }
            .sheet(isPresented: $creating) { CaptureEditorView(model: model, projectID: projectID, onSaved: { _ in confirmation = "Capture saved" }) }
            .alert("Delete this capture?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), presenting: deleting) { capture in
                Button("Cancel", role: .cancel) { }
                Button("Delete capture", role: .destructive) {
                    save.performAsync { try await model.deleteCapture(id: capture.id) } onSuccess: { confirmation = "Capture deleted" }
                }
            } message: { _ in Text("Its notes remain. Project and source links to this capture are removed.") }
            .saveAlert(save)
    }
    private var stagePicker: some View {
        Picker("Stage", selection: $filter.stage) {
            ForEach(CaptureStage.allCases, id: \.self) { Text($0 == .all ? "All" : $0.label).tag($0) }
        }.frame(minHeight: 44).accessibilityIdentifier("captureStage")
    }
    private func processedButton(_ capture: Capture) -> some View {
        Button(capture.isProcessed ? "Mark unprocessed" : "Mark processed", systemImage: capture.isProcessed ? "arrow.uturn.backward.circle" : "checkmark.circle") {
            let processed = !capture.isProcessed
            save.performAsync { try await model.setCaptureProcessed(capture, processed: processed) } onSuccess: { confirmation = processed ? "Marked processed" : "Marked unprocessed" }
        }.disabled(!editable)
    }
    private func emptyAction() { if narrowed { search = ""; filter = CaptureFilter() } else { creating = true } }
}

struct CaptureDetailView: View {
    @Bindable var model: PokusModel
    let captureID: String
    var projectID: String? = nil
    @State private var record = ReadState<Capture?>()
    @State private var stage = ReadState<CaptureStage>()
    @State private var retry = 0
    @State private var editing = false
    @State private var editingReminder = false
    @State private var filing = false
    @State private var distilling = false
    @State private var creatingProject = false
    @State private var deleting = false
    @State private var confirmation: String?
    @State private var save = SaveAction()
    @Environment(\.dismiss) private var dismiss
    private var capture: Capture? { record.value ?? nil }
    private var editable: Bool { model.canEdit && !save.isSaving }
    var body: some View {
        List {
            AccountNotice(model: model)
            LibrarySaveNotice(message: confirmation)
            if let capture {
                Section {
                    if let image = CaptureDisplay(capture).imageURL {
                        CaptureHeroImage(capture: capture, url: image).listRowInsets(EdgeInsets()).listRowSeparator(.hidden)
                    }
                    CaptureHeader(capture: capture, stage: capture.isProcessed ? .processed : stage.value, canEdit: editable) { toggleProcessed(capture) }
                }
                if !capture.note.isEmpty && !CaptureDisplay(capture).leadsWithNote { Section("Captured text") { RichDescription(html: capture.note) } }
                CaptureReminderSection(model: model, capture: capture, save: save) { editingReminder = true }
                Section("Notes from this capture") {
                    PagedRows(model: model, query: RecordQueries.knowledge(source: captureID), identity: captureID, emptyTitle: "No notes yet", compactEmpty: true) { note in
                        NavigationLink(note.title) { KnowledgeDetailView(model: model, noteID: note.id) }
                    }
                    Button("Create note", systemImage: "square.and.pencil") { distilling = true }.frame(minHeight: 44).disabled(!editable)
                }
                Section("Projects") {
                    PagedRows(model: model, query: LibraryReadQueries.filedProjects(captureID), identity: captureID, emptyTitle: "Not filed in a project", compactEmpty: true) { project in
                        NavigationLink(project.title) { ProjectTasksView(model: model, projectID: project.id) }
                    }
                    Button("File in projects", systemImage: "folder") { filing = true }.frame(minHeight: 44).disabled(!editable)
                }
            } else if record.isLoading { ProgressView("Loading capture") }
            else if record.error == nil && record.value != nil { ContentUnavailableView("Capture unavailable", systemImage: "tray", description: Text("It may have been deleted.")) }
            if let error = record.error ?? stage.error { ReadError(message: error) { retry += 1 } }
        }.listSectionSpacing(.compact).navigationTitle("Capture").navigationBarTitleDisplayMode(.inline).refreshable { await model.refresh() }
            .task(id: "\(model.queryIdentity)-\(captureID)-\(retry)") {
                await record.load { try await model.readAPI().record("captures", id: captureID) }
                if let capture { await stage.load { try await LibraryReadQueries.captureStage(capture, api: model.readAPI()) } }
            }
            .toolbar {
                if capture != nil {
                    ToolbarItem(placement: .primaryAction) {
                        Menu {
                            Button("Edit capture", systemImage: "pencil") { editing = true }
                            Button("Start project from capture", systemImage: "folder.badge.plus") { creatingProject = true }
                            Divider()
                            Button("Delete capture", systemImage: "trash", role: .destructive) { deleting = true }
                        } label: { Label("Capture actions", systemImage: "ellipsis.circle") }.disabled(!editable)
                    }
                }
            }
            .sheet(isPresented: $editing) { if let capture { CaptureEditorView(model: model, original: capture, onSaved: { _ in confirmation = "Capture saved" }) } }
            .sheet(isPresented: $editingReminder) { if let capture { CaptureReminderEditor(model: model, capture: capture) } }
            .sheet(isPresented: $filing) { CaptureProjectsView(model: model, captureID: captureID) }
            .sheet(isPresented: $distilling) { KnowledgeEditorView(model: model, projectID: projectID, sourceID: captureID, suggestedTitle: capture?.label, onSaved: { _ in confirmation = "Note saved. This capture remains available to process." }) }
            .sheet(isPresented: $creatingProject) { ProjectEditorView(model: model, original: nil, captureID: captureID, suggestedTitle: capture?.label, onSaved: { _ in confirmation = "Project created and capture filed" }) }
            .alert("Delete this capture?", isPresented: $deleting) {
                Button("Cancel", role: .cancel) { }
                Button("Delete capture", role: .destructive) {
                    save.performAsync { try await model.deleteCapture(id: captureID) } onSuccess: { dismiss() }
                }
            } message: { Text("Its notes remain. Project and source links to this capture are removed.") }
            .saveAlert(save)
    }
    private func toggleProcessed(_ capture: Capture) {
        let processed = !capture.isProcessed
        save.performAsync { try await model.setCaptureProcessed(capture, processed: processed) }
            onSuccess: { confirmation = processed ? "Marked processed" : "Marked unprocessed. Its project and source links are kept." }
    }
}

private struct CaptureProjectsView: View {
    @Bindable var model: PokusModel
    let captureID: String
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""
    @State private var confirmation: String?
    @State private var save = SaveAction()
    private var query: RecordQuery<Project> { var query = RecordQueries.projects(search: search); query.fields += ",captures"; return query }
    var body: some View {
        NavigationStack {
            List {
                AccountNotice(model: model)
                LibrarySaveNotice(message: confirmation)
                if save.isSaving { ProgressView("Saving filing") }
                PagedRows(model: model, query: query, identity: captureID, search: search, emptyTitle: search.isEmpty ? "No projects yet" : "No matching projects", symbol: "folder", emptyDescription: search.isEmpty ? "Create a project to file this capture." : "Try another search.") { project in
                    let linked = (project.captures ?? []).contains(captureID)
                    Button {
                        save.performAsync {
                            guard await model.write(collection: .projects, id: project.id, fields: [linked ? "captures-" : "captures+": .array([.string(captureID)])]) else { throw PokusError.message(model.error ?? "Couldn't update the project filing.") }
                        } onSuccess: { confirmation = linked ? "Removed from \(project.title)" : "Filed in \(project.title)" }
                    } label: {
                        HStack { Text(project.title).foregroundStyle(.primary); Spacer(); Image(systemName: linked ? "checkmark.circle.fill" : "circle").accessibilityHidden(true) }.frame(minHeight: 44)
                    }.accessibilityIdentifier("filingProject-\(project.id)").accessibilityValue(linked ? "Filed" : "Not filed").accessibilityAddTraits(linked ? .isSelected : []).disabled(!model.canEdit || save.isSaving)
                }
            }.navigationTitle("File in projects").navigationBarTitleDisplayMode(.inline).searchable(text: $search, prompt: "Search projects")
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() }.disabled(save.isSaving) } }
                .interactiveDismissDisabled(save.isSaving).saveAlert(save)
        }
    }
}
