import PokusCore
import PokusNetworking
import SwiftUI

struct PagedRows<T: Decodable & Identifiable & Sendable, Row: View>: View where T.ID == String {
    let model: PokusModel
    let query: RecordQuery<T>
    var identity = ""
    var search = ""
    var emptyTitle = "No matching records"
    var symbol = "tray"
    var emptyDescription = ""
    var emptyActionTitle: String? = nil
    var emptyAction: (() -> Void)? = nil
    var emptyActionDisabled = false
    /// Shows the empty title as a quiet row, for sections that sit among other content.
    var compactEmpty = false
    var excluding: Set<String> = []
    @ViewBuilder var row: (T) -> Row
    @State private var paging = PagingState<T>()
    @State private var retry = 0
    private var contentIdentity: String {
        ([model.scope?.generation.uuidString ?? "signedout", query.collection, query.fields, query.expand, identity, search]
            + (query.cacheKey.map { [$0] } ?? query.segments.flatMap { [$0.filter, $0.sort] })).joined(separator: "\u{1F}")
    }
    var body: some View {
        Group {
            ForEach(paging.rows.filter { !excluding.contains($0.id) }) { item in
                row(item).onAppear { Task { await paging.appeared(item.id) } }
                    .modifier(SyncMark(model: model, id: item.id))
            }
            if paging.rows.isEmpty && (paging.isLoading || (!paging.loaded && paging.initialError == nil)) { ProgressView("Loading records") }
            if let error = paging.initialError {
                ReadError(message: error) { retry += 1 }
            } else if paging.loaded && paging.rows.isEmpty && compactEmpty {
                Text(emptyTitle).foregroundStyle(.secondary)
            } else if paging.loaded && paging.rows.isEmpty {
                ContentUnavailableView {
                    Label(emptyTitle, systemImage: symbol)
                } description: {
                    if !emptyDescription.isEmpty { Text(emptyDescription) }
                } actions: {
                    if let emptyActionTitle, let emptyAction { Button(emptyActionTitle, action: emptyAction).disabled(emptyActionDisabled).frame(minHeight: 44) }
                }
            }
            if paging.isLoadingMore { ProgressView("Loading more") }
            else if let error = paging.appendError {
                ReadError(message: error) { Task { await paging.more() } }
            } else if paging.hasMore {
                Button("Load more") { Task { await paging.more() } }.frame(minHeight: 44)
            }
        }
        .task(id: "\(model.queryIdentity)-\(identity)-\(search)-\(retry)") {
            let key = "\(model.queryIdentity)-\(identity)-\(search)-\(retry)"
            if paging.isCurrent(key) { return }
            do {
                await paging.reset(api: try model.readAPI(), query: query, identity: key, contentIdentity: contentIdentity,
                    debounce: !search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            catch { paging.fail(error.localizedDescription) }
        }
    }
}

/// Marks a row whose local change hasn't reached PocketBase yet.
struct SyncMark: ViewModifier {
    let model: PokusModel
    let id: String
    func body(content: Content) -> some View {
        if model.replicaStatus.failedIDs.contains(id) {
            content.badge(Text("\(Image(systemName: "exclamationmark.icloud"))")).accessibilityHint("This change couldn't sync. Review it in Profile.")
        } else if model.pendingIDs.contains(id) {
            content.badge(Text("\(Image(systemName: "icloud.and.arrow.up"))")).accessibilityHint("Waiting to sync")
        } else {
            content
        }
    }
}

struct ReadError: View {
    let message: String
    var retry: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(message).font(.footnote).foregroundStyle(.secondary)
            Button("Retry", action: retry).frame(minHeight: 44)
        }.accessibilityElement(children: .contain)
    }
}

struct RemoteRecord<T: Decodable & Sendable, Content: View>: View {
    let model: PokusModel
    let collection: String
    let id: String
    @ViewBuilder var content: (T) -> Content
    @State private var state = ReadState<T?>()
    @State private var retry = 0
    @State private var loadedContentIdentity: String?
    private var contentIdentity: String { "\(model.scope?.generation.uuidString ?? "signedout")-\(collection)-\(id)" }
    var body: some View {
        Group {
            if let record = state.value ?? nil { content(record) }
            else if let error = state.error { ReadError(message: error) { retry += 1 } }
            else if state.isLoading || state.value == nil { ProgressView("Loading details") }
            else { ContentUnavailableView("Record unavailable", systemImage: "tray", description: Text("It may have been deleted.")) }
        }
        .task(id: "\(model.queryIdentity)-\(contentIdentity)-\(retry)") {
            if loadedContentIdentity != contentIdentity { state.clear(); loadedContentIdentity = contentIdentity }
            await state.load { try await model.readAPI().record(collection, id: id) }
        }
    }
}

enum SelectionKind { case project, category, capture }
struct RecordSelectionLink: View {
    let model: PokusModel
    let kind: SelectionKind
    let title: String
    @Binding var selection: String
    var none = "None"
    var body: some View {
        NavigationLink {
            RecordSelector(model: model, kind: kind, title: title, selection: $selection, none: none)
        } label: {
            HStack { Text(title); Spacer(); SelectedRecordLabel(model: model, kind: kind, id: selection, none: none).foregroundStyle(.secondary) }
        }
    }
}
struct SelectedRecordLabel: View {
    let model: PokusModel
    let kind: SelectionKind
    let id: String
    var none = "None"
    @State private var state = ReadState<String>()
    @State private var loadedContentIdentity: String?
    private var contentIdentity: String { "\(model.scope?.generation.uuidString ?? "signedout")-\(kind)-\(id)" }
    var body: some View {
        Text(id.isEmpty ? none : state.value ?? "Selected record").lineLimit(1)
            .task(id: "\(model.queryIdentity)-\(contentIdentity)") {
                if loadedContentIdentity != contentIdentity { state.clear(); loadedContentIdentity = contentIdentity }
                guard !id.isEmpty else { return }
                await state.load {
                    let api = try model.readAPI()
                    switch kind {
                    case .project: let record: Project? = try await api.record("projects", id: id); return record?.title ?? "Unavailable project"
                    case .category: let record: FocusCategory? = try await api.record("categories", id: id); return record?.name ?? "Unavailable category"
                    case .capture: let record: Capture? = try await api.record("captures", id: id); return record?.label ?? "Unavailable source"
                    }
                }
            }
    }
}
struct RecordSelector: View {
    let model: PokusModel
    let kind: SelectionKind
    let title: String
    @Binding var selection: String
    var none = "None"
    @State private var search = ""
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        List {
            choice("", none)
            if !selection.isEmpty {
                Section("Selected") { Button { dismiss() } label: { SelectedRecordLabel(model: model, kind: kind, id: selection) }.accessibilityAddTraits(.isSelected) }
            }
            switch kind {
            case .project:
                PagedRows(model: model, query: RecordQueries.projects(search: search), search: search) { choice($0.id, $0.title) }
            case .category:
                PagedRows(model: model, query: RecordQueries.categories(search: search), search: search) { choice($0.id, $0.name) }
            case .capture:
                PagedRows(model: model, query: RecordQueries.captures(search: search), search: search) { choice($0.id, $0.label) }
            }
        }.id(search).navigationTitle(title).searchable(text: $search).refreshable { await model.refresh() }
    }
    private func choice(_ id: String, _ label: String) -> some View {
        Button { selection = id; dismiss() } label: {
            HStack { Text(label).foregroundStyle(.primary); Spacer(); if selection == id { Image(systemName: "checkmark").accessibilityHidden(true) } }.frame(minHeight: 44)
        }.accessibilityAddTraits(selection == id ? .isSelected : [])
    }
}
struct RecordMultiSelector: View {
    let model: PokusModel
    let kind: SelectionKind
    let title: String
    @Binding var selections: Set<String>
    var excluded = ""
    @State private var search = ""
    @State private var selectedOnly = false
    var body: some View {
        List {
            Toggle("Show selected only", isOn: $selectedOnly)
            if kind == .project {
                PagedRows(model: model, query: RecordQueries.projects(search: search, ids: selectedOnly ? Array(selections) : nil),
                    identity: "\(selectedOnly)-\(selectedOnly ? selections.sorted().joined() : "")", search: search, excluding: [excluded]) { choice($0.id, $0.title) }
            } else {
                PagedRows(model: model, query: RecordQueries.captures(search: search, ids: selectedOnly ? Array(selections) : nil),
                    identity: "\(selectedOnly)-\(selectedOnly ? selections.sorted().joined() : "")", search: search) { choice($0.id, $0.label) }
            }
        }.id("\(selectedOnly)-\(search)").navigationTitle(title).searchable(text: $search).refreshable { await model.refresh() }
    }
    private func choice(_ id: String, _ title: String) -> some View {
        Toggle(title, isOn: Binding(get: { selections.contains(id) }, set: { if $0 { selections.insert(id) } else { selections.remove(id) } })).frame(minHeight: 44)
    }
}
