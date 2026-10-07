import PokusCore
import PokusNetworking
import SwiftUI

struct CaptureEditorView: View {
    @State private var creationID = FocusSession.makeID()
    @Bindable var model: PokusModel
    var original: Capture? = nil
    var projectID: String? = nil
    var showsCancelButton = true
    var onClose: (() -> Void)? = nil
    var onSaved: ((String) -> Void)? = nil
    @State private var showingDetails = false
    @State private var kind: CaptureKind = .note
    @State private var title = ""
    @State private var url = ""
    @State private var author = ""
    @State private var note = ""
    @State private var captureText = ""
    @State private var editingBody = false
    @State private var validation: String?
    @State private var initialized = false
    @State private var fetchingPreview = false
    @State private var saveTask: Task<Void, Never>?
    @State private var closeRequested = false
    @State private var initialDraft: [String]?
    private enum Field { case text, title, url, author, note }
    @FocusState private var focusedField: Field?
    private var draft: [String] {
        original == nil ? [captureText.trimmingCharacters(in: .whitespacesAndNewlines), showingDetails ? kind.rawValue : "auto", title, url, author]
        : [kind.rawValue, title.trimmingCharacters(in: .whitespacesAndNewlines), url, author,
           editingBody ? "replacement" : "original", editingBody ? note : ""]
    }
    /// Choosing a type reveals its fields, prefilled from what was detected; "Detect automatically" hides them again.
    private var chosenKind: Binding<CaptureKind?> {
        Binding(get: { showingDetails ? kind : nil }, set: { choice in
            guard let choice else { showingDetails = false; return }
            if !showingDetails, url.isEmpty { url = LibraryRules.parseCaptureText(captureText).url?.absoluteString ?? "" }
            kind = choice; showingDetails = true
            if choice == .book && title.isEmpty { focusedField = .title }
        })
    }
    /// A new capture needs something to save; edits are validated on save.
    private var hasContent: Bool {
        guard original == nil else { return true }
        let filled = { (value: String) in !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        return filled(captureText) || (showingDetails && (filled(title) || filled(url)))
    }
    @ScaledMetric(relativeTo: .body) private var captureHeight = 180
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form {
                AccountNotice(model: model)
                if original == nil {
                    Section {
                        TextEditor(text: $captureText)
                            .focused($focusedField, equals: .text)
                            .frame(minHeight: captureHeight)
                            .editorPrompt("Paste a link or jot down a thought…", isShowing: captureText.isEmpty)
                            .accessibilityLabel("Link or thought to capture")
                            .accessibilityIdentifier("captureText")
                            .disabled(!model.canEdit || fetchingPreview)
                            .onChange(of: captureText) { validation = nil }
                        if captureText.isEmpty && model.canEdit {
                            PasteButton(payloadType: String.self) { strings in
                                Task { @MainActor in captureText = strings.first ?? "" }
                            }.labelStyle(.titleAndIcon).buttonBorderShape(.capsule).frame(minHeight: 44)
                        }
                        EditorError(message: validation)
                    } footer: {
                        if !showingDetails, !captureText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            CaptureDetectionBadge(text: captureText)
                        } else if !showingDetails {
                            Text("Save it now, sort it later. Links are recognized automatically.")
                        }
                    }
                    Section {
                        Picker("Type", selection: chosenKind) {
                            Text("Detect automatically").tag(CaptureKind?.none)
                            Divider()
                            ForEach(CaptureKind.allCases, id: \.self) { Label($0.label, systemImage: $0.icon).tag(CaptureKind?.some($0)) }
                        }.accessibilityIdentifier("captureType")
                        if showingDetails {
                            TextField(kind == .book ? "Book title" : "Title (optional)", text: $title)
                                .focused($focusedField, equals: .title).submitLabel(.next).onSubmit { focusedField = .url }
                            TextField(kind == .book || kind == .note ? "Link (optional)" : "Link", text: $url)
                                .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                                .focused($focusedField, equals: .url).submitLabel(kind == .book ? .next : .done)
                                .onSubmit { focusedField = kind == .book ? .author : nil }
                            if kind == .book { TextField("Author (optional)", text: $author).focused($focusedField, equals: .author).submitLabel(.done) }
                        }
                    } footer: {
                        Text(showingDetails ? "Your chosen type and link take priority over automatic detection. Your captured text is kept as the note."
                             : "Choose a type to add a title or capture a book.")
                    }
                } else {
                    Section("Capture") {
                        Picker("Type", selection: $kind) { ForEach(CaptureKind.allCases, id: \.self) { Text($0.label).tag($0) } }.accessibilityIdentifier("captureType")
                        TextField("Title (optional)", text: $title)
                            .focused($focusedField, equals: .title).submitLabel(.next).onSubmit { focusedField = .url }
                        EditorError(message: validation)
                        TextField("Link", text: $url).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                            .focused($focusedField, equals: .url).submitLabel(kind == .book || editingBody ? .next : .done)
                            .onSubmit { focusedField = kind == .book ? .author : editingBody ? .note : nil }
                        if kind == .book {
                            TextField("Author", text: $author)
                                .focused($focusedField, equals: .author).submitLabel(editingBody ? .next : .done)
                                .onSubmit { focusedField = editingBody ? .note : nil }
                        }
                    }
                    Section("Note") {
                        if let original, !editingBody {
                            RichDescription(html: original.note)
                            Button("Edit as plain text") { editingBody = true }
                        } else {
                            TextEditor(text: $note).frame(minHeight: 140).focused($focusedField, equals: .note)
                                .editorPrompt("Add a note", isShowing: note.isEmpty)
                                .accessibilityLabel("Capture note")
                            Text("Saving replaces the note's existing formatting with plain paragraphs.").font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }
            }.disabled(fetchingPreview || model.isSaving)
                .keyboardDoneButton(isEditing: focusedField != nil) { focusedField = nil }
                .navigationTitle(original == nil ? "New capture" : "Edit capture")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if showsCancelButton {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { saveTask?.cancel(); closeRequested = true }.keyboardShortcut(.cancelAction).disabled(model.isSaving)
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) { Button(fetchingPreview ? "Saving…" : "Save", action: beginSave).disabled(!model.canEdit || fetchingPreview || !hasContent) }
                }.protectDraft(isDirty: initialDraft.map { $0 != draft } ?? false, isSaving: model.isSaving, closeRequested: $closeRequested) { saveTask?.cancel(); close() }
                .onAppear {
                    guard !initialized else { return }; initialized = true
                    if let original { kind = original.kind; title = original.title; url = original.url ?? ""; author = original.author ?? ""; note = WorkspaceRules.plainText(original.note) }
                    initialDraft = draft
                }
                .task {
                    // Capturing should be one step: open ready to type, after the sheet or tab finishes appearing.
                    guard original == nil, model.canEdit, captureText.isEmpty else { return }
                    try? await Task.sleep(for: .milliseconds(450))
                    if !Task.isCancelled { focusedField = .text }
                }
                .onDisappear { if !model.isSaving { saveTask?.cancel() } }
        }
    }
    private func close() {
        if let onClose { onClose() } else { dismiss() }
    }
    private func beginSave() {
        guard !fetchingPreview else { return }
        focusedField = nil
        fetchingPreview = true
        saveTask = Task { await save() }
    }
    private func save() async {
        defer { fetchingPreview = false }
        do {
            let parsed = LibraryRules.parseCaptureText(captureText)
            let detailed = original != nil || showingDetails
            let kind = detailed ? self.kind : parsed.kind
            let title = detailed ? self.title : ""
            let url = detailed ? self.url : parsed.url?.absoluteString ?? ""
            let note = original == nil ? (showingDetails ? captureText.trimmingCharacters(in: .whitespacesAndNewlines) : parsed.note) : self.note
            let author = detailed ? self.author : ""
            let saved = try await model.saveCapture(original: original, creationID: creationID, projectID: projectID,
                                                    kind: kind, title: title, url: url, author: author,
                                                    replacementNote: original == nil || editingBody ? note : nil)
            guard !Task.isCancelled else { return }
            if saved { onSaved?(original?.id ?? creationID); close() } else { validation = model.error }
        } catch { if !Task.isCancelled { validation = error.localizedDescription; focusedField = original == nil ? .text : .title } }
    }
}

/// Shows, while typing, what the capture will be saved as.
private struct CaptureDetectionBadge: View {
    let text: String
    var body: some View {
        let parsed = LibraryRules.parseCaptureText(text)
        let host = parsed.url?.host().map { $0.hasPrefix("www.") ? String($0.dropFirst(4)) : $0 }
        let summary = [parsed.kind.label, host].compactMap { $0 }.joined(separator: " · ")
        HStack(spacing: 6) {
            Text("Saves as")
            Label(summary, systemImage: parsed.kind.icon)
                .font(.caption.weight(.semibold)).foregroundStyle(parsed.kind.tint).lineLimit(1)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(parsed.kind.tint.opacity(0.14), in: Capsule())
        }
        .accessibilityElement(children: .ignore).accessibilityLabel("Saves as \(summary)")
        .accessibilityIdentifier("captureDetection")
    }
}
