import Foundation
import Testing
@testable import PokusNetworking

private final class ReadCacheClock: @unchecked Sendable {
    private let lock = NSLock()
    private var date = Date(timeIntervalSince1970: 1_000)
    private var reads = 0
    private var observers: [(Int, CheckedContinuation<Void, Never>)] = []

    func now() -> Date {
        lock.lock()
        reads += 1
        let date = date
        let ready = observers.filter { $0.0 <= reads }
        observers.removeAll { $0.0 <= reads }
        lock.unlock()
        for (_, observer) in ready { observer.resume() }
        return date
    }

    func advance(_ seconds: TimeInterval) {
        lock.lock()
        date.addTimeInterval(seconds)
        lock.unlock()
    }

    func waitForReads(_ count: Int) async {
        await withCheckedContinuation { continuation in
            lock.lock()
            if reads >= count {
                lock.unlock()
                continuation.resume()
            } else {
                observers.append((count, continuation))
                lock.unlock()
            }
        }
    }
}

private actor ReadCacheServer {
    private(set) var requests: [URLRequest] = []
    private var held: [Int: CheckedContinuation<Void, Never>] = [:]
    private var observers: [(Int, CheckedContinuation<Void, Never>)] = []
    let holdResponses: Bool
    let status: Int
    let failure: URLError.Code?

    init(holdResponses: Bool = false, status: Int = 200, failure: URLError.Code? = nil) {
        self.holdResponses = holdResponses
        self.status = status
        self.failure = failure
    }

    func respond(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        let number = requests.count
        let ready = observers.filter { $0.0 <= number }
        observers.removeAll { $0.0 <= number }
        for (_, observer) in ready { observer.resume() }
        if holdResponses { await withCheckedContinuation { held[number] = $0 } }
        if let failure { throw URLError(failure) }
        return (Data("response-\(number)".utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }

    func release(_ number: Int) { held.removeValue(forKey: number)?.resume() }

    func waitForRequests(_ count: Int) async {
        if requests.count >= count { return }
        await withCheckedContinuation { observers.append((count, $0)) }
    }
}

private final class ReadCacheUpdates: @unchecked Sendable {
    private let lock = NSLock()
    private var updates = 0
    private var observers: [(Int, CheckedContinuation<Void, Never>)] = []

    var count: Int {
        lock.lock()
        defer { lock.unlock() }
        return updates
    }

    func notify() {
        lock.lock()
        updates += 1
        let ready = observers.filter { $0.0 <= updates }
        observers.removeAll { $0.0 <= updates }
        lock.unlock()
        for (_, observer) in ready { observer.resume() }
    }

    func waitForUpdates(_ count: Int) async {
        await withCheckedContinuation { continuation in
            lock.lock()
            if updates >= count {
                lock.unlock()
                continuation.resume()
            } else {
                observers.append((count, continuation))
                lock.unlock()
            }
        }
    }
}

struct ReadCacheTests {
    private let path = "api/collections/tasks/records"

    @Test func defaultClientAlwaysFetches() async throws {
        let server = ReadCacheServer()
        let client = PocketBaseClient(transport: { try await server.respond($0) })
        let first = try await client.request(path)
        let second = try await client.request(path)
        #expect(first != second)
        #expect(await server.requests.count == 2)
    }

    @Test func identicalReadsCoalesceAndReuseSuccessfulResponse() async throws {
        let clock = ReadCacheClock()
        let cache = APIReadCache(now: { clock.now() })
        let server = ReadCacheServer(holdResponses: true)
        let client = PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: cache)
        let first = Task { try await client.request(path) }
        await server.waitForRequests(1)
        let second = Task { try await client.request(path) }
        await clock.waitForReads(2)
        await server.release(1)
        let firstData = try await first.value
        #expect(try await second.value == firstData)
        #expect(try await client.request(path) == firstData)
        #expect(await server.requests.count == 1)
    }

    @Test func expiryAndInvalidationFetchAgain() async throws {
        let clock = ReadCacheClock()
        let cache = APIReadCache(timeToLive: 60, now: { clock.now() })
        let server = ReadCacheServer()
        let client = PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: cache)
        let first = try await client.request(path)
        clock.advance(59)
        #expect(try await client.request(path) == first)
        clock.advance(1)
        let second = try await client.request(path)
        #expect(second != first)
        await cache.invalidate()
        #expect(try await client.request(path) != second)
        #expect(await server.requests.count == 3)
    }

    @Test func oldCompletionCannotReplaceDataAfterInvalidation() async throws {
        let cache = APIReadCache()
        let server = ReadCacheServer(holdResponses: true)
        let client = PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: cache)
        let oldRead = Task { try await client.request(path) }
        await server.waitForRequests(1)
        await cache.invalidate()
        let newRead = Task { try await client.request(path) }
        await server.waitForRequests(2)
        await server.release(2)
        let fresh = try await newRead.value
        await server.release(1)
        #expect(try await oldRead.value != fresh)
        #expect(try await client.request(path) == fresh)
        #expect(await server.requests.count == 2)
    }

    @Test func authenticationURLAndQueryAreSeparateCacheKeys() async throws {
        let cache = APIReadCache()
        let server = ReadCacheServer()
        let client = PocketBaseClient(baseURL: URL(string: "https://first.example")!, token: "first-account",
                                      transport: { try await server.respond($0) }).cachingReads(in: cache)
        var otherAccount = client
        otherAccount.token = "other-account"
        let otherHost = PocketBaseClient(baseURL: URL(string: "https://second.example")!, token: client.token,
                                        transport: { try await server.respond($0) }).cachingReads(in: cache)
        let first = try await client.request(path)
        #expect(try await otherAccount.request(path) != first)
        #expect(try await otherHost.request(path) != first)
        #expect(try await client.request(path, query: [URLQueryItem(name: "page", value: "2")]) != first)
        #expect(try await client.request(path) == first)
        #expect(await server.requests.count == 4)
    }

    @Test func mutationsAndGETBodiesAreNeverCached() async throws {
        let server = ReadCacheServer()
        let client = PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: APIReadCache())
        for method in ["POST", "PATCH", "PUT", "DELETE", "GET"] {
            let first = try await client.request(path, method: method, body: ["value": .string("changed")])
            #expect(try await client.request(path, method: method, body: ["value": .string("changed")]) != first)
        }
        #expect(await server.requests.count == 10)
    }

    @Test func HTTPAndTransportFailuresAreNeverCached() async {
        let httpServer = ReadCacheServer(status: 503)
        let httpClient = PocketBaseClient(transport: { try await httpServer.respond($0) }).cachingReads(in: APIReadCache())
        let transportServer = ReadCacheServer(failure: .notConnectedToInternet)
        let transportClient = PocketBaseClient(transport: { try await transportServer.respond($0) }).cachingReads(in: APIReadCache())
        for _ in 0..<2 {
            await #expect(throws: APIError.self) { _ = try await httpClient.request(path) }
            await #expect(throws: URLError.self) { _ = try await transportClient.request(path) }
        }
        #expect(await httpServer.requests.count == 2)
        #expect(await transportServer.requests.count == 2)
    }

    @Test func cancelingFirstReaderDoesNotCancelOtherReaders() async throws {
        let clock = ReadCacheClock()
        let cache = APIReadCache(now: { clock.now() })
        let server = ReadCacheServer(holdResponses: true)
        let client = PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: cache)
        let first = Task { try await client.request(path) }
        await server.waitForRequests(1)
        let second = Task { try await client.request(path) }
        await clock.waitForReads(2)
        first.cancel()
        await #expect(throws: CancellationError.self) { try await first.value }
        await server.release(1)
        let data = try await second.value
        #expect(data == Data("response-1".utf8))
        #expect(try await client.request(path) == data)
        #expect(await server.requests.count == 1)
    }

    @Test func canceledLastReaderDoesNotPopulateCache() async throws {
        let cache = APIReadCache()
        let server = ReadCacheServer(holdResponses: true)
        let client = PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: cache)
        let abandoned = Task { try await client.request(path) }
        await server.waitForRequests(1)
        abandoned.cancel()
        await #expect(throws: CancellationError.self) { try await abandoned.value }
        let next = Task { try await client.request(path) }
        await server.waitForRequests(2)
        await server.release(2)
        let fresh = try await next.value
        await server.release(1)
        #expect(try await client.request(path) == fresh)
        #expect(await server.requests.count == 2)
    }

    @Test func responseCountUsesLeastRecentlyUsedEviction() async throws {
        let server = ReadCacheServer()
        let cache = APIReadCache(maximumEntries: 2)
        let client = PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: cache)
        let first = try await client.request("first")
        let second = try await client.request("second")
        #expect(try await client.request("first") == first)
        _ = try await client.request("third")
        #expect(try await client.request("first") == first)
        #expect(try await client.request("second") != second)
        #expect(await server.requests.count == 4)
    }

    @Test func responseBytesAreBoundedAndOversizedResponsesAreNotStored() async throws {
        let server = ReadCacheServer()
        let client = PocketBaseClient(transport: { try await server.respond($0) })
        let bounded = client.cachingReads(in: APIReadCache(maximumBytes: 10))
        let first = try await bounded.request("first")
        _ = try await bounded.request("second")
        #expect(try await bounded.request("first") != first)
        let tooSmall = client.cachingReads(in: APIReadCache(maximumBytes: 1))
        let uncached = try await tooSmall.request(path)
        #expect(try await tooSmall.request(path) != uncached)
        #expect(await server.requests.count == 5)
    }

    @Test func diskCacheSurvivesRelaunchAndTokenRotationWithoutPersistingTokens() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let server = ReadCacheServer()
        let clock = ReadCacheClock()
        let firstCache = APIReadCache(now: { clock.now() }, directory: directory, accountID: "first-account", staleWhileRevalidate: true)
        let firstClient = PocketBaseClient(token: "secret-original-bearer-token", transport: { try await server.respond($0) })
            .cachingReads(in: firstCache)
        let saved = try await firstClient.request(path)
        await firstCache.deactivate()
        clock.advance(3_600)
        let secondCache = APIReadCache(now: { clock.now() }, directory: directory, accountID: "first-account", staleWhileRevalidate: true)
        let offline = PocketBaseClient(token: "secret-refreshed-bearer-token", transport: { try await server.respond($0) })
            .cachingReads(in: secondCache, allowNetwork: false)
        #expect(try await offline.request(path) == saved)
        #expect(await server.requests.count == 1)
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        #expect(files.count == 1)
        let serialized = try String(contentsOf: #require(files.first), encoding: .utf8)
        #expect(!serialized.contains("secret-original-bearer-token"))
        #expect(!serialized.contains("secret-refreshed-bearer-token"))
    }

    @Test func diskResponsesAreIsolatedByAccountBackendQueryAndTimeout() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let server = ReadCacheServer()
        let firstCache = APIReadCache(directory: directory, accountID: "first")
        let first = PocketBaseClient(baseURL: URL(string: "https://first.example")!, token: "token", transport: { try await server.respond($0) })
            .cachingReads(in: firstCache)
        _ = try await first.request(path)
        let otherAccount = PocketBaseClient(baseURL: first.baseURL, token: first.token, transport: { try await server.respond($0) })
            .cachingReads(in: APIReadCache(directory: directory, accountID: "second"), allowNetwork: false)
        let otherHost = PocketBaseClient(baseURL: URL(string: "https://second.example")!, token: first.token, transport: { try await server.respond($0) })
            .cachingReads(in: firstCache, allowNetwork: false)
        let offline = first.cachingReads(in: firstCache, allowNetwork: false)
        await #expect(throws: APIReadCacheError.self) { _ = try await otherAccount.request(path) }
        await #expect(throws: APIReadCacheError.self) { _ = try await otherHost.request(path) }
        await #expect(throws: APIReadCacheError.self) { _ = try await offline.request(path, query: [.init(name: "page", value: "2")]) }
        await #expect(throws: APIReadCacheError.self) { _ = try await offline.request(path, timeout: 2) }
        #expect(await server.requests.count == 1)
    }

    @Test func tokenScopedDiskKeysContainOnlyTokenDigest() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let server = ReadCacheServer()
        let cache = APIReadCache(directory: directory)
        let client = PocketBaseClient(token: "secret-account-token", transport: { try await server.respond($0) }).cachingReads(in: cache)
        let saved = try await client.request(path)
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        let serialized = try String(contentsOf: #require(files.first), encoding: .utf8)
        #expect(!serialized.contains("secret-account-token"))
        let restored = APIReadCache(directory: directory)
        #expect(try await client.cachingReads(in: restored, allowNetwork: false).request(path) == saved)
        var other = client.cachingReads(in: restored, allowNetwork: false)
        other.token = "different-secret-token"
        await #expect(throws: APIReadCacheError.self) { _ = try await other.request(path) }
    }

    @Test func staleReadsReturnImmediatelyAndCoalesceBackgroundRefresh() async throws {
        let clock = ReadCacheClock()
        let updates = ReadCacheUpdates()
        let server = ReadCacheServer(holdResponses: true)
        let cache = APIReadCache(now: { clock.now() }, staleWhileRevalidate: true, onUpdate: { updates.notify() })
        let client = PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: cache)
        let first = Task { try await client.request(path) }
        await server.waitForRequests(1)
        await server.release(1)
        let saved = try await first.value
        clock.advance(61)
        // The refresh remains held until both stale reads have already returned.
        #expect(try await client.request(path) == saved)
        await server.waitForRequests(2)
        #expect(try await client.request(path) == saved)
        #expect(await server.requests.count == 2)
        #expect(updates.count == 0)
        await server.release(2)
        await updates.waitForUpdates(1)
        #expect(try await client.request(path) == Data("response-2".utf8))
        #expect(updates.count == 1)
    }

    @Test func identicalBackgroundResponseDoesNotPublishAnUpdate() async throws {
        let clock = ReadCacheClock()
        let updates = ReadCacheUpdates()
        let cache = APIReadCache(now: { clock.now() }, staleWhileRevalidate: true, onUpdate: { updates.notify() })
        let server = ReadCacheServer()
        let client = PocketBaseClient(transport: { request in
            let (_, response) = try await server.respond(request)
            return (Data("unchanged".utf8), response)
        }).cachingReads(in: cache)
        _ = try await client.request(path) // clock reads: lookup, store
        clock.advance(61)
        #expect(try await client.request(path) == Data("unchanged".utf8)) // lookup
        await clock.waitForReads(4) // background store
        #expect(try await client.request(path) == Data("unchanged".utf8))
        #expect(updates.count == 0)
        #expect(await server.requests.count == 2)
    }

    @Test func offlineRetainedDataExpiresAfterThirtyDays() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let clock = ReadCacheClock()
        let server = ReadCacheServer()
        let cache = APIReadCache(now: { clock.now() }, directory: directory, accountID: "account", staleWhileRevalidate: true)
        let client = PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: cache)
        let saved = try await client.request(path)
        clock.advance(29 * 24 * 60 * 60)
        #expect(try await client.cachingReads(in: cache, allowNetwork: false).request(path) == saved)
        clock.advance(24 * 60 * 60)
        let relaunched = APIReadCache(now: { clock.now() }, directory: directory, accountID: "account", staleWhileRevalidate: true)
        await #expect(throws: APIReadCacheError.self) {
            _ = try await client.cachingReads(in: relaunched, allowNetwork: false).request(path)
        }
        #expect(await server.requests.count == 1)
    }

    @Test func corruptDiskFallsBackToNetwork() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let server = ReadCacheServer()
        let client = PocketBaseClient(transport: { try await server.respond($0) })
        let first = try await client.cachingReads(in: APIReadCache(directory: directory, accountID: "account")).request(path)
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        try Data("broken snapshot".utf8).write(to: #require(files.first), options: .atomic)
        let restored = APIReadCache(directory: directory, accountID: "account")
        #expect(try await client.cachingReads(in: restored).request(path) != first)
        #expect(await server.requests.count == 2)
    }

    @Test func invalidationClearsDiskAndInflightReadCannotRestoreIt() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let server = ReadCacheServer(holdResponses: true)
        let cache = APIReadCache(directory: directory, accountID: "account", staleWhileRevalidate: true)
        let client = PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: cache)
        let first = Task { try await client.request(path) }
        await server.waitForRequests(1)
        await server.release(1)
        _ = try await first.value
        let pending = Task { try await client.request("another") }
        await server.waitForRequests(2)
        await cache.invalidate()
        await server.release(2)
        _ = try await pending.value
        let restored = APIReadCache(directory: directory, accountID: "account", staleWhileRevalidate: true)
        let offline = client.cachingReads(in: restored, allowNetwork: false)
        await #expect(throws: APIReadCacheError.self) { _ = try await offline.request(path) }
        await #expect(throws: APIReadCacheError.self) { _ = try await offline.request("another") }
        #expect(try FileManager.default.contentsOfDirectory(atPath: directory.path).isEmpty)
    }

    @Test func markingStalePreservesDiskAndRefreshesNextDemand() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let server = ReadCacheServer(holdResponses: true)
        let cache = APIReadCache(directory: directory, accountID: "account", staleWhileRevalidate: true)
        let client = PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: cache)
        let first = Task { try await client.request(path) }
        await server.waitForRequests(1)
        await server.release(1)
        let saved = try await first.value
        await cache.markStale()
        let restored = APIReadCache(directory: directory, accountID: "account", staleWhileRevalidate: true)
        #expect(try await client.cachingReads(in: restored, allowNetwork: false).request(path) == saved)
        #expect(try await client.request(path) == saved)
        await server.waitForRequests(2)
        await cache.deactivate()
        await server.release(2)
        #expect(await server.requests.count == 2)
    }

    @Test func editedCollectionsRefetchOnlineButStayAvailableOffline() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let server = ReadCacheServer()
        let cache = APIReadCache(directory: directory, accountID: "account", staleWhileRevalidate: true)
        let client = PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: cache)
        let saved = try await client.request(path)
        let retained = try await client.request("api/collections/projects/records")
        await cache.markForRevalidation(collections: ["tasks"])
        let offline = client.cachingReads(in: APIReadCache(directory: directory, accountID: "account"), allowNetwork: false)
        #expect(try await offline.request("api/collections/projects/records") == retained)
        #expect(try await offline.request(path) == saved)
        #expect(try await client.request(path) == Data("response-3".utf8))
        #expect(try await client.request("api/collections/projects/records") == retained)
        #expect(await server.requests.count == 3)
    }

    @Test func failedRefetchAfterEditShowsSavedCopy() async throws {
        let server = ReadCacheServer(), unreachable = ReadCacheServer(failure: .notConnectedToInternet)
        let cache = APIReadCache(staleWhileRevalidate: true)
        let saved = try await PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: cache).request(path)
        await cache.markForRevalidation(collections: ["tasks"])
        let failing = PocketBaseClient(transport: { try await unreachable.respond($0) }).cachingReads(in: cache)
        #expect(try await failing.request(path) == saved)
        #expect(await unreachable.requests.count == 1)
    }

    @Test func batchedDiskWritesWaitForFlush() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let server = ReadCacheServer()
        let cache = APIReadCache(directory: directory, accountID: "account", persistDelay: .seconds(600))
        let client = PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: cache)
        let saved = try await client.request(path)
        _ = try await client.request("another")
        let offline = { client.cachingReads(in: APIReadCache(directory: directory, accountID: "account"), allowNetwork: false) }
        await #expect(throws: APIReadCacheError.self) { _ = try await offline().request(path) }
        await cache.flush()
        #expect(try await offline().request(path) == saved)
    }

    @Test func deactivationCancelsPendingReadersAndRetainsSavedDisk() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let server = ReadCacheServer(holdResponses: true)
        let cache = APIReadCache(directory: directory, accountID: "account", staleWhileRevalidate: true)
        let client = PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: cache)
        let first = Task { try await client.request(path) }
        await server.waitForRequests(1)
        await server.release(1)
        let saved = try await first.value
        let pending = Task { try await client.request("another") }
        await server.waitForRequests(2)
        await cache.deactivate()
        await #expect(throws: CancellationError.self) { _ = try await pending.value }
        await #expect(throws: CancellationError.self) { _ = try await client.request(path) }
        await server.release(2)
        let offline = client.cachingReads(in: APIReadCache(directory: directory, accountID: "account"), allowNetwork: false)
        #expect(try await offline.request(path) == saved)
        await #expect(throws: APIReadCacheError.self) { _ = try await offline.request("another") }
    }

    @Test func backgroundNotFoundEvictsSavedDetailAndPublishesUpdate() async throws {
        let updates = ReadCacheUpdates()
        let server = ReadCacheServer()
        let cache = APIReadCache(staleWhileRevalidate: true, onUpdate: { updates.notify() })
        let client = PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: cache)
        let saved = try await client.request(path + "/id")
        await cache.markStale()
        let deletedServer = ReadCacheServer(status: 404)
        let deletedClient = PocketBaseClient(transport: { try await deletedServer.respond($0) }).cachingReads(in: cache)
        #expect(try await deletedClient.request(path + "/id") == saved)
        await updates.waitForUpdates(1)
        await #expect(throws: APIReadCacheError.self) {
            _ = try await deletedClient.cachingReads(in: cache, allowNetwork: false).request(path + "/id")
        }
        #expect(updates.count == 1)
    }

    @Test func stableQueryIdentityStillSeparatesEndpointsAndLogicalQueries() async throws {
        let server = ReadCacheServer()
        let client = PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: APIReadCache())
        let first = try await client.request(path, query: [.init(name: "filter", value: "due < 'first-time'")], cacheKey: "due")
        #expect(try await client.request(path, query: [.init(name: "filter", value: "due < 'later-time'")], cacheKey: "due") == first)
        #expect(try await client.request(path, cacheKey: "next") != first)
        #expect(try await client.request("api/collections/projects/records", cacheKey: "due") != first)
        #expect(await server.requests.count == 3)
    }

    @Test func evictedBackgroundReadWaitersAreResumedWhenInvalidated() async throws {
        let clock = ReadCacheClock()
        let server = ReadCacheServer(holdResponses: true)
        let cache = APIReadCache(maximumEntries: 1, now: { clock.now() }, staleWhileRevalidate: true)
        let client = PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: cache)
        let first = Task { try await client.request(path) }
        await server.waitForRequests(1)
        await server.release(1)
        let saved = try await first.value
        clock.advance(61)
        #expect(try await client.request(path) == saved)
        await server.waitForRequests(2)
        let other = Task { try await client.request("another") }
        await server.waitForRequests(3)
        await server.release(3)
        _ = try await other.value
        let waiter = Task { try await client.request(path) }
        await clock.waitForReads(6)
        await cache.markStale()
        await #expect(throws: CancellationError.self) { _ = try await waiter.value }
        await server.release(2)
    }

    @Test func diskSnapshotHonorsBoundsAfterRelaunch() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let server = ReadCacheServer()
        let cache = APIReadCache(maximumEntries: 2, maximumBytes: 20, directory: directory, accountID: "account", staleWhileRevalidate: true)
        let client = PocketBaseClient(transport: { try await server.respond($0) }).cachingReads(in: cache)
        let first = try await client.request("first")
        _ = try await client.request("second")
        #expect(try await client.request("first") == first)
        let third = try await client.request("third")
        let restored = APIReadCache(maximumEntries: 2, maximumBytes: 20, directory: directory, accountID: "account", staleWhileRevalidate: true)
        let offline = client.cachingReads(in: restored, allowNetwork: false)
        #expect(try await offline.request("first") == first)
        #expect(try await offline.request("third") == third)
        await #expect(throws: APIReadCacheError.self) { _ = try await offline.request("second") }
        #expect(await server.requests.count == 3)
    }

    @Test func unavailableDiskDoesNotPreventSuccessfulReads() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        // A regular file cannot also be the cache directory.
        try Data("occupied".utf8).write(to: directory)
        let server = ReadCacheServer()
        let client = PocketBaseClient(transport: { try await server.respond($0) })
            .cachingReads(in: APIReadCache(directory: directory, accountID: "account", staleWhileRevalidate: true))
        let saved = try await client.request(path)
        #expect(try await client.request(path) == saved)
        #expect(await server.requests.count == 1)
    }

    @Test func oversizedBackgroundUpdateEvictsOldValueAndNotifiesReaders() async throws {
        let updates = ReadCacheUpdates()
        let server = ReadCacheServer()
        let cache = APIReadCache(maximumBytes: 10, staleWhileRevalidate: true, onUpdate: { updates.notify() })
        let client = PocketBaseClient(transport: { request in
            let (data, response) = try await server.respond(request)
            return (data == Data("response-1".utf8) ? data : Data(repeating: 1, count: 20), response)
        }).cachingReads(in: cache)
        let saved = try await client.request(path)
        await cache.markStale()
        #expect(try await client.request(path) == saved)
        await updates.waitForUpdates(1)
        await #expect(throws: APIReadCacheError.self) {
            _ = try await client.cachingReads(in: cache, allowNetwork: false).request(path)
        }
        #expect(try await client.request(path) == Data(repeating: 1, count: 20))
        #expect(updates.count == 1)
    }
}
