import PokusCore
import PokusNetworking
import SwiftUI

struct KnowledgeEditorView: View {
    @State private var creationID = FocusSession.makeID()
    @State private var submitting = false
    @Bindable var model: PokusModel
    var original: Knowledge? = nil
    var projectID: String? = nil
    var sourceID: String? = nil
    var suggestedTitle: String? = nil
    var onSaved: ((String) -> Void)? = nil
    @State private var title = ""
    @State private var summary = ""
    @State private var bodyText = ""
    @State private var locator = ""
    @State private var origin = ""
    @State private var category = ""
    @State private var status = KnowledgeStatus.draft
    @State private var linkedProjects: Set<String> = []
    @State private var sources: Set<String> = []
    @State private var editingBody = false
    @State private var restoringBody = false
    @State private var initialized = false
    @State private var validation: String?
    @State private var initialDraft: [String]?
    @State private var closeRequested = false
    @State private var showingDetails = false
    private enum Field { case title, body, summary, locator }
    @FocusState private var focusedField: Field?
    @State private var invalidField: Field?
    @ScaledMetric(relativeTo: .body) private var bodyHeight = 180
    private var draft: [String] {
        [title.trimmingCharacters(in: .whitespacesAndNewlines), summary, locator, origin, category, status.rawValue,
         linkedProjects.sorted().joined(separator: ","), sources.sorted().joined(separator: ","),
         editingBody ? "replacement" : "original", original == nil || editingBody ? bodyText : ""]
    }
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form {
                AccountNotice(model: model)
                Section("Note") {
                    TextField("Title", text: $title, axis: .vertical).focused($focusedField, equals: .title)
                        .accessibilityLabel("Title")
                        .submitLabel(.next)
                        .accessibilityHint("Required")
                        .submitsOnReturn($title) { focusedField = original == nil || editingBody ? .body : nil }
                    EditorError(message: invalidField == nil || invalidField == .title ? validation : nil)
                }
                Section("Body") {
                    if let original, !editingBody {
                        if original.body.isEmpty { Text("No body added").foregroundStyle(.secondary) }
                        else { RichDescription(html: original.body) }
                        Button("Edit as plain text") { editingBody = true; focusedField = .body }.frame(minHeight: 44)
                    }
                    else {
                        TextEditor(text: $bodyText).frame(minHeight: bodyHeight).focused($focusedField, equals: .body)
                            .editorPrompt("Write what you learned in your own words", isShowing: bodyText.isEmpty)
                            .accessibilityLabel("Note body")
                        if original != nil {
                            Text("Saving replaces existing body formatting with plain paragraphs.").font(.footnote).foregroundStyle(.secondary)
                            Button("Restore original body") {
                                if bodyText == WorkspaceRules.plainText(original?.body ?? "") { restoreBody() }
                                else { restoringBody = true }
                            }.frame(minHeight: 44)
                        }
                    }
                }
                Section {
                    Toggle("Include in review", isOn: Binding(get: { status == .evergreen }, set: { status = $0 ? .evergreen : .draft }))
                        .accessibilityIdentifier("includeNoteInReview")
                } footer: {
                    Text(status == .draft ? "Turn on to schedule the first review tomorrow." : original?.status == .evergreen ? "Your current schedule is kept. Turning this off removes the review schedule." : "The first review is tomorrow. Later reviews are spaced further apart.")
                }
                Section {
                    DisclosureGroup("Optional details", isExpanded: $showingDetails) {
                        TextField("Summary", text: $summary, axis: .vertical).focused($focusedField, equals: .summary)
                            .accessibilityLabel("Summary")
                        EditorError(message: invalidField == .summary ? validation : nil)
                        RecordSelectionLink(model: model, kind: .category, title: "Category", selection: $category)
                        RecordSelectionLink(model: model, kind: .project, title: "Origin project", selection: $origin, none: "No project")
                        NavigationLink {
                            RecordMultiSelector(model: model, kind: .project, title: "Linked projects", selections: $linkedProjects, excluded: origin)
                        } label: { LabeledContent("Linked projects", value: "\(linkedProjects.subtracting([origin]).count) selected") }
                        NavigationLink {
                            RecordMultiSelector(model: model, kind: .capture, title: "Sources", selections: $sources)
                        } label: { LabeledContent("Sources", value: "\(sources.count) selected") }
                        TextField("Location, page, or timestamp", text: $locator).focused($focusedField, equals: .locator)
                            .submitLabel(.done).onSubmit { focusedField = nil }
                        EditorError(message: invalidField == .locator ? validation : nil)
                    }
                } footer: {
                    if showingDetails { Text("The origin is where this note started. Linked projects can reuse it; sources record what you learned from.") }
                }
            }.disabled(submitting || model.isSaving)
                .keyboardDoneButton(isEditing: focusedField != nil) { focusedField = nil }
                .navigationTitle(original == nil ? "New note" : "Edit note")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { closeRequested = true }.disabled(submitting || model.isSaving) }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(submitting ? "Saving…" : "Save") { Task { await save() } }
                            .disabled(!model.canEdit || submitting || model.isSaving || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }.protectDraft(isDirty: initialDraft.map { $0 != draft } ?? false, isSaving: submitting || model.isSaving, closeRequested: $closeRequested) { dismiss() }
                .alert("Restore the original body?", isPresented: $restoringBody) {
                    Button("Keep editing", role: .cancel) { }
                    Button("Restore original", role: .destructive) { restoreBody() }
                } message: { Text("Your text edits will be discarded. The original body and its formatting will be kept.") }
                .onAppear {
                    guard !initialized else { return }; initialized = true
                    if let original {
                        title = original.title; summary = original.summary; bodyText = WorkspaceRules.plainText(original.body)
                        locator = original.locator; origin = original.project; category = original.category; status = original.status
                        linkedProjects = Set(original.linkedProjects); sources = Set(original.sources)
                    } else {
                        origin = projectID ?? ""
                        if let sourceID { sources.insert(sourceID); title = suggestedTitle ?? "" }
                    }
                    initialDraft = draft
                }
        }
    }
    private func restoreBody() {
        bodyText = WorkspaceRules.plainText(original?.body ?? "")
        editingBody = false
        focusedField = nil
    }
    private func save() async {
        guard !submitting else { return }
        do { _ = try WorkspaceRules.validateTitle(title, maximum: 300) }
        catch { validation = error.localizedDescription; invalidField = .title; focusedField = .title; return }
        if summary.count > 1000 { showingDetails = true; validation = "Use up to 1,000 characters for the summary."; invalidField = .summary; focusedField = .summary; return }
        if locator.count > 120 { showingDetails = true; validation = "Use up to 120 characters for the location."; invalidField = .locator; focusedField = .locator; return }
        invalidField = nil; validation = nil; focusedField = nil
        submitting = true
        defer { submitting = false }
        do {
            if try await model.saveKnowledge(original: original, creationID: creationID, title: title, summary: summary,
                                             locator: locator, origin: origin, category: category, status: status,
                                             linkedProjects: linkedProjects, sources: sources,
                                             replacementBody: original == nil || editingBody ? bodyText : nil) {
                onSaved?(original?.id ?? creationID); dismiss()
            } else { validation = model.error }
        } catch { validation = error.localizedDescription; focusedField = .title }
    }
}
