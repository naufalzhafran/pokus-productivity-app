import CryptoKit
import Foundation

public enum APIReadCacheError: LocalizedError {
    case unavailableOffline

    public var errorDescription: String? {
        "This screen has no saved data yet. Connect to load it."
    }
}

/// Display reads only. Synchronization and write validation must use an uncached client.
public actor APIReadCache {
    private struct Key: Codable, Hashable {
        let url: URL
        let scope: String
        let timeout: TimeInterval
        let logicalKey: String?
    }
    private struct Entry: Codable {
        let data: Data
        var expiresAt: Date
        let retainedUntil: Date
        var access: UInt64
        /// Changed by an edit: refetch while online, but keep it for offline reading.
        var revalidate: Bool?
    }
    private struct SavedEntry: Codable {
        let key: Key
        let entry: Entry
    }
    private struct Snapshot: Codable {
        let version: Int
        let entries: [SavedEntry]
    }
    private struct Flight {
        let key: Key
        let generation: UUID
        let background: Bool
        let task: Task<Void, Never>
        var waiters: [UUID: CheckedContinuation<Data, Error>]
    }

    private let timeToLive: TimeInterval
    private let maximumEntries: Int
    private let maximumBytes: Int
    private let now: @Sendable () -> Date
    private let directory: URL?
    private let accountID: String?
    private let staleWhileRevalidate: Bool
    private let onUpdate: @Sendable () -> Void
    private let persistDelay: Duration
    private var persistTask: Task<Void, Never>?
    private let retention: TimeInterval = 30 * 24 * 60 * 60
    private var restored = false
    private var isActive = true
    private var entries: [Key: Entry] = [:]
    private var byteCount = 0
    private var access: UInt64 = 0
    private var generation = UUID()
    private var flights: [UUID: Flight] = [:]
    private var activeKeys: [Key: UUID] = [:]

    public init(timeToLive: TimeInterval = 60, maximumEntries: Int = 128,
                maximumBytes: Int = 8 * 1024 * 1024,
                now: @escaping @Sendable () -> Date = { Date() },
                directory: URL? = nil, accountID: String? = nil,
                staleWhileRevalidate: Bool = false, persistDelay: Duration = .zero,
                onUpdate: @escaping @Sendable () -> Void = {}) {
        self.timeToLive = max(0, timeToLive)
        self.maximumEntries = max(0, maximumEntries)
        self.maximumBytes = max(0, maximumBytes)
        self.now = now
        self.directory = directory
        self.accountID = accountID
        self.staleWhileRevalidate = staleWhileRevalidate
        self.onUpdate = onUpdate
        self.persistDelay = persistDelay
    }

    public func invalidate() {
        entries.removeAll()
        byteCount = 0
        restored = true
        persistTask?.cancel(); persistTask = nil
        advanceGeneration()
        if let fileURL { try? FileManager.default.removeItem(at: fileURL) }
    }

    /// After an edit, affected reads are fetched again while online. Until a refetch
    /// succeeds the saved copy stays, so the screen still opens offline.
    public func markForRevalidation(collections: Set<String>) {
        guard isActive, !collections.isEmpty else { return }
        restoreIfNeeded()
        for key in entries.keys where collections.contains(where: {
            key.url.path.contains("/api/collections/\($0)/")
        }) {
            entries[key]?.revalidate = true
        }
        advanceGeneration()
        persist()
    }

    /// Writes any batched changes now, such as when the app moves to the background.
    public func flush() {
        guard persistTask != nil else { return }
        persistTask?.cancel(); persistTask = nil
        write()
    }

    /// Preserve saved content after a mutation while ensuring its next read refreshes it.
    public func markStale() {
        guard isActive else { return }
        restoreIfNeeded()
        for key in entries.keys { entries[key]?.expiresAt = .distantPast }
        advanceGeneration()
        persist()
    }

    /// Retire an account's client before replacing it, without erasing its saved content.
    public func deactivate() {
        flush()
        isActive = false
        advanceGeneration()
        for flight in flights.values {
            flight.task.cancel()
            for waiter in flight.waiters.values { waiter.resume(throwing: CancellationError()) }
        }
        flights.removeAll()
    }

    func data(for request: URLRequest, cacheKey: String? = nil, allowNetwork: Bool = true,
              load: @escaping @Sendable () async throws -> Data) async throws -> Data {
        try Task.checkCancellation()
        guard isActive else { throw CancellationError() }
        restoreIfNeeded()
        let key = makeKey(request, cacheKey: cacheKey)
        let date = now()
        var fallback: Data?
        if var entry = entries[key] {
            if entry.retainedUntil > date, entry.revalidate == true, allowNetwork {
                fallback = entry.data
            } else if entry.retainedUntil > date && (entry.expiresAt > date || staleWhileRevalidate || !allowNetwork) {
                access &+= 1
                entry.access = access
                entries[key] = entry
                if allowNetwork, entry.expiresAt <= date, activeKeys[key] == nil {
                    startFlight(key, background: true, waiters: [:], load: load)
                }
                return entry.data
            } else {
                removeEntry(key)
                persist()
            }
        }
        guard allowNetwork else { throw APIReadCacheError.unavailableOffline }
        do { return try await wait(for: key, load: load) }
        catch {
            // A failed refetch after an edit still shows the saved copy, unless the record is gone.
            if (error as? APIError)?.status == 404, fallback != nil, isActive { removeEntry(key); persist() }
            else if let fallback, !(error is CancellationError) { return fallback }
            throw error
        }
    }

    private func wait(for key: Key, load: @escaping @Sendable () async throws -> Data) async throws -> Data {
        let waiter = UUID()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                guard !Task.isCancelled else {
                    continuation.resume(throwing: CancellationError())
                    return
                }
                if let id = activeKeys[key], var flight = flights[id] {
                    flight.waiters[waiter] = continuation
                    flights[id] = flight
                } else {
                    startFlight(key, background: false, waiters: [waiter: continuation], load: load)
                }
            }
        } onCancel: {
            Task { await self.cancel(waiter) }
        }
    }

    private func makeKey(_ request: URLRequest, cacheKey: String?) -> Key {
        var url = request.url!
        if cacheKey != nil, var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            parts.query = nil
            url = parts.url!
        }
        // Persist an identity or digest, never the bearer token itself.
        let scope = accountID.map { "account:\($0)" }
            ?? "authorization:\(Self.digest(request.value(forHTTPHeaderField: "Authorization") ?? ""))"
        return Key(url: url, scope: scope, timeout: request.timeoutInterval, logicalKey: cacheKey)
    }

    private func startFlight(_ key: Key, background: Bool,
                             waiters: [UUID: CheckedContinuation<Data, Error>],
                             load: @escaping @Sendable () async throws -> Data) {
        let id = UUID()
        let task = Task {
            let result: Result<Data, Error>
            do { result = .success(try await load()) }
            catch { result = .failure(error) }
            finish(id, result: result)
        }
        flights[id] = Flight(key: key, generation: generation, background: background, task: task, waiters: waiters)
        activeKeys[key] = id
    }

    private func cancel(_ waiter: UUID) {
        guard let id = flights.first(where: { $0.value.waiters[waiter] != nil })?.key,
              var flight = flights[id], let continuation = flight.waiters.removeValue(forKey: waiter) else { return }
        if flight.waiters.isEmpty && !flight.background {
            flights.removeValue(forKey: id)
            if activeKeys[flight.key] == id { activeKeys.removeValue(forKey: flight.key) }
            flight.task.cancel()
        } else {
            flights[id] = flight
        }
        continuation.resume(throwing: CancellationError())
    }

    private func finish(_ id: UUID, result: Result<Data, Error>) {
        guard let flight = flights.removeValue(forKey: id) else { return }
        if activeKeys[flight.key] == id { activeKeys.removeValue(forKey: flight.key) }
        if isActive, flight.generation == generation {
            switch result {
            case .success(let data):
                let changed = entries[flight.key]?.data != data
                if !store(data, for: flight.key), entries[flight.key] != nil {
                    removeEntry(flight.key)
                    persist()
                }
                if flight.background, changed { onUpdate() }
            case .failure(let error as APIError) where error.status == 404 && flight.background:
                removeEntry(flight.key)
                persist()
                onUpdate()
            case .failure:
                break
            }
        }
        for waiter in flight.waiters.values { waiter.resume(with: result) }
    }

    private func advanceGeneration() {
        generation = UUID()
        // Existing readers may finish, but their response cannot repopulate the cache.
        activeKeys.removeAll()
        for (id, flight) in flights where flight.background {
            flight.task.cancel()
            for waiter in flight.waiters.values { waiter.resume(throwing: CancellationError()) }
            flights.removeValue(forKey: id)
        }
    }

    @discardableResult
    private func store(_ data: Data, for key: Key) -> Bool {
        guard timeToLive > 0, maximumEntries > 0, data.count <= maximumBytes else { return false }
        let date = now()
        for key in entries.keys where entries[key]!.retainedUntil <= date ||
            (!staleWhileRevalidate && directory == nil && entries[key]!.expiresAt <= date) {
            removeEntry(key)
        }
        removeEntry(key)
        while entries.count >= maximumEntries || byteCount + data.count > maximumBytes {
            guard let oldest = entries.min(by: { $0.value.access < $1.value.access })?.key else { break }
            removeEntry(oldest)
        }
        access &+= 1
        entries[key] = Entry(data: data, expiresAt: date.addingTimeInterval(timeToLive),
                             retainedUntil: date.addingTimeInterval(retention), access: access)
        byteCount += data.count
        persist()
        return true
    }

    private func removeEntry(_ key: Key) {
        if let entry = entries.removeValue(forKey: key) { byteCount -= entry.data.count }
    }

    private var fileURL: URL? {
        directory?.appendingPathComponent("display-reads-\(Self.digest(accountID ?? "token-scoped")).json")
    }

    private static func digest(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    // Disk work is lazy and actor-isolated, so initializing a model never blocks the main actor.
    private func restoreIfNeeded() {
        guard !restored else { return }
        restored = true
        guard let fileURL else { return }
        do {
            let size = try fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size <= maximumBytes * 2 + maximumEntries * 4096 else { return }
            let snapshot = try JSONDecoder().decode(Snapshot.self, from: Data(contentsOf: fileURL))
            guard snapshot.version == 1 else { return }
            let date = now()
            for saved in snapshot.entries.sorted(by: { $0.entry.access > $1.entry.access }) {
                guard saved.entry.retainedUntil > date, saved.entry.data.count <= maximumBytes,
                      entries.count < maximumEntries, byteCount + saved.entry.data.count <= maximumBytes,
                      entries[saved.key] == nil,
                      accountID == nil || saved.key.scope == "account:\(accountID!)" else { continue }
                entries[saved.key] = saved.entry
                byteCount += saved.entry.data.count
                access = max(access, saved.entry.access)
            }
        } catch {
            // Missing, corrupt, or unavailable cache files are just a cache miss.
        }
    }

    /// Coalesces disk writes; with a delay, many responses share one write.
    private func persist() {
        guard isActive, directory != nil else { return }
        guard persistDelay > .zero else { write(); return }
        guard persistTask == nil else { return }
        let delay = persistDelay
        persistTask = Task { [weak self] in
            do { try await Task.sleep(for: delay) } catch { return }
            await self?.finishScheduledWrite()
        }
    }

    private func finishScheduledWrite() {
        persistTask = nil
        write()
    }

    private func write() {
        guard isActive, let directory, let fileURL else { return }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let snapshot = Snapshot(version: 1, entries: entries.map { SavedEntry(key: $0.key, entry: $0.value) })
            try JSONEncoder().encode(snapshot).write(to: fileURL, options: .atomic)
            var excludedDirectory = directory
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? excludedDirectory.setResourceValues(values)
        } catch {
            // A full or unavailable disk must not prevent opening a screen.
        }
    }
}
