import PokusCore
import PokusNetworking
import SwiftUI

struct ProjectEditorView: View {
    @State private var creationID = FocusSession.makeID()
    @State private var submitting = false
    @Bindable var model: PokusModel
    let original: Project?
    var captureID: String? = nil
    var onSaved: ((String) -> Void)? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var description = ""
    @State private var status: ProjectStatus
    @State private var hasDueDate: Bool
    @State private var dueDate: Date
    @State private var validation: String?
    @State private var initialDraft: [String]?
    @State private var closeRequested = false
    private enum Field { case title, description }
    @FocusState private var focusedField: Field?
    private var draft: [String] { [title.trimmingCharacters(in: .whitespacesAndNewlines), description, status.rawValue, hasDueDate ? WorkspaceRules.dayKey(dueDate) : ""] }
    init(model: PokusModel, original: Project?, captureID: String? = nil, suggestedTitle: String? = nil, onSaved: ((String) -> Void)? = nil) {
        self.model = model; self.original = original; self.captureID = captureID; self.onSaved = onSaved
        _title = State(initialValue: original?.title ?? suggestedTitle ?? "")
        _status = State(initialValue: original?.lifecycle ?? .active)
        _hasDueDate = State(initialValue: original?.dueDate?.isEmpty == false)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd"
        _dueDate = State(initialValue: original?.dueDate.flatMap { formatter.date(from: $0) } ?? .now)
    }
    var body: some View {
        NavigationStack {
            Form {
                AccountNotice(model: model)
                Section {
                    TextField("Project name", text: $title).focused($focusedField, equals: .title).submitLabel(.done)
                        .onSubmit { focusedField = nil }.accessibilityHint("Required")
                        .font(.headline).frame(minHeight: 44)
                    EditorError(message: validation)
                }
                Section("Details") {
                    Picker("Status", selection: $status) { ForEach(ProjectStatus.allCases, id: \.self) { Text($0.label).tag($0) } }
                    Toggle("Due date", isOn: $hasDueDate.animation())
                    if hasDueDate { DatePicker("Due", selection: $dueDate, displayedComponents: .date) }
                }
                Section("Description") {
                    if let original, !original.description.isEmpty {
                        RichDescription(html: original.description)
                        Text("Existing descriptions are read-only on iPhone.").font(.footnote).foregroundStyle(.secondary)
                    } else if original == nil {
                        TextEditor(text: $description).frame(minHeight: 120).focused($focusedField, equals: .description)
                            .editorPrompt("Description", isShowing: description.isEmpty)
                            .accessibilityLabel("Project description")
                    } else {
                        Text("No description").foregroundStyle(.secondary)
                    }
                }
            }
            .disabled(submitting || model.isSaving)
            .keyboardDoneButton(isEditing: focusedField != nil) { focusedField = nil }
            .onAppear { if initialDraft == nil { initialDraft = draft } }
            .navigationTitle(original == nil ? "New project" : "Edit project")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { closeRequested = true }.disabled(submitting || model.isSaving) }
                ToolbarItem(placement: .confirmationAction) { Button(submitting ? "Saving…" : "Save") { Task { await save() } }.disabled(!model.canEdit || submitting || model.isSaving || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
            }
            .protectDraft(isDirty: initialDraft.map { $0 != draft } ?? false, isSaving: submitting || model.isSaving, closeRequested: $closeRequested) { dismiss() }
        }
    }
    private func save() async {
        guard !submitting else { return }
        focusedField = nil
        submitting = true
        defer { submitting = false }
        do {
            if try await model.saveProject(original: original, creationID: creationID, title: title, description: description,
                                           status: status, dueDate: hasDueDate ? dueDate : nil, captureID: captureID) { onSaved?(original?.id ?? creationID); dismiss() }
            else { validation = model.error }
        } catch { validation = error.localizedDescription; focusedField = .title }
    }
}
struct TaskEditorView: View {
    @State private var creationID = FocusSession.makeID()
    @State private var submitting = false
    @Bindable var model: PokusModel
    let original: FocusTask?
    var onSaved: ((String) -> Void)? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var description = ""
    @State private var projectID: String
    @State private var priority: Priority
    @State private var category: String
    @State private var hasDueDate: Bool
    @State private var dueDate: Date
    @State private var validation: String?
    @State private var initialDraft: [String]?
    @State private var closeRequested = false
    private enum Field { case title, description }
    @FocusState private var focusedField: Field?
    private var draft: [String] { [title.trimmingCharacters(in: .whitespacesAndNewlines), description, projectID, priority.rawValue, category, hasDueDate ? WorkspaceRules.dayKey(dueDate) : ""] }
    init(model: PokusModel, original: FocusTask?, projectID: String, onSaved: ((String) -> Void)? = nil) {
        self.model = model; self.original = original; self.onSaved = onSaved
        _title = State(initialValue: original?.title ?? "")
        _projectID = State(initialValue: original?.project ?? projectID)
        _priority = State(initialValue: original?.priority ?? .none)
        _category = State(initialValue: original?.category ?? "")
        _hasDueDate = State(initialValue: !(original?.dueDate ?? "").isEmpty)
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
        _dueDate = State(initialValue: original?.dueDate.flatMap { formatter.date(from: $0) } ?? .now)
    }
    var body: some View {
        NavigationStack {
            Form {
                AccountNotice(model: model)
                Section {
                    TextField("Task name", text: $title, axis: .vertical).focused($focusedField, equals: .title)
                        .accessibilityLabel("Title").font(.headline).frame(minHeight: 44)
                        .submitLabel(.done).submitsOnReturn($title) { focusedField = nil }
                        .accessibilityHint("Required")
                    EditorError(message: validation)
                }
                Section("Organize") {
                    RecordSelectionLink(model: model, kind: .project, title: "Project", selection: $projectID, none: "No project")
                    Picker("Priority", selection: $priority) { ForEach(Priority.allCases, id: \.self) { Text($0.rawValue.capitalized).tag($0) } }
                    RecordSelectionLink(model: model, kind: .category, title: "Category", selection: $category)
                }
                Section {
                    Toggle("Due date", isOn: $hasDueDate.animation())
                    if hasDueDate { DatePicker("Date", selection: $dueDate, displayedComponents: .date) }
                } header: { Text("Schedule") } footer: {
                    if !hasDueDate && !projectID.isEmpty { Text("Uses the project's deadline when available.") }
                }
                Section("Description") {
                    if let original {
                        if let description = original.description, !description.isEmpty {
                            RichDescription(html: description)
                            Text("Existing descriptions are read-only on iPhone.").font(.footnote).foregroundStyle(.secondary)
                        } else { Text("No description").foregroundStyle(.secondary) }
                    } else {
                        TextEditor(text: $description).frame(minHeight: 120).focused($focusedField, equals: .description)
                            .editorPrompt("Description", isShowing: description.isEmpty)
                            .accessibilityLabel("Task description")
                    }
                }
            }.disabled(submitting || model.isSaving)
                .keyboardDoneButton(isEditing: focusedField != nil) { focusedField = nil }
                .onAppear { if initialDraft == nil { initialDraft = draft } }
                .navigationTitle(original == nil ? "New task" : "Edit task")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { closeRequested = true }.disabled(submitting || model.isSaving) }
                    ToolbarItem(placement: .confirmationAction) { Button(submitting ? "Saving…" : "Save") { Task { await save() } }.disabled(!model.canEdit || submitting || model.isSaving || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
                }
                .protectDraft(isDirty: initialDraft.map { $0 != draft } ?? false, isSaving: submitting || model.isSaving, closeRequested: $closeRequested) { dismiss() }
        }
    }
    private func save() async {
        guard !submitting else { return }
        focusedField = nil
        submitting = true
        defer { submitting = false }
        do {
            if try await model.saveTask(original: original, creationID: creationID, title: title, description: description,
                                        projectID: projectID, priority: priority, category: category, dueDate: hasDueDate ? dueDate : nil) { onSaved?(original?.id ?? creationID); dismiss() } else { validation = model.error }
        } catch { validation = error.localizedDescription; focusedField = .title }
    }
}
struct CategoriesView: View {
    @Bindable var model: PokusModel
    @State private var selected: FocusCategory?
    @State private var editing = false
    @State private var save = SaveAction()
    @State private var deleting: FocusCategory?
    @State private var confirmation: String?
    var body: some View {
        List {
            AccountNotice(model: model)
            LibrarySaveNotice(message: confirmation)
            PagedRows(model: model, query: RecordQueries.categories(), emptyTitle: "No categories yet", symbol: "tag", emptyDescription: "Create categories to organize tasks and notes.", emptyActionTitle: "New category", emptyAction: { selected = nil; editing = true }, emptyActionDisabled: !model.canEdit) { category in
                HStack {
                    Button { selected = category; editing = true } label: {
                        Label { Text(category.name).foregroundStyle(.primary) } icon: { Circle().fill(categoryColor(category.color)).frame(width: 16, height: 16).accessibilityHidden(true) }.frame(minHeight: 44)
                    }.buttonStyle(.borderless).disabled(!model.canEdit || save.isSaving)
                        .accessibilityLabel(category.name).accessibilityValue("\(category.color) category")
                    Spacer()
                    Button("Delete category", systemImage: "trash", role: .destructive) { deleting = category }.labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44).buttonStyle(.borderless).disabled(!model.canEdit || save.isSaving)
                        .accessibilityLabel("Delete \(category.name)")
                }
                    .swipeActions {
                        Button("Delete", role: .destructive) { deleting = category }.disabled(!model.canEdit || save.isSaving)
                    }
            }
        }.navigationTitle("Categories")
            .toolbar { Button("New category", systemImage: "plus") { selected = nil; editing = true }.disabled(!model.canEdit) }
            .sheet(isPresented: $editing) { CategoryEditorView(model: model, original: selected, onSaved: { confirmation = "Category saved" }) }
            .alert("Delete this category?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), presenting: deleting) { category in
                Button("Cancel", role: .cancel) { deleting = nil }
                Button("Delete category", role: .destructive) {
                    save.performAsync {
                        guard await model.write(collection: .categories, id: category.id, fields: [:], delete: true) else { throw PokusError.message(model.error ?? "Couldn't delete this category.") }
                    } onSuccess: { confirmation = "Category deleted" }
                    deleting = nil
                }
            } message: { category in Text("\(category.name) will be removed from its tasks and notes. The tasks and notes remain.") }
            .saveAlert(save)
    }
    private func categoryColor(_ value: String) -> Color {
        switch value { case "red": .red; case "orange": .orange; case "amber": .yellow; case "green": .green; case "teal": .teal; case "blue": .blue; case "violet": .purple; case "pink": .pink; default: .gray }
    }
}
private struct CategoryEditorView: View {
    @State private var creationID = FocusSession.makeID()
    @State private var submitting = false
    @Bindable var model: PokusModel
    let original: FocusCategory?
    var onSaved: (() -> Void)? = nil
    @State private var name: String
    @State private var color: String
    @State private var error: String?
    @State private var initialDraft: [String]?
    @State private var closeRequested = false
    @FocusState private var focusedName: Bool
    private var draft: [String] { [name.trimmingCharacters(in: .whitespacesAndNewlines), color] }
    @Environment(\.dismiss) private var dismiss
    init(model: PokusModel, original: FocusCategory?, onSaved: (() -> Void)? = nil) {
        self.model = model; self.original = original; self.onSaved = onSaved
        _name = State(initialValue: original?.name ?? ""); _color = State(initialValue: original?.color ?? "green")
    }
    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $name).focused($focusedName).submitLabel(.done)
                    .onSubmit { focusedName = false }.accessibilityHint("Required")
                EditorError(message: error)
                Picker("Color", selection: $color) {
                    ForEach(["slate", "red", "orange", "amber", "green", "teal", "blue", "violet", "pink"], id: \.self) { Text($0.capitalized).tag($0) }
                }
            }.disabled(submitting || model.isSaving)
                .keyboardDoneButton(isEditing: focusedName) { focusedName = false }
                .onAppear { if initialDraft == nil { initialDraft = draft } }
                .navigationTitle(original == nil ? "New category" : "Edit category")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { closeRequested = true }.disabled(submitting || model.isSaving) }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(submitting ? "Saving…" : "Save") {
                            Task {
                                guard !submitting else { return }
                                focusedName = false
                                submitting = true
                                defer { submitting = false }
                                do {
                                    if try await model.saveCategory(original: original, creationID: creationID, name: name, color: color) { onSaved?(); dismiss() } else { error = model.error }
                                } catch { self.error = error.localizedDescription; focusedName = true }
                            }
                        }.disabled(!model.canEdit || submitting || model.isSaving || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }.protectDraft(isDirty: initialDraft.map { $0 != draft } ?? false, isSaving: submitting || model.isSaving, closeRequested: $closeRequested) { dismiss() }
        }
    }
}
