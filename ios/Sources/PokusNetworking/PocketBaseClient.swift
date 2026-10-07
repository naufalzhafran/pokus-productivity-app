import Foundation
import PokusCore

public enum JSONValue: Codable, Sendable, Equatable {
    case string(String), number(Double), bool(Bool), array([JSONValue]), object([String: JSONValue]), null
    public init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if value.decodeNil() { self = .null }
        else if let v = try? value.decode(Bool.self) { self = .bool(v) }
        else if let v = try? value.decode(Double.self) { self = .number(v) }
        else if let v = try? value.decode(String.self) { self = .string(v) }
        else if let v = try? value.decode([JSONValue].self) { self = .array(v) }
        else { self = .object(try value.decode([String: JSONValue].self)) }
    }
    public func encode(to encoder: Encoder) throws {
        var value = encoder.singleValueContainer()
        switch self {
        case .string(let v): try value.encode(v)
        case .number(let v): try value.encode(v)
        case .bool(let v): try value.encode(v)
        case .array(let v): try value.encode(v)
        case .object(let v): try value.encode(v)
        case .null: try value.encodeNil()
        }
    }
}
public struct APIError: LocalizedError {
    public let status: Int
    public let detail: String?
    public var errorDescription: String? {
        switch status {
        case 401: return "Sign in again to sync your saved sessions."
        case 403: return "This change isn't allowed for your account."
        case 404: return "This item no longer exists. Refresh and try again."
        case 400: return "The server rejected this change. " + (detail ?? "Check the fields and backend configuration.")
        default: return "Couldn't connect to PocketBase (\(status)). Your saved sessions remain on this device."
        }
    }
}
public struct OAuthProvider: Decodable, Sendable {
    public let name: String
    public let state: String
    public let codeVerifier: String
    public let authURL: String
}
private struct AuthMethods: Decodable {
    struct OAuth: Decodable { var providers: [OAuthProvider] }
    var oauth2: OAuth?
}
public struct RecordPage<T: Decodable & Sendable>: Decodable, Sendable {
    public let items: [T]
    public let page, perPage, totalItems, totalPages: Int
    public init(items: [T], page: Int, perPage: Int, totalItems: Int, totalPages: Int) {
        self.items = items; self.page = page; self.perPage = perPage
        self.totalItems = totalItems; self.totalPages = totalPages
    }
}
@usableFromInline
enum APITransport {
    static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: configuration)
    }()
    @usableFromInline
    static func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        return (data, response)
    }
}
public struct PocketBaseClient: Sendable {
    public let baseURL: URL
    public var token: String
    private var transport: @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)
    private var readCache: APIReadCache?
    private var allowNetwork = true
    public init(baseURL: URL = URL(string: "https://pb1.madebynz.xyz")!, token: String = "",
                transport: @escaping @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse) = { request in
                    try await APITransport.send(request)
                }) {
        self.baseURL = baseURL; self.token = token; self.transport = transport
    }
    public func cachingReads(in cache: APIReadCache, allowNetwork: Bool = true) -> PocketBaseClient {
        var client = self
        client.readCache = cache
        client.allowNetwork = allowNetwork
        return client
    }
    /// Answers record reads and writes from the account's on-device replica. Other requests,
    /// and history the device doesn't keep, go to PocketBase.
    public func routing(through replica: RecordReplica, history: APIReadCache?, online: Bool) -> PocketBaseClient {
        var client = self
        let remote = transport
        client.readCache = nil
        client.allowNetwork = true
        client.transport = { request in try await replica.respond(request, online: online, history: history, remote: remote) }
        return client
    }
    public func request(_ path: String, method: String = "GET", query: [URLQueryItem] = [], body: [String: JSONValue]? = nil, timeout: TimeInterval = 20, cacheKey: String? = nil) async throws -> Data {
        try Task.checkCancellation()
        var parts = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { parts.queryItems = query }
        var request = URLRequest(url: parts.url!); request.httpMethod = method; request.timeoutInterval = timeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        if !token.isEmpty { request.setValue(token, forHTTPHeaderField: "Authorization") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        let data: Data
        if method.uppercased() == "GET", body == nil, let readCache {
            let readRequest = request
            data = try await readCache.data(for: readRequest, cacheKey: cacheKey, allowNetwork: allowNetwork) { try await send(readRequest) }
        } else {
            guard allowNetwork else { throw APIReadCacheError.unavailableOffline }
            data = try await send(request)
        }
        try Task.checkCancellation()
        return data
    }
    private func send(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await transport(request)
        try Task.checkCancellation()
        guard (200..<300).contains(response.statusCode) else {
            func messages(_ value: Any) -> [String] {
                guard let object = value as? [String: Any] else { return [] }
                let message = (object["message"] as? String).map { [$0] } ?? []
                return message + object.filter { $0.key != "message" }.flatMap { messages($0.value) }
            }
            let detail = (try? JSONSerialization.jsonObject(with: data)).map { messages($0).joined(separator: " ") }
            throw APIError(status: response.statusCode, detail: detail?.isEmpty == false ? detail : nil)
        }
        return data
    }
    public func listPage<T: Decodable & Sendable>(_ collection: String, page: Int = 1, perPage: Int = 25,
        filter: String = "", sort: String = "-created,id", fields: String = "", expand: String = "", cacheKey: String? = nil) async throws -> RecordPage<T> {
        let stableKey = try cacheKey.map { key in
            String(decoding: try JSONEncoder().encode([key, String(page), String(perPage), sort, fields, expand]), as: UTF8.self)
        }
        let data = try await request("api/collections/\(collection)/records", query: [
            URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "perPage", value: String(perPage)),
            URLQueryItem(name: "filter", value: filter), URLQueryItem(name: "sort", value: sort),
            URLQueryItem(name: "fields", value: fields), URLQueryItem(name: "expand", value: expand)
        ], cacheKey: stableKey)
        return try JSONDecoder().decode(RecordPage<T>.self, from: data)
    }
    /// Explicit scans are reserved for projected summaries and compatibility tools.
    public func list<T: Decodable & Sendable>(_ collection: String, filter: String = "", sort: String = "-created,id", limit: Int? = nil) async throws -> [T] {
        var result: [T] = []; var page = 1
        while true {
            try Task.checkCancellation()
            let records: RecordPage<T> = try await listPage(collection, page: page, perPage: limit ?? 200, filter: filter, sort: sort)
            result += records.items
            if limit != nil || page >= records.totalPages { return result }
            page += 1
        }
    }
    public func record<T: Decodable>(_ collection: String, id: String) async throws -> T? {
        do { return try JSONDecoder().decode(T.self, from: await request("api/collections/\(collection)/records/\(id)")) }
        catch let error as APIError where error.status == 404 { return nil }
    }
    public func mutate(_ collection: String, id: String? = nil, body: [String: JSONValue]) async throws {
        _ = try await request("api/collections/\(collection)/records" + (id.map { "/\($0)" } ?? ""), method: id == nil ? "POST" : "PATCH", body: body)
    }
    public func delete(_ collection: String, id: String) async throws {
        _ = try await request("api/collections/\(collection)/records/\(id)", method: "DELETE")
    }
    public func workspace(historySince: String? = nil) async throws -> Workspace {
        async let projects: [Project] = list("projects")
        async let tasks: [FocusTask] = list("tasks")
        async let categories: [FocusCategory] = list("categories", sort: "name")
        let cursor = historySince.flatMap { value in
            value.range(of: "^[0-9TZ:. +\\-]+$", options: .regularExpression) == nil ? nil : value
        }
        let historyFilter = "mode = 'complete'" + (cursor.map { " && updated >= '\($0)'" } ?? "")
        async let history: [FocusSession] = list("pomodoro_sessions", filter: historyFilter, sort: "-lastTick,id")
        var workspace = Workspace()
        workspace.projects = try await projects; workspace.tasks = try await tasks
        workspace.categories = try await categories; workspace.history = try await history
        return workspace
    }
    public func latestSession() async throws -> FocusSession? {
        let records: [FocusSession] = try await list("pomodoro_sessions", filter: "mode = 'running'", sort: "-updated", limit: 1)
        return records.first
    }
    public func library() async throws -> LibraryWorkspace {
        async let captures: [Capture] = list("captures", sort: "-created")
        async let knowledge: [Knowledge] = list("knowledge", sort: "-updated")
        var library = LibraryWorkspace()
        library.captures = try await captures; library.knowledge = try await knowledge
        return library
    }
    public func preview(url: URL) async throws -> LinkPreview? {
        let data = try await request("api/pokus/link-preview", query: [URLQueryItem(name: "url", value: url.absoluteString)], timeout: 2)
        return try JSONDecoder().decode(LinkPreview.self, from: data)
    }
    public func googleProvider() async throws -> OAuthProvider {
        let data = try await request("api/collections/users/auth-methods")
        let methods = try JSONDecoder().decode(AuthMethods.self, from: data)
        guard let google = methods.oauth2?.providers.first(where: { $0.name == "google" }) else { throw PokusError.message("Google sign-in isn't configured on the server.") }
        return google
    }
    public func exchange(provider: OAuthProvider, code: String, redirect: URL) async throws -> Authentication {
        let data = try await request("api/collections/users/auth-with-oauth2", method: "POST", body: [
            "provider": .string("google"), "code": .string(code), "codeVerifier": .string(provider.codeVerifier), "redirectURL": .string(redirect.absoluteString)
        ])
        return try JSONDecoder().decode(Authentication.self, from: data)
    }
    public func refreshAuthentication() async throws -> Authentication {
        try JSONDecoder().decode(Authentication.self, from: await request("api/collections/users/auth-refresh", method: "POST"))
    }
    public func send(_ operation: SessionOperation, owner: String) async throws -> FocusSession {
        let session = operation.session
        if let remote: FocusSession = try await record("pomodoro_sessions", id: session.id), remote.mode != .running { return remote }
        var task = session.task
        if !task.isEmpty {
            let existing: FocusTask? = try await record("tasks", id: task)
            if existing == nil { task = "" }
        }
        func batch(_ task: String) async throws {
            let encoded = try JSONEncoder().encode(session)
            var fields = try JSONDecoder().decode([String: JSONValue].self, from: encoded)
            fields.removeValue(forKey: "updated")
            fields["owner"] = .string(owner); fields["task"] = .string(task)
            var requests: [JSONValue] = [.object(["method": .string("PUT"), "url": .string("/api/collections/pomodoro_sessions/records"), "body": .object(fields)])]
            if session.mode == .complete {
                requests.append(.object(["method": .string("POST"), "url": .string("/api/collections/pomodoro_completion_receipts/records"), "body": .object([
                    "id": .string(session.id), "owner": .string(owner), "session": .string(session.id),
                    "creditedTaskId": .string(task), "creditedSeconds": .number(task.isEmpty ? 0 : Double(session.creditedSeconds))
                ])]))
                if !task.isEmpty && session.creditedSeconds > 0 {
                    requests.append(.object(["method": .string("PATCH"), "url": .string("/api/collections/tasks/records/\(task)"), "body": .object(["focusedSeconds+": .number(Double(session.creditedSeconds))])]))
                }
            }
            _ = try await request("api/batch", method: "POST", body: ["requests": .array(requests)])
        }
        do { try await batch(task) }
        catch {
            if let committed: FocusSession = try await record("pomodoro_sessions", id: session.id), committed.mode != .running { return committed }
            if !task.isEmpty {
                let existing: FocusTask? = try await record("tasks", id: task)
                if existing == nil { task = ""; try await batch(task) }
                else { throw error }
            } else { throw error }
        }
        var authoritative = session; authoritative.task = task; return authoritative
    }
}
