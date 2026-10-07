import Foundation
import Observation
import PokusCore
import PokusNetworking

@MainActor @Observable
final class PagingState<T: Decodable & Identifiable & Sendable> where T.ID == String {
    private(set) var rows: [T] = []
    private(set) var hasMore = false
    private(set) var loaded = false
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var initialError: String?
    private(set) var appendError: String?
    @ObservationIgnored private var reader: RecordReader<T>?
    @ObservationIgnored private var generation = UUID()
    @ObservationIgnored private var identity: String?
    @ObservationIgnored private var contentIdentity: String?
    @ObservationIgnored private var requestTask: Task<BrowseBatch<T>, Error>?
    func isCurrent(_ key: String) -> Bool { identity == key && loaded }
    func reset(api: PocketBaseClient, query: RecordQuery<T>, identity: String = "", contentIdentity: String? = nil, debounce: Bool = false) async {
        let retainedRows = contentIdentity != nil && self.contentIdentity == contentIdentity ? rows : []
        clear(); self.identity = identity; self.contentIdentity = contentIdentity
        rows = retainedRows; reader = RecordReader(api: api, query: query)
        let token = generation
        if debounce {
            isLoading = true
            do { try await Task.sleep(for: .milliseconds(300)) }
            catch { if token == generation { isLoading = false }; return }
            guard token == generation else { return }; isLoading = false
        }
        await more()
    }
    func fail(_ message: String) { clear(); initialError = message }
    func clear() {
        requestTask?.cancel(); requestTask = nil
        generation = UUID(); reader = nil; rows = []; loaded = false; hasMore = false
        identity = nil; contentIdentity = nil
        initialError = nil; appendError = nil; isLoading = false; isLoadingMore = false
    }
    func more(automatic: Bool = false) async {
        guard let reader, !isLoading, !isLoadingMore, !loaded || hasMore,
            !(automatic && (initialError != nil || appendError != nil)) else { return }
        let token = generation
        let request = Task { try await reader.next() }
        requestTask = request
        if loaded { isLoadingMore = true; appendError = nil } else { isLoading = true; initialError = nil }
        defer { if token == generation { isLoading = false; isLoadingMore = false; requestTask = nil } }
        do {
            let batch = try await withTaskCancellationHandler { try await request.value } onCancel: { request.cancel() }
            try Task.checkCancellation()
            guard token == generation else { return }
            if !loaded { rows = [] }
            var ids = Set(rows.map(\.id))
            rows += batch.items.filter { ids.insert($0.id).inserted }
            hasMore = batch.hasMore; loaded = true
            await reader.accept()
        } catch {
            guard token == generation, !Task.isCancelled else { return }
            if loaded { appendError = error.localizedDescription } else { initialError = error.localizedDescription }
        }
    }
    func appeared(_ id: String) async {
        guard let index = rows.firstIndex(where: { $0.id == id }), index >= max(0, rows.count - 5) else { return }
        await more(automatic: true)
    }
}

@MainActor @Observable
final class ReadState<Value: Sendable> {
    private(set) var value: Value?
    private(set) var error: String?
    private(set) var isLoading = false
    @ObservationIgnored private var generation = UUID()
    @ObservationIgnored private var requestTask: Task<Value, Error>?
    func load(_ operation: @escaping @MainActor () async throws -> Value) async {
        requestTask?.cancel()
        let token = UUID(); generation = token; isLoading = true; error = nil
        let request = Task { try await operation() }; requestTask = request
        defer { if generation == token { isLoading = false; requestTask = nil } }
        do {
            let next = try await withTaskCancellationHandler { try await request.value } onCancel: { request.cancel() }
            try Task.checkCancellation()
            guard generation == token else { return }; value = next
        } catch {
            guard generation == token, !Task.isCancelled else { return }; self.error = error.localizedDescription
        }
    }
    func clear() { requestTask?.cancel(); requestTask = nil; generation = UUID(); value = nil; error = nil; isLoading = false }
}
