import CryptoKit
import DailyCore
import Foundation
import PokusCore

public enum ReplicaError: LocalizedError, Equatable {
    case fullContentOffline, olderHistoryOffline
    public var errorDescription: String? {
        switch self {
        case .fullContentOffline: return "This item's full details aren't saved on this iPhone. Connect to open it."
        case .olderHistoryOffline: return "Older history isn't saved on this iPhone. Connect to see it."
        }
    }
}

public struct FailedChange: Sendable, Equatable, Identifiable {
    public let id: String
    public let summary: String
    public let message: String
}

public struct ReplicaStatus: Sendable, Equatable {
    public var ready = false
    /// Record IDs with a local change that hasn't reached PocketBase yet.
    public var pendingIDs: Set<String> = []
    /// Record IDs of changes PocketBase rejected, kept until retried or discarded.
    public var failedIDs: Set<String> = []
    public var pendingChanges = 0
    public var failed: [FailedChange] = []
    public var lastSynced: Date?
    public var storedBytes = 0
    public var notice: String?
    public init() {}
}

struct OutboxRequest: Codable, Sendable {
    var method: String
    var collection: String
    var id: String
    var body: [String: JSONValue]
}

struct OutboxEntry: Codable, Sendable {
    var id: String
    var created: Double
    var requests: [OutboxRequest]
    var batch: Bool
    var failure: String?
    /// Digest of each knowledge body this change replaces, as last downloaded from PocketBase.
    var bodyBase: [String: String]?
}

struct StreakAccumulator: Codable, Sendable {
    var last: DayKey?
    var run = 0, longest = 0, count = 0
    mutating func append(_ day: DayKey) {
        guard last != day else { return }
        run = last?.adding(days: 1) == day ? run + 1 : 1
        longest = max(longest, run); count += 1; last = day
    }
    func result(_ today: DayKey) -> Streaks {
        Streaks(current: last == today || last == today.adding(days: -1) ? run : 0, longest: longest, completedDays: count)
    }
}

/// Streak state for every habit entry older than the window kept on the device.
struct HabitBaseline: Codable, Sendable {
    var windowStart: String
    var byHabit: [String: StreakAccumulator]
    var overall: StreakAccumulator
    var dirty = false
}

struct FocusSummary: Codable, Sendable {
    var total: Int
    var cursor: String
    var atCursor: [String]
}

struct ReplicaState: Codable, Sendable {
    var initialized = false
    var cursors: [String: String] = [:]
    var lastPull: Double?
    var lastReconcile: Double?
    var sessionWindowStart: Double?
    var habitWindowStart: String?
    var accessed: [String: Double] = [:]
    var focus: FocusSummary?
    var habits: HabitBaseline?
    var countedSessions: [String] = []
}

private struct CollectionFile: Codable {
    var rows: [String: [String: JSONValue]]
    var trimmed: [String: [String]]
}

/// An account's PocketBase records on this device. Reads are answered locally; writes are
/// applied locally at once and queued, so screens and edits work without a connection.
public actor RecordReplica {
    public nonisolated let owner: String
    let directory: URL
    let now: @Sendable () -> Date
    var loaded = false
    var rows: RecordTables = [:]
    var trimmed: [String: [String: Set<String>]] = [:]
    var outbox: [OutboxEntry] = []
    var state = ReplicaState()
    var dirtyCollections: Set<String> = []
    var stateDirty = false
    var notice: String?
    private var cachedView: RecordTables?
    private var cachedTrim: [String: [String: Set<String>]]?

    public init(directory: URL, owner: String, now: @escaping @Sendable () -> Date = { Date() }) {
        self.directory = directory; self.owner = owner; self.now = now
    }

    public var isReady: Bool { loadIfNeeded(); return state.initialized }

    // MARK: Storage

    private var stateURL: URL { directory.appendingPathComponent("state.json") }
    private var outboxURL: URL { directory.appendingPathComponent("outbox.json") }
    private var rowsDirectory: URL { directory.appendingPathComponent("rows", isDirectory: true) }
    private func rowsURL(_ collection: String) -> URL { rowsDirectory.appendingPathComponent(collection + ".json") }

    func loadIfNeeded() {
        guard !loaded else { return }
        loaded = true
        let decoder = JSONDecoder()
        if let data = try? Data(contentsOf: stateURL), let saved = try? decoder.decode(ReplicaState.self, from: data) { state = saved }
        if let data = try? Data(contentsOf: outboxURL) {
            if let saved = try? decoder.decode([OutboxEntry].self, from: data) { outbox = saved }
            else {
                // Never discard unsynced work silently; keep the unreadable copy for recovery.
                let copy = directory.appendingPathComponent("outbox.unreadable-\(Int(now().timeIntervalSince1970)).json")
                try? FileManager.default.moveItem(at: outboxURL, to: copy)
                notice = "Some unsynced changes on this iPhone couldn't be read. A copy was kept."
            }
        }
        var damaged = false
        for collection in RecordSchema.replicated {
            guard let data = try? Data(contentsOf: rowsURL(collection)) else { damaged = damaged || state.initialized; continue }
            guard let file = try? decoder.decode(CollectionFile.self, from: data) else { damaged = true; continue }
            rows[collection] = file.rows
            trimmed[collection] = file.trimmed.mapValues(Set.init)
        }
        if damaged {
            // Missing or damaged downloads are fetched again in full; unsynced changes are kept.
            state = ReplicaState(); rows = [:]; trimmed = [:]
        }
    }

    func saveOutbox() throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try JSONEncoder().encode(outbox).write(to: outboxURL, options: .atomic)
    }

    /// Writes downloaded rows and sync state. Losing these only costs a re-download.
    public func flush() {
        loadIfNeeded()
        guard !dirtyCollections.isEmpty || stateDirty else { return }
        do {
            try FileManager.default.createDirectory(at: rowsDirectory, withIntermediateDirectories: true)
            var excluded = rowsDirectory, values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? excluded.setResourceValues(values)
            let encoder = JSONEncoder()
            for collection in dirtyCollections {
                let file = CollectionFile(rows: rows[collection] ?? [:], trimmed: (trimmed[collection] ?? [:]).mapValues { $0.sorted() })
                try encoder.encode(file).write(to: rowsURL(collection), options: .atomic)
            }
            dirtyCollections.removeAll()
            try encoder.encode(state).write(to: stateURL, options: .atomic)
            stateDirty = false
        } catch {
            // A full disk must not block reading; the next successful flush catches up.
        }
    }

    /// Sign-out: remove downloaded records but keep changes that haven't synced.
    public func removeDownloadedData() {
        loadIfNeeded()
        try? FileManager.default.removeItem(at: rowsDirectory)
        try? FileManager.default.removeItem(at: stateURL)
        rows = [:]; trimmed = [:]; state = ReplicaState(); dirtyCollections = []; stateDirty = false
        changed()
    }

    /// Re-download everything on the next pull without hiding what's saved meanwhile.
    public func prepareRedownload() {
        loadIfNeeded()
        state.cursors = [:]; state.lastReconcile = nil; state.focus = nil; state.habits = nil; state.countedSessions = []
        stateDirty = true
        flush()
    }

    func storedBytes() -> Int {
        guard let files = FileManager.default.enumerator(at: directory, includingPropertiesForKeys: [.fileSizeKey]) else { return 0 }
        var total = 0
        for case let file as URL in files { total += (try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0 }
        return total
    }

    // MARK: Materialized view

    func changed() { cachedView = nil; cachedTrim = nil }

    /// Downloaded rows with every queued change applied on top, in order.
    func view() -> (tables: RecordTables, trimmed: [String: [String: Set<String>]]) {
        if let cachedView, let cachedTrim { return (cachedView, cachedTrim) }
        var tables = rows, trim = trimmed
        for entry in outbox {
            let stamp = RecordSchema.timestamp(Date(timeIntervalSince1970: entry.created))
            for request in entry.requests { Self.apply(request, to: &tables, trimmed: &trim, stamp: stamp) }
        }
        cachedView = tables; cachedTrim = trim
        return (tables, trim)
    }

    static func apply(_ request: OutboxRequest, to tables: inout RecordTables, trimmed: inout [String: [String: Set<String>]], stamp: String) {
        let collection = request.collection, id = request.id
        if request.method == "DELETE" { delete(collection, id: id, from: &tables, trimmed: &trimmed); return }
        var row: [String: JSONValue]
        if let existing = tables[collection]?[id] {
            guard request.method != "POST" else { return }
            row = existing
        } else {
            guard request.method != "PATCH" else { return }
            row = RecordSchema.emptyRecord(collection)
            row["created"] = .string(stamp)
        }
        assign(request.body, to: &row)
        row["id"] = .string(id); row["updated"] = .string(stamp)
        tables[collection, default: [:]][id] = row
        if let heavy = RecordSchema.heavyFields[collection], var marks = trimmed[collection]?[id] {
            marks.subtract(request.body.keys.map { $0.hasSuffix("+") || $0.hasSuffix("-") ? String($0.dropLast()) : $0 }.filter(heavy.contains))
            trimmed[collection]?[id] = marks.isEmpty ? nil : marks
        }
    }

    /// PocketBase field assignment, including `field+` / `field-` modifiers.
    static func assign(_ body: [String: JSONValue], to row: inout [String: JSONValue]) {
        for (key, value) in body where key != "id" {
            guard key.hasSuffix("+") || key.hasSuffix("-") else { row[key] = value; continue }
            let field = String(key.dropLast()), adding = key.hasSuffix("+")
            if case .number(let delta) = value {
                let current: Double; if case .number(let number)? = row[field] { current = number } else { current = 0 }
                row[field] = .number(adding ? current + delta : current - delta); continue
            }
            let changes: [JSONValue]; if case .array(let values) = value { changes = values } else { changes = [value] }
            var result = RecordSchema.ids(row[field]).map(JSONValue.string)
            if adding { for change in changes where !result.contains(change) { result.append(change) } }
            else { result.removeAll { changes.contains($0) } }
            row[field] = .array(result)
        }
    }

    /// PocketBase deletes cascading relations and unsets the others.
    static func delete(_ collection: String, id: String, from tables: inout RecordTables, trimmed: inout [String: [String: Set<String>]]) {
        guard tables[collection]?.removeValue(forKey: id) != nil else { return }
        trimmed[collection]?[id] = nil
        for (other, fields) in RecordSchema.relations {
            for (field, relation) in fields where relation.collection == collection {
                for (rowID, row) in tables[other] ?? [:] where RecordSchema.ids(row[field]).contains(id) {
                    if relation.cascade { delete(other, id: rowID, from: &tables, trimmed: &trimmed); continue }
                    var updated = row
                    updated[field] = relation.multiple ? .array(RecordSchema.ids(row[field]).filter { $0 != id }.map(JSONValue.string)) : .string("")
                    tables[other]?[rowID] = updated
                }
            }
        }
    }

    // MARK: Status

    public func status() -> ReplicaStatus {
        loadIfNeeded()
        var status = ReplicaStatus()
        status.ready = state.initialized
        for entry in outbox {
            for request in entry.requests {
                status.pendingIDs.insert(request.id)
                if entry.failure != nil { status.failedIDs.insert(request.id) }
            }
        }
        status.pendingChanges = outbox.filter { $0.failure == nil }.count
        status.failed = outbox.compactMap { entry in entry.failure.map { FailedChange(id: entry.id, summary: describe(entry), message: $0) } }
        status.lastSynced = state.lastPull.map(Date.init(timeIntervalSince1970:))
        status.storedBytes = storedBytes()
        status.notice = notice
        return status
    }

    public func clearNotice() { notice = nil }

    private func describe(_ entry: OutboxEntry) -> String {
        guard let request = entry.requests.first else { return "A change" }
        let nouns = ["projects": "project", "tasks": "task", "categories": "category", "captures": "capture", "knowledge": "note",
                     "habits": "habit", "habit_entries": "habit entry", "habit_targets": "habit target"]
        let noun = nouns[request.collection] ?? "item"
        let row = view().tables[request.collection]?[request.id] ?? rows[request.collection]?[request.id] ?? request.body
        var title = ""
        for key in ["title", "name"] { if case .string(let value)? = row[key], !value.isEmpty { title = value; break } }
        let verb = request.method == "DELETE" ? "Delete" : request.method == "POST" ? "New" : "Edit"
        return title.isEmpty ? "\(verb) \(noun)" : "\(verb) \(noun) “\(title)”"
    }

    public func retryFailed() {
        loadIfNeeded()
        for index in outbox.indices { outbox[index].failure = nil }
        try? saveOutbox()
    }

    public func discard(_ changeID: String) {
        loadIfNeeded()
        outbox.removeAll { $0.id == changeID }
        try? saveOutbox()
        changed()
    }

    // MARK: Local PocketBase

    /// Answers PocketBase record requests from this device when it can, and otherwise
    /// forwards them. Older history is fetched online and kept in `history`.
    public func respond(_ request: URLRequest, online: Bool, history: APIReadCache?,
                        remote: @escaping @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)) async throws -> (Data, HTTPURLResponse) {
        loadIfNeeded()
        let method = (request.httpMethod ?? "GET").uppercased()
        let parts = request.url!.path.split(separator: "/").map(String.init)
        let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ name: String) -> String { query.first { $0.name == name }?.value ?? "" }
        if state.initialized, parts.count >= 4, parts[0] == "api", parts[1] == "collections", parts[3] == "records",
           RecordSchema.replicated.contains(parts[2]) {
            let collection = parts[2], id = parts.count > 4 ? parts[4] : nil
            if method == "GET" {
                if let id { return try await one(collection, id: id, fields: value("fields"), expand: value("expand"), request: request, online: online, remote: remote) }
                return try await list(collection, filter: value("filter"), sort: value("sort"), page: Int(value("page")) ?? 1,
                    perPage: Int(value("perPage")) ?? 30, fields: value("fields"), expand: value("expand"),
                    request: request, online: online, history: history, remote: remote)
            }
            let body = try request.httpBody.map { try JSONDecoder().decode([String: JSONValue].self, from: $0) } ?? [:]
            return try write([(method, collection, id, body)], batch: false, request: request)
        }
        if state.initialized, parts == ["api", "batch"], method == "POST", let body = request.httpBody,
           case .array(let items)? = try JSONDecoder().decode([String: JSONValue].self, from: body)["requests"] {
            var requests: [(String, String, String?, [String: JSONValue])] = []
            for item in items {
                guard case .object(let fields) = item, case .string(let url)? = fields["url"], case .string(let method)? = fields["method"] else { requests = []; break }
                let path = url.split(separator: "?")[0].split(separator: "/").map(String.init)
                guard path.count >= 4, path[0] == "api", path[1] == "collections", path[3] == "records", RecordSchema.replicated.contains(path[2]) else { requests = []; break }
                var payload: [String: JSONValue] = [:]; if case .object(let object)? = fields["body"] { payload = object }
                requests.append((method.uppercased(), path[2], path.count > 4 ? path[4] : nil, payload))
            }
            if !requests.isEmpty { return try write(requests, batch: true, request: request) }
        }
        return try await fallback(request, online: online, history: method == "GET" ? history : nil, remote: remote)
    }

    private func reply(_ value: JSONValue?, status: Int = 200, to request: URLRequest) throws -> (Data, HTTPURLResponse) {
        (try value.map { try JSONEncoder().encode($0) } ?? Data(), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }

    private func fallback(_ request: URLRequest, online: Bool, history: APIReadCache?,
                          remote: @escaping @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)) async throws -> (Data, HTTPURLResponse) {
        if let history {
            let data = try await history.data(for: request, allowNetwork: online) {
                let (data, response) = try await remote(request)
                guard (200..<300).contains(response.statusCode) else { throw APIError(status: response.statusCode, detail: nil) }
                return data
            }
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        guard online else { throw URLError(.notConnectedToInternet) }
        return try await remote(request)
    }

    private func one(_ collection: String, id: String, fields: String, expand: String, request: URLRequest, online: Bool,
                     remote: @escaping @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)) async throws -> (Data, HTTPURLResponse) {
        var (tables, trim) = view()
        let wanted = Self.fieldNames(fields)
        let missing = (trim[collection]?[id] ?? []).filter { wanted.isEmpty || wanted.contains($0) }
        if tables[collection]?[id] == nil || !missing.isEmpty {
            guard online else {
                if tables[collection]?[id] == nil { return try reply(.object(["message": .string("The requested resource wasn't found.")]), status: 404, to: request) }
                throw ReplicaError.fullContentOffline
            }
            let (data, response) = try await remote(request)
            guard (200..<300).contains(response.statusCode), wanted.isEmpty, expand.isEmpty,
                  case .object(let object)? = try? JSONDecoder().decode(JSONValue.self, from: data),
                  ["pomodoro_sessions", "habit_entries"].contains(collection) == false else { return (data, response) }
            restore(collection, object)
            (tables, trim) = view()
        }
        if RecordSchema.heavyFields[collection] != nil { state.accessed[collection + "/" + id] = now().timeIntervalSince1970; stateDirty = true }
        guard let row = tables[collection]?[id] else { return try reply(.object(["message": .string("The requested resource wasn't found.")]), status: 404, to: request) }
        return try reply(.object(Self.project(row, collection: collection, fields: fields, expand: expand, tables: tables)), to: request)
    }

    /// Adds a full server copy, such as a detail opened while online.
    func restore(_ collection: String, _ object: [String: JSONValue]) {
        guard case .string(let id)? = object["id"] else { return }
        var row = object
        for key in ["expand", "collectionId", "collectionName"] { row[key] = nil }
        rows[collection, default: [:]][id] = row
        trimmed[collection]?[id] = nil
        dirtyCollections.insert(collection)
        changed()
    }

    private func list(_ collection: String, filter text: String, sort: String, page: Int, perPage: Int, fields: String, expand: String,
                      request: URLRequest, online: Bool, history: APIReadCache?,
                      remote: @escaping @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)) async throws -> (Data, HTTPURLResponse) {
        let (tables, trim) = view()
        let filter = RecordFilter.parse(text), index = BackRelationIndex()
        var matching = (tables[collection] ?? [:]).values.filter { filter.matches($0, collection: collection, tables: tables, index: index) }
        RecordFilter.sort(&matching, by: sort)
        let page = max(1, page), perPage = min(1000, max(1, perPage))
        if !covers(collection, filter: filter, sort: sort, page: page, perPage: perPage, fields: fields, matching: matching, trimmed: trim) {
            if online { return try await fallback(request, online: online, history: history, remote: remote) }
            if collection == "habit_entries" { throw ReplicaError.olderHistoryOffline }
        }
        let total = matching.count, lower = min(total, (page - 1) * perPage)
        let items = matching[lower..<min(total, lower + perPage)].map {
            JSONValue.object(Self.project($0, collection: collection, fields: fields, expand: expand, tables: tables))
        }
        return try reply(.object(["items": .array(items), "page": .number(Double(page)), "perPage": .number(Double(perPage)),
            "totalItems": .number(Double(total)), "totalPages": .number(Double((total + perPage - 1) / perPage))]), to: request)
    }

    /// Whether this device holds every row and field the request asks for.
    private func covers(_ collection: String, filter: RecordFilter, sort: String, page: Int, perPage: Int, fields: String,
                        matching: [[String: JSONValue]], trimmed trim: [String: [String: Set<String>]]) -> Bool {
        switch collection {
        case "habit_entries":
            guard let start = state.habitWindowStart, case .string(let lower)? = filter.lowerBound("day"), lower >= start else { return false }
        case "pomodoro_sessions":
            if let start = state.sessionWindowStart, case .number(let lower)? = filter.lowerBound("lastTick"), lower >= start { break }
            guard sort.hasPrefix("-lastTick"), page * perPage <= matching.count else { return false }
        default: break
        }
        // Lists only need full text to search it. Capture notes keep a preview prefix that lists use.
        guard let heavy = RecordSchema.heavyFields[collection]?.subtracting(["note"]), !heavy.isEmpty else { return true }
        let wanted = fields.isEmpty ? heavy : heavy.intersection(Self.fieldNames(fields))
        guard !wanted.isEmpty, let marks = trim[collection] else { return true }
        return !matching.contains { row in
            guard case .string(let id)? = row["id"] else { return false }
            return !(marks[id] ?? []).isDisjoint(with: wanted)
        }
    }

    static func fieldNames(_ fields: String) -> Set<String> {
        Set(fields.split(separator: ",").map { String($0.split(separator: ".")[0]).trimmingCharacters(in: .whitespaces) })
    }

    static func project(_ row: [String: JSONValue], collection: String, fields: String, expand: String, tables: RecordTables) -> [String: JSONValue] {
        var result = row
        if !expand.isEmpty {
            var expanded: [String: JSONValue] = [:]
            for name in expand.split(separator: ",").map(String.init) {
                guard let relation = RecordSchema.relations[collection]?[name] else { continue }
                let related = RecordSchema.ids(row[name]).compactMap { tables[relation.collection]?[$0] }.map(JSONValue.object)
                if relation.multiple { expanded[name] = .array(related) } else if let first = related.first { expanded[name] = first }
            }
            if !expanded.isEmpty { result["expand"] = .object(expanded) }
        }
        let names = fieldNames(fields)
        if !names.isEmpty && !names.contains("*") { result = result.filter { names.contains($0.key) } }
        return result
    }

    // MARK: Local writes

    private func write(_ requests: [(method: String, collection: String, id: String?, body: [String: JSONValue])], batch: Bool,
                       request: URLRequest) throws -> (Data, HTTPURLResponse) {
        var (tables, trim) = view()
        var queued: [OutboxRequest] = [], responses: [JSONValue] = [], bodyBase: [String: String] = [:]
        let stamp = RecordSchema.timestamp(now())
        func failure(_ status: Int, _ message: String, field: String? = nil) throws -> (Data, HTTPURLResponse) {
            var payload: [String: JSONValue] = ["status": .number(Double(status)), "message": .string(message)]
            if let field { payload["data"] = .object([field: .object(["code": .string("validation_not_unique"), "message": .string("Value must be unique.")])]) }
            return try reply(.object(payload), status: status, to: request)
        }
        for item in requests {
            var body = item.body
            var id = item.id
            if id == nil, case .string(let value)? = body["id"], !value.isEmpty { id = value }
            if item.method == "POST" && id == nil { id = FocusSession.makeID(); body["id"] = .string(id!) }
            guard let id, ["POST", "PUT", "PATCH", "DELETE"].contains(item.method) else { return try failure(400, "Something went wrong while processing your request.") }
            let exists = tables[item.collection]?[id] != nil
            if item.method == "POST" && exists { return try failure(400, "Failed to create record.", field: "id") }
            if (item.method == "PATCH" || item.method == "DELETE") && !exists { return try failure(404, "The requested resource wasn't found.") }
            if item.collection == "categories", case .string(let name)? = body["name"],
               tables["categories"]?.contains(where: { $0.key != id && $0.value["name"].map { if case .string(let other) = $0 { other.caseInsensitiveCompare(name) == .orderedSame } else { false } } == true }) == true {
                return try failure(400, "Failed to save record.", field: "name")
            }
            if item.collection == "knowledge", body["body"] != nil, let base = rows["knowledge"]?[id], trimmed["knowledge"]?[id]?.contains("body") != true {
                bodyBase[id] = Self.digest(base["body"])
            }
            let outgoing = OutboxRequest(method: item.method, collection: item.collection, id: id, body: body)
            Self.apply(outgoing, to: &tables, trimmed: &trim, stamp: stamp)
            queued.append(outgoing)
            let row = tables[item.collection]?[id].map(JSONValue.object)
            responses.append(.object(["status": .number(item.method == "DELETE" ? 204 : 200), "body": row ?? .null]))
        }
        outbox.append(OutboxEntry(id: UUID().uuidString, created: now().timeIntervalSince1970, requests: queued, batch: batch,
                                  failure: nil, bodyBase: bodyBase.isEmpty ? nil : bodyBase))
        do { try saveOutbox() }
        catch {
            outbox.removeLast()
            throw PokusError.message("This change couldn't be saved on this iPhone. Free some storage and try again.")
        }
        changed()
        if batch { return try reply(.array(responses), to: request) }
        guard case .object(let response) = responses[0], case .object(let row)? = response["body"] else { return try reply(nil, status: 204, to: request) }
        return try reply(.object(row), to: request)
    }

    static func digest(_ value: JSONValue?) -> String {
        let text: String; if case .string(let value)? = value { text = value } else { text = "" }
        return SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
