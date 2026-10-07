import PokusCore
import PokusNetworking
import SwiftUI

struct PokusProjectsView: View {
    @Bindable var model: PokusModel
    @State private var search = ""
    @State private var filter = "all"
    @State private var creating = false
    @State private var showingFilters = false
    @State private var confirmation: String?
    private var narrowed: Bool { filter != "all" || !search.isEmpty }
    var body: some View {
        List {
            AccountNotice(model: model)
            LibrarySaveNotice(message: confirmation)
            if filter != "all" { LibraryFilterSummary(text: filterTitle, active: true) { filter = "all" } }
            Section(filterTitle) {
                PagedRows(model: model, query: LibraryReadQueries.searchedProjects(search, status: filter), identity: filter, search: search,
                          emptyTitle: narrowed ? "No matching projects" : "No projects yet", symbol: "folder",
                          emptyDescription: narrowed ? "Clear your search and filters to see more projects." : "Create a project to keep its tasks and resources together.",
                          emptyActionTitle: narrowed ? "Clear search and filters" : "New project", emptyAction: emptyAction, emptyActionDisabled: !narrowed && !model.canEdit) { project in
                    NavigationLink { ProjectTasksView(model: model, projectID: project.id) } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(project.title).font(.headline)
                            ProjectSummaryView(model: model, id: project.id)
                            Text(project.isDone ? "Archived · \(project.lifecycle.label)" : project.lifecycle.label).font(.caption).foregroundStyle(.secondary)
                            if let due = project.dueDate, !due.isEmpty { Text(LibraryDates.due(due)).font(.caption).foregroundStyle(.secondary) }
                        }.padding(.vertical, 6)
                    }.accessibilityLabel(project.title)
                }
            }
        }.id("\(filter)-\(search)").searchable(text: $search, prompt: "Search projects").navigationTitle("Projects").refreshable { await model.refresh() }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Filter projects", systemImage: filter == "all" ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill") { showingFilters = true } }
                ToolbarItem(placement: .primaryAction) { Button("New project", systemImage: "plus") { creating = true }.disabled(!model.canEdit) }
            }
            .sheet(isPresented: $creating) { ProjectEditorView(model: model, original: nil, onSaved: { _ in confirmation = "Project saved" }) }
            .sheet(isPresented: $showingFilters) {
                LibraryFilterSheet(title: "Filter projects", reset: { filter = "all" }) {
                    Picker("Show projects", selection: $filter) {
                        Text("All unarchived").tag("all")
                        ForEach(ProjectStatus.allCases, id: \.self) { Text($0.label).tag($0.rawValue) }
                        Text("Due soon").tag("due"); Text("Archived").tag("archived")
                    }
                }
            }
    }
    private func emptyAction() { if narrowed { filter = "all"; search = "" } else { creating = true } }
    private var filterTitle: String {
        switch filter { case "all": "All unarchived projects"; case "due": "Due soon"; case "archived": "Archived"; default: ProjectStatus.allCases.first { $0.rawValue == filter }?.label ?? "Projects" }
    }
}

struct ProjectTasksView: View {
    @Bindable var model: PokusModel
    let projectID: String
    @State private var projectRecord = ReadState<Project?>()
    @State private var retry = 0
    @State private var search = ""
    @State private var status = "open"
    @State private var priority = "all"
    @State private var category = ""
    @State private var sort = "smart"
    @State private var editingProject = false
    @State private var taskEditorOpen = false
    @State private var deleting = false
    @State private var showingFilters = false
    @State private var showingSearch = false
    @State private var confirmation: String?
    @State private var save = SaveAction()
    @FocusState private var searchFocused: Bool
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var typeSize
    private var project: Project? { projectRecord.value ?? nil }
    private var activeFilters: Bool { priority != "all" || !category.isEmpty || sort != "smart" }
    private var narrowed: Bool { activeFilters || !search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var queryID: String { "\(projectID)-\(status)-\(priority)-\(category)-\(sort)" }
    var body: some View {
        ScrollViewReader { scroll in
            projectContent
                .onChange(of: showingSearch) { _, visible in
                    if visible { scroll.scrollTo("projectTaskControls", anchor: .top) }
                    searchFocused = visible
                }
        }
    }
    private var projectContent: some View {
        List {
            AccountNotice(model: model)
            LibrarySaveNotice(message: confirmation)
            if let project {
                Section {
                    VStack(alignment: .leading, spacing: 16) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(project.title)
                                .font(.title.bold()).fixedSize(horizontal: false, vertical: true)
                                .accessibilityAddTraits(.isHeader).accessibilityIdentifier("projectTitle")
                            Text(projectMetadata(project)).font(.subheadline).foregroundStyle(.secondary)
                        }
                        ProjectSummaryView(model: model, id: projectID, includeFocus: true, detailed: true)
                    }
                    .padding(.vertical, 8)
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                    .listRowBackground(Color.clear)
                }
            } else if !projectID.isEmpty {
                if projectRecord.isLoading { ProgressView("Loading project") }
                else if projectRecord.error == nil && projectRecord.value != nil { ContentUnavailableView("Project unavailable", systemImage: "folder", description: Text("It may have been deleted.")) }
                if let error = projectRecord.error { ReadError(message: error) { retry += 1 } }
            }
            if project != nil || projectID.isEmpty || (projectRecord.value == nil && projectRecord.error == nil) {
                Section {
                    taskControls
                        .id("projectTaskControls")
                        .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 8, trailing: 0))
                        .listRowBackground(Color.clear).listRowSeparator(.hidden)
                    PagedRows(model: model, query: LibraryReadQueries.searchedTasks(search, project: projectID, status: status, priority: priority, category: category, sort: sort), identity: queryID, search: search,
                              emptyTitle: emptyTitle, symbol: "checklist", emptyDescription: emptyDescription,
                              emptyActionTitle: narrowed ? "Clear search and filters" : nil, emptyAction: clearTaskSearch,
                              compactEmpty: true) { task in
                        HStack(alignment: .top, spacing: 8) {
                            Button { toggle(task) } label: { Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle").font(.title3).frame(width: 44, height: 44) }
                                .buttonStyle(.borderless).disabled(!model.canEdit || save.isSaving)
                                .accessibilityLabel("\(task.isDone ? "Reopen" : "Complete") \(task.title)").accessibilityIdentifier("completeTask-\(task.id)")
                            NavigationLink { TaskDetailView(model: model, taskID: task.id) } label: {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(task.title).foregroundStyle(.primary).strikethrough(task.isDone)
                                    if !taskMetadata(task).isEmpty {
                                        Text(taskMetadata(task)).font(.caption).foregroundStyle(.secondary)
                                    }
                                }.padding(.vertical, 4)
                            }.accessibilityLabel(task.title).accessibilityValue(task.isDone ? "Completed" : "Open")
                        }.swipeActions { Button(task.isDone ? "Reopen" : "Complete", systemImage: "checkmark") { toggle(task) }.disabled(!model.canEdit || save.isSaving) }
                    }
                } header: {
                    ViewThatFits(in: .horizontal) {
                        HStack { taskHeading; Spacer(); newTaskButton }
                        VStack(alignment: .leading, spacing: 8) { taskHeading; newTaskButton }
                    }.textCase(nil)
                }
                if let project {
                    Section("Resources") { ProjectResourcesView(model: model, projectID: projectID) }
                    if !project.description.isEmpty { Section { DisclosureGroup("Description") { RichDescription(html: project.description) } } }
                }
            }
        }.listStyle(.insetGrouped).listSectionSpacing(20)
            .navigationTitle(projectID.isEmpty ? "Unassigned tasks" : "Project")
            .navigationBarTitleDisplayMode(.inline).refreshable { await model.refresh() }
            .task(id: "\(model.queryIdentity)-\(projectID)-\(retry)") {
                guard !projectID.isEmpty else { return }
                await projectRecord.load { try await model.readAPI().record("projects", id: projectID) }
            }
            .toolbar {
                if project != nil || projectID.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(showingSearch ? "Close task search" : "Search tasks", systemImage: "magnifyingglass") {
                            showingSearch.toggle()
                            if !showingSearch { search = "" }
                        }
                        .accessibilityIdentifier("projectTaskSearch")
                    }
                }
                if let project {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button("Edit project", systemImage: "pencil") { editingProject = true }
                            Button(project.isDone ? "Restore project" : "Archive project", systemImage: "archivebox") {
                                let archived = !project.isDone
                                save.performAsync {
                                    guard await model.write(collection: .projects, id: projectID, fields: ["isDone": .bool(archived)]) else { throw PokusError.message(model.error ?? "Couldn't update this project.") }
                                } onSuccess: { confirmation = archived ? "Project archived" : "Project restored" }
                            }
                            Divider()
                            Button("Delete project", systemImage: "trash", role: .destructive) { deleting = true }
                        } label: { Label("Project actions", systemImage: "ellipsis.circle") }.disabled(!model.canEdit || save.isSaving)
                    }
                }
            }
            .sheet(isPresented: $editingProject) { if let project { ProjectEditorView(model: model, original: project, onSaved: { _ in confirmation = "Project saved" }) } }
            .sheet(isPresented: $taskEditorOpen) {
                TaskEditorView(model: model, original: nil, projectID: projectID, onSaved: { _ in
                    status = "open"; clearTaskSearch(); showingSearch = false; confirmation = "Task saved"
                })
            }
            .sheet(isPresented: $showingFilters) {
                LibraryFilterSheet(title: "Filter and sort", reset: resetFilters) {
                    Picker("Priority", selection: $priority) { Text("All priorities").tag("all"); ForEach(Priority.allCases, id: \.self) { Text($0.rawValue.capitalized).tag($0.rawValue) } }
                    RecordSelectionLink(model: model, kind: .category, title: "Category", selection: $category, none: "All categories")
                    Picker("Sort", selection: $sort) { Text("Recommended").tag("smart"); Text("Priority").tag("priority"); Text("Newest first").tag("newest"); Text("Oldest first").tag("oldest"); Text("Title").tag("alphabetical"); Text("Most focused time").tag("focused") }
                }
            }
            .alert("Delete this project?", isPresented: $deleting) {
                Button("Cancel", role: .cancel) { }
                Button("Delete project", role: .destructive) {
                    save.performAsync {
                        guard await model.write(collection: .projects, id: projectID, fields: [:], delete: true) else { throw PokusError.message(model.error ?? "Couldn't delete this project.") }
                    } onSuccess: { dismiss() }
                }
            } message: { Text("Its tasks become unassigned. Task completion and focus history are preserved.") }
            .saveAlert(save)
    }
    private var taskHeading: some View {
        Text("Tasks").font(.title3.weight(.semibold)).foregroundStyle(.primary).accessibilityAddTraits(.isHeader)
    }
    private var newTaskButton: some View {
        Button("New task", systemImage: "plus") { searchFocused = false; taskEditorOpen = true }
            .font(.subheadline.weight(.semibold)).frame(minHeight: 44)
            .disabled(!model.canEdit || (!projectID.isEmpty && project == nil))
    }
    private var taskControls: some View {
        VStack(alignment: .leading, spacing: 8) {
            if showingSearch {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary).accessibilityHidden(true)
                    TextField("Search tasks", text: $search).focused($searchFocused)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .submitLabel(.search).onSubmit { searchFocused = false }
                        .onAppear { searchFocused = true }
                        .accessibilityIdentifier("projectTaskSearchField")
                    if !search.isEmpty {
                        Button("Clear search", systemImage: "xmark.circle.fill") { search = "" }
                            .labelStyle(.iconOnly).foregroundStyle(.secondary).frame(width: 44, height: 44)
                    }
                }
                .padding(.leading, 12).padding(.trailing, 4).frame(minHeight: 44)
                .background(Color(uiColor: .tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10))
            }
            HStack(spacing: 8) {
                if typeSize.isAccessibilitySize {
                    statusPicker.pickerStyle(.menu).frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    statusPicker.pickerStyle(.segmented)
                }
                Button("Filter and sort", systemImage: activeFilters ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle") { showingFilters = true }
                    .labelStyle(.iconOnly).font(.title3).frame(width: 44, height: 44)
                    .accessibilityValue(activeFilters ? filterSummary : "No filters")
            }
            if activeFilters {
                ViewThatFits(in: .horizontal) {
                    HStack { Text(filterSummary); Spacer(); resetFiltersButton }
                    VStack(alignment: .leading) { Text(filterSummary); resetFiltersButton }
                }.font(.caption).foregroundStyle(.secondary)
            }
        }.buttonStyle(.borderless)
    }
    private var statusPicker: some View {
        Picker("Show tasks", selection: $status) {
            Text("Open").tag("open")
            Text("Completed").tag("completed")
            Text("All").tag("all")
        }.frame(minHeight: 44).accessibilityIdentifier("taskStatusFilter")
    }
    private var resetFiltersButton: some View {
        Button("Reset filters", action: resetFilters).frame(minHeight: 44)
    }
    private var emptyTitle: String {
        if narrowed { return "No matching tasks" }
        switch status {
        case "completed": return "No completed tasks"
        case "all": return "No tasks yet"
        default: return "No open tasks"
        }
    }
    private var emptyDescription: String {
        if narrowed { return "Try another search or clear your filters." }
        switch status {
        case "completed": return "Tasks you complete will appear here."
        case "all": return "Add a task to get started."
        default: return "Add a task, or check Completed for finished work."
        }
    }
    private func projectMetadata(_ project: Project) -> String {
        var labels = [project.isDone ? "Archived · \(project.lifecycle.label)" : project.lifecycle.label]
        if let date = project.dueDate, !date.isEmpty { labels.append(LibraryDates.due(date)) }
        return labels.joined(separator: " · ")
    }
    private func taskMetadata(_ task: FocusTask) -> String {
        var labels: [String] = []
        if task.focusedSeconds > 0 { labels.append(WorkspaceRules.focused(task.focusedSeconds)) }
        if let priority = task.priority, priority != .none { labels.append("\(priority.rawValue.capitalized) priority") }
        if !task.categoryName.isEmpty { labels.append(task.categoryName) }
        return labels.joined(separator: " · ")
    }
    private func resetFilters() { priority = "all"; category = ""; sort = "smart" }
    private func clearTaskSearch() { resetFilters(); search = "" }
    private func toggle(_ task: FocusTask) {
        let done = !task.isDone
        save.performAsync {
            guard await model.write(collection: .tasks, id: task.id, fields: ["isDone": .bool(done)]) else { throw PokusError.message(model.error ?? "Couldn't update this task.") }
        }
    }
    private var filterSummary: String {
        var labels: [String] = []
        if priority != "all" { labels.append("\(priority.capitalized) priority") }
        if !category.isEmpty { labels.append("Category selected") }
        if sort != "smart" { labels.append(sort == "focused" ? "Most focused time" : sort.capitalized) }
        return labels.joined(separator: " · ")
    }
}

struct TaskDetailView: View {
    @Bindable var model: PokusModel
    let taskID: String
    @State private var record = ReadState<FocusTask?>()
    @State private var retry = 0
    @State private var editing = false
    @State private var deleting = false
    @State private var confirmation: String?
    @State private var save = SaveAction()
    @Environment(\.dismiss) private var dismiss
    private var task: FocusTask? { record.value ?? nil }
    var body: some View {
        List {
            AccountNotice(model: model)
            LibrarySaveNotice(message: confirmation)
            if let task {
                Section { Text(task.title).font(.title2.weight(.semibold)).textSelection(.enabled); LabeledContent("Status", value: task.isDone ? "Completed" : "Open"); LabeledContent("Focus time", value: WorkspaceRules.focused(task.focusedSeconds)) }
                if let description = task.description, !description.isEmpty { Section("Description") { RichDescription(html: description) } }
                Section("Details") {
                    if !task.project.isEmpty {
                        NavigationLink { ProjectTasksView(model: model, projectID: task.project) } label: { SelectedRecordLabel(model: model, kind: .project, id: task.project) }
                    } else { Text("No project").foregroundStyle(.secondary) }
                    LabeledContent("Priority", value: (task.priority ?? .none).rawValue.capitalized)
                    if let dueDate = task.dueDate, !dueDate.isEmpty { LabeledContent("Due date", value: dueDate) }
                    else if !task.project.isEmpty {
                        RemoteRecord<Project, AnyView>(model: model, collection: "projects", id: task.project) { project in
                            AnyView(LabeledContent("Due date", value: project.dueDate?.isEmpty == false ? "\(project.dueDate!) · From project" : "Unscheduled"))
                        }
                    } else { LabeledContent("Due date", value: "Unscheduled") }
                    if let category = task.category, !category.isEmpty { LabeledContent { SelectedRecordLabel(model: model, kind: .category, id: category) } label: { Text("Category") } }
                    Button(task.isDone ? "Reopen task" : "Complete task") {
                        let done = !task.isDone
                        save.performAsync {
                            guard await model.write(collection: .tasks, id: task.id, fields: ["isDone": .bool(done)]) else { throw PokusError.message(model.error ?? "Couldn't update this task.") }
                        }
                    }.frame(minHeight: 44).disabled(!model.canEdit || save.isSaving)
                }
            } else if record.isLoading { ProgressView("Loading task") }
            else if record.error == nil && record.value != nil { ContentUnavailableView("Task unavailable", systemImage: "checklist", description: Text("It may have been deleted.")) }
            if let error = record.error { ReadError(message: error) { retry += 1 } }
        }.navigationTitle("Task").navigationBarTitleDisplayMode(.inline).refreshable { await model.refresh() }
            .task(id: "\(model.queryIdentity)-\(taskID)-\(retry)") { await record.load { try await model.readAPI().record("tasks", id: taskID) } }
            .safeAreaInset(edge: .bottom) {
                if let task {
                    Button("Focus on this task", systemImage: "timer") { model.selectedTaskID = task.id; model.openTimer?() }
                        .buttonStyle(.borderedProminent).frame(maxWidth: .infinity, minHeight: 44).padding().background(.bar)
                        .disabled(model.account == nil || !model.storageReady || save.isSaving)
                }
            }
            .toolbar {
                if task != nil {
                    ToolbarItem(placement: .primaryAction) { Button("Edit task", systemImage: "pencil") { editing = true }.disabled(!model.canEdit || save.isSaving) }
                    ToolbarItem(placement: .topBarTrailing) { Button("Delete task", systemImage: "trash", role: .destructive) { deleting = true }.disabled(!model.canEdit || save.isSaving) }
                }
            }
            .sheet(isPresented: $editing) { if let task { TaskEditorView(model: model, original: task, projectID: task.project, onSaved: { _ in confirmation = "Task saved" }) } }
            .alert("Delete this task?", isPresented: $deleting) {
                Button("Cancel", role: .cancel) { }
                Button("Delete task", role: .destructive) {
                    save.performAsync {
                        guard await model.write(collection: .tasks, id: taskID, fields: [:], delete: true) else { throw PokusError.message(model.error ?? "Couldn't delete this task.") }
                    } onSuccess: { dismiss() }
                }
            } message: { Text("Focus session history is preserved.") }
            .saveAlert(save)
    }
}
