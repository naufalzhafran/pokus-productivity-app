import Foundation
import Observation
import DailyCore
import PokusCore
import PokusNetworking
import PokusPersistence
import XCTest
import UserNotifications
#if canImport(Daily)
@testable import Daily
#else
@testable import ModelUnderTest
#endif

private struct MemoryCredentials: AccountCredentials {
    func read() throws -> Authentication? { nil }
    func save(_ auth: Authentication) throws {}
    func clear() throws {}
}

@MainActor private final class SilentSurfaces: TimerSurfaceClient {
    func clear() async {}
    func update(_ session: FocusSession?) async {}
}

/// A deterministic suspension point; no timing assumptions or sleeping in race tests.
private actor RequestGate {
    private var arrived = false
    private var arrival: CheckedContinuation<Void, Never>?
    private var release: CheckedContinuation<Void, Never>?
    func hold() async {
        await withCheckedContinuation { continuation in
            release = continuation; arrived = true
            arrival?.resume(); arrival = nil
        }
    }
    func waitForRequest() async {
        if arrived { return }
        await withCheckedContinuation { arrival = $0 }
    }
    func resume() { release?.resume(); release = nil }
}

@MainActor private final class FakeCaptureNotifications: CaptureNotificationClient {
    var requests: [String: UNNotificationRequest] = [:]
    var delivered: Set<String> = []
    var status: UNAuthorizationStatus = .authorized
    var permissionRequests = 0
    var grantPermission = true
    var failAdd = false
    var addGate: RequestGate?
    var onPending: (() -> Void)?
    func pendingRequests() async -> [UNNotificationRequest] {
        onPending?(); onPending = nil
        return Array(requests.values)
    }
    func deliveredIdentifiers() async -> [String] { Array(delivered) }
    func authorizationStatus() async -> UNAuthorizationStatus { status }
    func requestPermission() async throws -> Bool {
        permissionRequests += 1; status = grantPermission ? .authorized : .denied
        return grantPermission
    }
    func add(_ request: UNNotificationRequest) async throws {
        if let gate = addGate { addGate = nil; await gate.hold() }
        if failAdd { throw URLError(.cannotWriteToFile) }
        requests[request.identifier] = request
    }
    func removePending(_ identifiers: [String]) { for id in identifiers { requests[id] = nil } }
    func removeDelivered(_ identifiers: [String]) { delivered.subtract(identifiers) }
    func seed(_ id: String) {
        requests[id] = UNNotificationRequest(identifier: id, content: UNMutableNotificationContent(),
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: 3600, repeats: false))
    }
}

private actor ModelServer {
    let gate = RequestGate()
    let blockedPath: String
    let blockedMethod: String
    private var failNextBatch = false
    private var loseNextBatchResponse = false
    private var didBlock = false
    private var failedReadPath: String?
    private let records = UITestPocketBase()
    private(set) var writes = 0
    private(set) var requests = 0
    private(set) var paths: [String] = []
    private(set) var batches: [[JSONValue]] = []
    init(path: String = "never", method: String = "GET") { blockedPath = path; blockedMethod = method }
    func failHabitSave() { failNextBatch = true }
    func loseHabitSaveResponse() { loseNextBatchResponse = true }
    func failRead(_ path: String) { failedReadPath = path }
    func respond(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests += 1
        paths.append((request.httpMethod ?? "GET") + " " + request.url!.path)
        if request.httpMethod == "GET", let path = failedReadPath, request.url!.path.contains(path) {
            failedReadPath = nil
            throw URLError(.networkConnectionLost)
        }
        if request.httpMethod != "GET" { writes += 1 }
        if request.url!.path.hasSuffix("/batch"), let body = request.httpBody,
           case .array(let batch) = try JSONDecoder().decode([String: JSONValue].self, from: body)["requests"] {
            batches.append(batch)
        }
        if request.url!.path.hasSuffix("/batch"), failNextBatch {
            failNextBatch = false
            throw URLError(.notConnectedToInternet)
        }
        if request.url!.path.contains(blockedPath), request.httpMethod == blockedMethod, !didBlock {
            didBlock = true
            let stale = request.httpMethod == "GET" && request.url!.path.contains("/records")
                ? try await records.respond(request) : nil
            // Deliberately ignore cancellation: a late response must still fail the account guard.
            await gate.hold()
            if let stale { return stale }
        }
        if request.url!.path.contains("link-preview") {
            return (Data("{}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        if request.url!.path.contains("auth-refresh") {
            let token = request.value(forHTTPHeaderField: "Authorization") ?? ""
            let owner = token.components(separatedBy: ".").first ?? "owner"
            let auth = Authentication(token: token, record: Account(id: owner, name: owner))
            return (try JSONEncoder().encode(auth), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let response = try await records.respond(request)
        if request.url!.path.hasSuffix("/batch"), loseNextBatchResponse {
            loseNextBatchResponse = false
            throw URLError(.networkConnectionLost)
        }
        return response
    }
}

@MainActor final class PokusModelTests: XCTestCase {
    private func authentication(_ owner: String) -> Authentication {
        let claims = Data(#"{"exp":4102444800}"#.utf8).base64EncodedString().replacingOccurrences(of: "=", with: "")
        return Authentication(token: "\(owner).\(claims).test", record: Account(id: owner, name: owner))
    }
    private func model(_ server: ModelServer, root: URL, previewBudget: Duration = .seconds(2), cacheDirectory: URL? = nil, auth: Authentication? = nil) throws -> PokusModel {
        PokusModel(authentication: auth ?? authentication("ownerA"), store: try PokusStore(directory: root),
                   credentials: MemoryCredentials(), surfaces: SilentSurfaces(),
                   makeClient: { token in PocketBaseClient(token: token, transport: { try await server.respond($0) }) },
                   startAutomatically: false, previewBudget: previewBudget, cacheDirectory: cacheDirectory)
    }
    private func loadHabitSnapshot(_ api: PocketBaseClient, into model: PokusModel) async throws {
        let workspace = try await api.habits()
        model.habitsState.replace(workspace, histories: try workspace.histories())
    }
    func testLateCapturePreviewCannotWriteToAnotherAccount() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(path: "link-preview")
        let model = try model(server, root: root)
        let save = Task { await model.saveCapture(fields: ["url": .string("https://example.com")], creationID: "capture00000001", projectID: nil) }
        await server.gate.waitForRequest()
        await model.signOut()
        try await model.activate(authentication("ownerB"))
        let writesBeforeRelease = await server.writes
        await server.gate.resume()
        let result = await save.value
        XCTAssertFalse(result)
        XCTAssertEqual(model.account?.id, "ownerB")
        let writesAfterRelease = await server.writes
        XCTAssertEqual(writesBeforeRelease, writesAfterRelease)
        XCTAssertFalse(model.library.captures.contains { $0.id == "capture00000001" })
    }
    func testRemoteSaveDoesNotBlockTimerAndDuplicateSubmissionIsRejected() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(path: "projects/records", method: "POST")
        let model = try model(server, root: root)
        let save = Task { await model.write(collection: .projects, creationID: "project00000001", fields: ["title": .string("One")]) }
        await server.gate.waitForRequest()
        XCTAssertTrue(model.isSaving)
        await model.start(minutes: 25)
        XCTAssertEqual(model.session?.mode, .running)
        await model.toggle()
        XCTAssertEqual(model.session?.isActive, false)
        let duplicate = await model.write(collection: .projects, creationID: "project00000001", fields: ["title": .string("One")])
        XCTAssertFalse(duplicate)
        await server.gate.resume()
        let result = await save.value
        XCTAssertTrue(result)
        XCTAssertFalse(model.isSaving)
        XCTAssertEqual(model.workspace.projects.filter { $0.id == "project00000001" }.count, 1)
        let reopened = try PokusStore(directory: root)
        let saved = try await reopened.read("ownerA")
        XCTAssertEqual(saved.timer.current?.isActive, false)
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent("ownerA.workspace.json").path))
    }
    func testIdleSyncDoesNotReadNetwork() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer()
        let model = try model(server, root: root)
        for _ in 0..<10 { await model.sync(force: true) }
        let count = await server.requests
        XCTAssertEqual(count, 0)
    }
    func testOfflineRelaunchRecoversTimerWithoutDownloadedDatasets() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try PokusStore(directory: root)
        let paused = SessionEngine().toggle(FocusSession(durationMinutes: 25, now: .now))
        _ = try await store.transition("ownerA", session: paused)
        let model = PokusModel(store: try PokusStore(directory: root), credentials: MemoryCredentials(), surfaces: SilentSurfaces(),
            makeClient: { token in PocketBaseClient(token: token, transport: { _ in throw URLError(.notConnectedToInternet) }) }, startAutomatically: false)
        try await model.activate(authentication("ownerA"))
        XCTAssertEqual(model.session?.id, paused.id)
        XCTAssertEqual(model.session?.isActive, false)
        XCTAssertGreaterThan(model.pendingCount, 0)
        XCTAssertTrue(model.workspace.projects.isEmpty)
        XCTAssertTrue(model.library.captures.isEmpty)
        XCTAssertTrue(model.habitsState.histories.isEmpty)
        let paging = PagingState<Project>()
        await paging.reset(api: try model.readAPI(), query: RecordQueries.projects())
        XCTAssertNotNil(paging.initialError)
        XCTAssertFalse(paging.loaded)
        let files = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
        XCTAssertEqual(files.map(\.lastPathComponent), ["ownerA.timer.json"])
    }
    func testMutationUsesOneRequestAndPreservesOtherFeatureState() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer()
        let model = try model(server, root: root)
        let result = await model.write(collection: .projects, creationID: "project00000001", fields: ["title": .string("One")])
        XCTAssertTrue(result)
        let count = await server.requests
        XCTAssertEqual(count, 1)
        XCTAssertEqual(model.workspace.projects.first?.title, "One")
        XCTAssertTrue(model.library.knowledge.isEmpty)
        XCTAssertTrue(model.habitsState.histories.isEmpty)
    }
    func testReadClientsReuseRecentRecordsAndPages() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer()
        let model = try model(server, root: root)
        let first: Knowledge? = try await model.readAPI().record("knowledge", id: "testknowledge01")
        let firstPage: RecordPage<Knowledge> = try await model.readAPI().listPage("knowledge")
        let reads = await server.requests
        let second: Knowledge? = try await model.readAPI().record("knowledge", id: "testknowledge01")
        let secondPage: RecordPage<Knowledge> = try await model.readAPI().listPage("knowledge")
        let repeatedReads = await server.requests
        XCTAssertEqual(reads, 2)
        XCTAssertEqual(repeatedReads, reads)
        XCTAssertEqual(second?.title, first?.title)
        XCTAssertEqual(secondPage.items.map(\.id), firstPage.items.map(\.id))
    }
    func testWritesAndManualRefreshInvalidateCachedReads() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer()
        let model = try model(server, root: root)
        let _: Knowledge? = try await model.readAPI().record("knowledge", id: "testknowledge01")
        let _: RecordPage<Knowledge> = try await model.readAPI().listPage("knowledge")
        let saved = await model.write(collection: .knowledge, id: "testknowledge01", fields: ["title": .string("Saved locally")])
        XCTAssertTrue(saved)
        let record: Knowledge? = try await model.readAPI().record("knowledge", id: "testknowledge01")
        let page: RecordPage<Knowledge> = try await model.readAPI().listPage("knowledge")
        XCTAssertEqual(record?.title, "Saved locally")
        XCTAssertEqual(page.items.first?.title, "Saved locally")
        let direct = PocketBaseClient(transport: { try await server.respond($0) })
        try await direct.mutate("knowledge", id: "testknowledge01", body: ["title": .string("Saved on another device")])
        let recent: Knowledge? = try await model.readAPI().record("knowledge", id: "testknowledge01")
        XCTAssertEqual(recent?.title, "Saved locally")
        await model.refresh()
        let updated = expectation(description: "Background refresh publishes changed cached records")
        withObservationTracking { _ = model.dataRevision } onChange: { updated.fulfill() }
        let immediate: Knowledge? = try await model.readAPI().record("knowledge", id: "testknowledge01")
        let immediatePage: RecordPage<Knowledge> = try await model.readAPI().listPage("knowledge")
        XCTAssertEqual(immediate?.title, "Saved locally")
        XCTAssertEqual(immediatePage.items.first?.title, "Saved locally")
        await fulfillment(of: [updated], timeout: 3)
        let refreshed: Knowledge? = try await model.readAPI().record("knowledge", id: "testknowledge01")
        let refreshedPage: RecordPage<Knowledge> = try await model.readAPI().listPage("knowledge")
        XCTAssertEqual(refreshed?.title, "Saved on another device")
        XCTAssertEqual(refreshedPage.items.first?.title, "Saved on another device")
    }
    func testDiskCacheSurvivesModelRecreationAndExpiredAuthentication() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(), cache = root.appendingPathComponent("display-cache")
        var first: PokusModel? = try model(server, root: root, cacheDirectory: cache)
        let _: Knowledge? = try await first!.readAPI().record("knowledge", id: "testknowledge01")
        let _: RecordPage<Knowledge> = try await first!.readAPI().listPage("knowledge")
        first = nil
        let expired = Authentication(token: "ownerA.eyJleHAiOjF9.expired", record: Account(id: "ownerA", name: "Owner"))
        let reopened = try model(server, root: root, cacheDirectory: cache, auth: expired)
        XCTAssertFalse(reopened.canEdit)
        let before = await server.requests
        let record: Knowledge? = try await reopened.readAPI().record("knowledge", id: "testknowledge01")
        let page: RecordPage<Knowledge> = try await reopened.readAPI().listPage("knowledge")
        let after = await server.requests
        XCTAssertEqual(record?.title, "Test knowledge")
        XCTAssertEqual(page.items.first?.id, "testknowledge01")
        XCTAssertEqual(after, before, "Saved records must be available without a network or token refresh")
    }
    func testPersistentCachesStayAccountScopedAndSignOutRemovesCopies() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(), cache = root.appendingPathComponent("display-cache")
        let first = try model(server, root: root, cacheDirectory: cache)
        let _: Knowledge? = try await first.readAPI().record("knowledge", id: "testknowledge01")
        let secondAuth = Authentication(token: "ownerB.eyJleHAiOjF9.expired", record: Account(id: "ownerB", name: "Other"))
        let second = try model(server, root: root, cacheDirectory: cache, auth: secondAuth)
        do {
            let _: Knowledge? = try await second.readAPI().record("knowledge", id: "testknowledge01")
            XCTFail("Another account must not read the saved copy")
        } catch { }
        await first.signOut()
        let expired = Authentication(token: "ownerA.eyJleHAiOjF9.expired", record: Account(id: "ownerA", name: "Owner"))
        let reopened = try model(server, root: root, cacheDirectory: cache, auth: expired)
        do {
            let _: Knowledge? = try await reopened.readAPI().record("knowledge", id: "testknowledge01")
            XCTFail("Explicit sign-out must remove downloaded account records")
        } catch { }
    }
    func testEditingNotePreservesUnrelatedProjectCache() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer()
        let model = try model(server, root: root, cacheDirectory: root.appendingPathComponent("display-cache"))
        let _: Project? = try await model.readAPI().record("projects", id: "testproject0001")
        let _: Knowledge? = try await model.readAPI().record("knowledge", id: "testknowledge01")
        let saved = await model.write(collection: .knowledge, id: "testknowledge01", fields: ["title": .string("Changed note")])
        XCTAssertTrue(saved)
        let before = await server.requests
        let project: Project? = try await model.readAPI().record("projects", id: "testproject0001")
        let after = await server.requests
        XCTAssertEqual(project?.title, "Test project")
        XCTAssertEqual(after, before)
        let note: Knowledge? = try await model.readAPI().record("knowledge", id: "testknowledge01")
        XCTAssertEqual(note?.title, "Changed note")
    }
    func testSigningOutAndReactivatingDoesNotReusePreviousReadCache() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer()
        let model = try model(server, root: root)
        let direct = PocketBaseClient(transport: { try await server.respond($0) })
        let _: Knowledge? = try await model.readAPI().record("knowledge", id: "testknowledge01")
        for owner in ["ownerA", "ownerB"] {
            await model.signOut()
            XCTAssertThrowsError(try model.readAPI())
            try await direct.mutate("knowledge", id: "testknowledge01", body: ["title": .string("Record for \(owner)")])
            try await model.activate(authentication(owner))
            let reads = await server.requests
            let record: Knowledge? = try await model.readAPI().record("knowledge", id: "testknowledge01")
            let afterRead = await server.requests
            XCTAssertEqual(afterRead, reads + 1)
            XCTAssertEqual(record?.title, "Record for \(owner)")
        }
    }
    func testAutomaticRefreshSkipsRecentDataButManualAndExpiredRefreshReload() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer()
        let model = try model(server, root: root)
        let originalRevision = model.dataRevision
        await model.refreshIfNeeded()
        let initialRequests = await server.requests
        XCTAssertGreaterThan(initialRequests, 0)
        XCTAssertEqual(model.dataRevision, originalRevision)
        await model.refreshIfNeeded(now: Date().addingTimeInterval(30))
        let recentRequests = await server.requests
        XCTAssertEqual(recentRequests, initialRequests)
        XCTAssertEqual(model.dataRevision, originalRevision)
        await model.refresh()
        let manualRequests = await server.requests
        XCTAssertGreaterThan(manualRequests, recentRequests)
        XCTAssertEqual(model.dataRevision, originalRevision + 1)
        await model.refreshIfNeeded(now: Date().addingTimeInterval(61))
        let expiredRequests = await server.requests
        XCTAssertGreaterThan(expiredRequests, manualRequests)
        XCTAssertEqual(model.dataRevision, originalRevision + 2)
    }
    func testStaleRefreshCannotOverwriteNewlySavedRecord() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(path: "auth-refresh", method: "POST")
        let model = try model(server, root: root)
        let refresh = Task { await model.refresh() }
        await server.gate.waitForRequest()
        let result = await model.write(collection: .projects, creationID: "project00000001", fields: ["title": .string("Fresh")])
        XCTAssertTrue(result)
        await server.gate.resume()
        await refresh.value
        XCTAssertEqual(model.workspace.projects.first?.title, "Fresh")
        let store = try PokusStore(directory: root)
        let cache = try await store.read("ownerA")
        XCTAssertTrue(cache.timer.operations.isEmpty)
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent("ownerA.workspace.json").path))
    }
    func testTypedMetadataEditPreservesRichDescriptionAndCaptureLinks() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer()
        let model = try model(server, root: root)
        let original = try JSONDecoder().decode(Project.self, from: Data(#"{"id":"testproject0001","title":"Test project","description":"<p>Project description</p>","isDone":false,"captures":["testcapture0001"],"created":"2026-01-01"}"#.utf8))
        let result = try await model.saveProject(original: original, creationID: "unused", title: "Renamed", description: "",
                                                status: .active, dueDate: nil, captureID: nil)
        XCTAssertTrue(result)
        XCTAssertEqual(model.workspace.projects.first?.description, original.description)
        XCTAssertEqual(model.workspace.projects.first?.captures, original.captures)
        XCTAssertEqual(model.workspace.projects.first?.title, "Renamed")
    }
    func testHabitEntryAppliesConfirmedRecordWithoutReloadingCollections() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer()
        let model = try model(server, root: root)
        let id = "habit0000000001", day = DayKey()
        try await model.writeHabits { api, owner in
            try await api.habitBatch([("POST", "habits", nil, ["id": .string(id), "owner": .string(owner), "name": .string("Read"), "kind": .string("check"), "unit": .string(""), "startDay": .string(day.rawValue)])])
        }
        let before = await server.requests
        try await model.writeHabits { api, owner in
            let entry = try await api.habitDailyID("habit_entries", habit: id, day: day.rawValue)
            return try await api.habitBatch([("PUT", "habit_entries", nil, ["id": .string(entry), "owner": .string(owner), "habit": .string(id), "day": .string(day.rawValue), "value": .number(1)])])
        }
        let after = await server.requests
        XCTAssertEqual(after - before, 2)
        XCTAssertTrue(model.habitsState.histories.first!.isComplete(on: day))
        let store = try PokusStore(directory: root)
        let saved = try await store.read("ownerA")
        XCTAssertTrue(saved.timer.operations.isEmpty)
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent("ownerA.habits.json").path))
        let paths = await server.paths
        XCTAssertFalse(paths.contains("GET /api/collections/habits/records"))
        do {
            try await model.writeHabits { _, _ in throw URLError(.notConnectedToInternet) }
            XCTFail("Expected write failure")
        } catch { }
        XCTAssertTrue(model.habitsState.histories.first!.isComplete(on: day))
        XCTAssertFalse(model.isSaving)
    }
    func testAccountHabitPartialEditsPreserveRemoteTargetAndHistory() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer()
        let model = try model(server, root: root)
        let adapter = AccountHabitViewStore(model: model, owner: "ownerA")
        let api = PocketBaseClient(token: authentication("ownerA").token, transport: { try await server.respond($0) })
        let id = "habit0000000001", today = DayKey(), yesterday = DayKey().adding(days: -1)
        try await api.habitBatch([
            ("POST", "habits", nil, ["id": .string(id), "owner": .string("ownerA"), "name": .string("Read"), "kind": .string("number"), "unit": .string("pages"), "startDay": .string(yesterday.rawValue)]),
            ("POST", "habit_targets", nil, ["id": .string(HabitWire.dailyID("habit_targets", habit: id, day: yesterday.rawValue)), "owner": .string("ownerA"), "habit": .string(id), "day": .string(yesterday.rawValue), "target": .number(10)])
        ])
        try await loadHabitSnapshot(api, into: model)
        let uuid = HabitWire.identity(id)
        XCTAssertEqual(adapter.history(id: uuid)?.target(on: today), 10)
        // Another client changes the target after the editor's original draft was captured.
        try await api.habitBatch([("PUT", "habit_targets", nil, ["id": .string(HabitWire.dailyID("habit_targets", habit: id, day: today.rawValue)), "owner": .string("ownerA"), "habit": .string(id), "day": .string(today.rawValue), "target": .number(20)])])
        try await loadHabitSnapshot(api, into: model)
        try await adapter.edit(id: uuid, name: "Read books", target: nil)
        XCTAssertEqual(adapter.history(id: uuid)?.target(on: today), 20)
        XCTAssertEqual(adapter.history(id: uuid)?.target(on: yesterday), 10)
        let renameBatch = await server.batches.last
        XCTAssertEqual(renameBatch?.count, 1)
        guard case .object(let rename)? = renameBatch?.first else { return XCTFail("Expected name-only PATCH") }
        XCTAssertEqual(rename["method"], .string("PATCH"))
        XCTAssertEqual(rename["body"], .object(["name": .string("Read books")]))
        try await adapter.edit(id: uuid, name: nil, target: 30)
        XCTAssertEqual(adapter.history(id: uuid)?.name, "Read books")
        XCTAssertEqual(adapter.history(id: uuid)?.target(on: today), 30)
        XCTAssertEqual(adapter.history(id: uuid)?.unit, "pages")
        XCTAssertEqual(adapter.history(id: uuid)?.kind, .number)
        let targetBatch = await server.batches.last
        XCTAssertEqual(targetBatch?.count, 1)
        guard case .object(let target)? = targetBatch?.first else { return XCTFail("Expected target-only PUT") }
        XCTAssertEqual(target["method"], .string("PUT"))
        XCTAssertEqual(target["url"], .string("/api/collections/habit_targets/records"))
        let before = await server.requests
        try await adapter.edit(id: uuid, name: nil, target: nil)
        let after = await server.requests
        XCTAssertEqual(after, before)
        let confirmed = try await api.habits()
        let history = try XCTUnwrap(confirmed.histories().first)
        XCTAssertEqual(history.target(on: yesterday), 10)
        XCTAssertEqual(history.target(on: today), 30)
        XCTAssertEqual(history.name, "Read books")
    }

    func testHabitRefreshDuringWriteDoesNotFetchStaleData() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(path: "/api/batch", method: "POST")
        let model = try model(server, root: root)
        let adapter = AccountHabitViewStore(model: model, owner: "ownerA")
        let id = "habit0000000001"
        let write = Task { try await adapter.create(id: id, name: "Read", kind: .number, unit: "pages", target: 10) }
        await server.gate.waitForRequest()
        XCTAssertTrue(model.isSaving)
        let before = await server.requests
        let revision = model.dataRevision
        await model.refreshHabits()
        let after = await server.requests
        XCTAssertEqual(after, before)
        XCTAssertEqual(model.dataRevision, revision)
        await server.gate.resume()
        try await write.value
        let uuid = HabitWire.identity(id), today = DayKey()
        try await adapter.setValue(10, for: uuid, on: today)
        await model.refreshHabits()
        XCTAssertTrue(try XCTUnwrap(adapter.history(id: uuid)).isComplete(on: today))
        XCTAssertGreaterThan(model.dataRevision, revision)
        let api = PocketBaseClient(token: authentication("ownerA").token, transport: { try await server.respond($0) })
        let confirmed = try await api.habits()
        XCTAssertTrue(try XCTUnwrap(confirmed.histories().first).isComplete(on: today))
        XCTAssertFalse(model.isSaving)
    }

    func testAccountHabitValidationFailureAndLostResponseRecovery() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer()
        let model = try model(server, root: root)
        let adapter = AccountHabitViewStore(model: model, owner: "ownerA")
        let id = "habit0000000001", uuid = HabitWire.identity(id)
        let before = await server.requests
        for (name, unit, target) in [(" ", "pages", 1.0), (String(repeating: "n", count: 121), "", 1), ("Read", String(repeating: "u", count: 41), 1), ("Read", "pages", 0)] {
            do {
                try await adapter.create(id: id, name: name, kind: .number, unit: unit, target: target)
                XCTFail("Expected invalid input to be rejected")
            } catch { }
        }
        let after = await server.requests
        XCTAssertEqual(after, before)
        await server.loseHabitSaveResponse()
        try await adapter.create(id: id, name: "Read", kind: .number, unit: "pages", target: 0.0000000000001)
        XCTAssertEqual(adapter.histories.count, 1)
        XCTAssertEqual(adapter.history(id: uuid)?.target(on: DayKey()), 0.0000000000001)
        let api = PocketBaseClient(token: authentication("ownerA").token, transport: { try await server.respond($0) })
        try await loadHabitSnapshot(api, into: model)
        XCTAssertEqual(adapter.histories.count, 1)
        let requestCount = await server.requests
        for (name, target) in [(String?.some(" "), Double?.none), (.some(String(repeating: "n", count: 121)), .none), (.none, .some(0)), (.none, .some(.infinity))] {
            do { try await adapter.edit(id: uuid, name: name, target: target); XCTFail("Expected invalid edit") }
            catch { }
        }
        let requestsAfterInvalidEdits = await server.requests
        XCTAssertEqual(requestsAfterInvalidEdits, requestCount)
        await server.failHabitSave()
        do { try await adapter.edit(id: uuid, name: "Read books", target: nil); XCTFail("Expected save failure") }
        catch { }
        XCTAssertEqual(adapter.history(id: uuid)?.name, "Read")
        XCTAssertFalse(model.isSaving)
        try await adapter.edit(id: uuid, name: "Read books", target: nil)
        XCTAssertEqual(adapter.history(id: uuid)?.name, "Read books")
        let confirmed = try await api.habits()
        XCTAssertEqual(confirmed.habits.first?.name, "Read books")
    }

    func testOverlappingRefreshesShareOneRequestSet() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(path: "auth-refresh", method: "POST")
        let model = try model(server, root: root)
        let first = Task { await model.refresh() }
        await server.gate.waitForRequest()
        let second = Task { await model.refresh() }
        await Task.yield()
        await server.gate.resume()
        await first.value; await second.value
        let paths = await server.paths
        XCTAssertEqual(paths.filter { $0.contains("auth-refresh") }.count, 1)
        XCTAssertFalse(paths.contains("GET /api/collections/projects/records"))
        XCTAssertFalse(paths.contains("GET /api/collections/habits/records"))
        XCTAssertFalse(paths.contains("GET /api/collections/captures/records"))
    }
    func testSlowLibraryDoesNotDelayHabitRefresh() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(path: "captures/records")
        let model = try model(server, root: root)
        let api = try model.readAPI()
        let refresh = Task { try await api.listPage("captures") as RecordPage<Capture> }
        await server.gate.waitForRequest()
        let day = try await api.habitDay(DayKey())
        XCTAssertTrue(day.ids.isEmpty)
        await server.gate.resume(); _ = try await refresh.value
    }
    func testPreviewDeadlineSavesWithoutWaitingForUncooperativeTransport() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(path: "link-preview")
        let model = try model(server, root: root, previewBudget: .milliseconds(20))
        let save = Task { await model.saveCapture(fields: ["url": .string("https://example.com"), "kind": .string("article")], creationID: "capture00000001", projectID: nil) }
        await server.gate.waitForRequest()
        let saved = await save.value
        XCTAssertTrue(saved)
        XCTAssertEqual(model.library.captures.first?.id, "capture00000001")
        XCTAssertNil(model.library.captures.first?.preview)
        await server.gate.resume()
    }
    func testCancellingPreviewBeforeWriteCreatesNothing() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(path: "link-preview")
        let model = try model(server, root: root)
        let save = Task { await model.saveCapture(fields: ["url": .string("https://example.com")], creationID: "capture00000001", projectID: nil) }
        await server.gate.waitForRequest()
        save.cancel()
        let result = await save.value
        XCTAssertFalse(result)
        let paths = await server.paths
        XCTAssertFalse(paths.contains { $0.hasPrefix("POST") })
        XCTAssertTrue(model.library.captures.isEmpty)
        await server.gate.resume()
    }
    func testAccountChangeCancelsObsoleteRefreshWithoutPublishingErrors() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(path: "auth-refresh", method: "POST")
        let model = try model(server, root: root)
        let refresh = Task { await model.refresh() }
        await server.gate.waitForRequest()
        await model.signOut()
        await server.gate.resume(); await refresh.value
        XCTAssertNil(model.account)
        XCTAssertNil(model.error)
        XCTAssertTrue(model.library.captures.isEmpty)
        XCTAssertFalse(model.isLoading)
    }
    func testHabitReadRejectsLateDataAfterAccountSwitch() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(path: "habits/records")
        let model = try model(server, root: root)
        let adapter = AccountHabitViewStore(model: model, owner: "ownerA")
        let read = Task { try await adapter.dayIndex(DayKey()) }
        await server.gate.waitForRequest()
        await model.signOut()
        try await model.activate(authentication("ownerB"))
        await server.gate.resume()
        do { _ = try await read.value; XCTFail("An obsolete account read must not publish") }
        catch is CancellationError { }
        XCTAssertTrue(model.habitsState.histories.isEmpty)
        XCTAssertEqual(model.account?.id, "ownerB")
    }
    func testInitialLibraryFailureIsNotALoadedEmptyState() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let model = PokusModel(authentication: authentication("ownerA"), store: try PokusStore(directory: root),
                               credentials: MemoryCredentials(), surfaces: SilentSurfaces(), makeClient: { token in
            PocketBaseClient(token: token, transport: { request in
                (Data(), HTTPURLResponse(url: request.url!, statusCode: 500, httpVersion: nil, headerFields: nil)!)
            })
        }, startAutomatically: false)
        let paging = PagingState<Capture>()
        await paging.reset(api: try model.readAPI(), query: RecordQueries.captures())
        XCTAssertFalse(paging.loaded)
        XCTAssertNotNil(paging.initialError)
        XCTAssertFalse(paging.isLoading)
    }

    func testPagingBoundariesAppendFailureAndDetailProjection() async throws {
        let server = ModelServer()
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        for index in 0..<60 {
            try await api.mutate("knowledge", body: ["id": .string(String(format: "page%011d", index)),
                "title": .string("Note \(index)"), "body": .string("<p>Full editor body</p>")])
        }
        let paging = PagingState<Knowledge>()
        await paging.reset(api: api, query: RecordQueries.knowledge())
        XCTAssertEqual(paging.rows.count, 25)
        XCTAssertTrue(paging.rows.allSatisfy { $0.body.isEmpty })
        let firstIDs = paging.rows.map(\.id)
        await server.failRead("knowledge/records")
        await paging.more()
        XCTAssertEqual(paging.rows.map(\.id), firstIDs)
        XCTAssertNotNil(paging.appendError)
        await paging.more(automatic: true)
        XCTAssertNotNil(paging.appendError)
        await paging.more()
        XCTAssertEqual(paging.rows.count, 50)
        XCTAssertNil(paging.appendError)
        await paging.more()
        XCTAssertEqual(paging.rows.count, 61)
        XCTAssertFalse(paging.hasMore)
        XCTAssertEqual(Set(paging.rows.map(\.id)).count, 61)
        XCTAssertFalse(firstIDs.contains("page00000000059"))
        let full: Knowledge? = try await api.record("knowledge", id: "page00000000059")
        XCTAssertEqual(full?.body, "<p>Full editor body</p>")
        let count = try await api.count("knowledge")
        XCTAssertEqual(count, 61)
        try await api.delete("knowledge", id: "page00000000059")
        let deleted: Knowledge? = try await api.record("knowledge", id: "page00000000059")
        XCTAssertNil(deleted)
    }

    func testLateSearchResponseCannotReplaceCurrentQuery() async throws {
        let server = ModelServer(path: "knowledge/records")
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        let paging = PagingState<Knowledge>()
        let obsolete = Task { await paging.reset(api: api, query: RecordQueries.knowledge(), identity: "old") }
        await server.gate.waitForRequest()
        await paging.reset(api: api, query: RecordQueries.knowledge(search: "absent"), identity: "new")
        XCTAssertTrue(paging.loaded)
        XCTAssertTrue(paging.rows.isEmpty)
        await server.gate.resume(); await obsolete.value
        XCTAssertTrue(paging.isCurrent("new"))
        XCTAssertTrue(paging.rows.isEmpty)
    }

    func testPagingRefreshKeepsVisibleRowsUntilReplacementArrives() async throws {
        let server = ModelServer()
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        let paging = PagingState<Knowledge>()
        await paging.reset(api: api, query: RecordQueries.knowledge(), identity: "revision1", contentIdentity: "ownerA-notes")
        let initialIDs = paging.rows.map(\.id)
        XCTAssertEqual(initialIDs, ["testknowledge01"])
        try await api.delete("knowledge", id: "testknowledge01")
        try await api.mutate("knowledge", body: ["id": .string("replacement0001"), "title": .string("Replacement")])
        let gate = RequestGate()
        let delayed = PocketBaseClient(transport: { request in
            let response = try await server.respond(request)
            await gate.hold()
            return response
        })
        let refresh = Task {
            await paging.reset(api: delayed, query: RecordQueries.knowledge(), identity: "revision2", contentIdentity: "ownerA-notes")
        }
        await gate.waitForRequest()
        XCTAssertEqual(paging.rows.map(\.id), initialIDs)
        XCTAssertTrue(paging.isLoading)
        XCTAssertFalse(paging.loaded)
        XCTAssertFalse(paging.hasMore)
        await gate.resume(); await refresh.value
        XCTAssertEqual(paging.rows.map(\.id), ["replacement0001"])
        XCTAssertTrue(paging.isCurrent("revision2"))
        XCTAssertFalse(paging.isLoading)
    }

    func testPagingClearsVisibleRowsWhenQueryOrAccountChanges() async throws {
        let server = ModelServer()
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        for contentIdentity in ["ownerA-filtered-notes", "ownerB-notes"] {
            let paging = PagingState<Knowledge>()
            await paging.reset(api: api, query: RecordQueries.knowledge(), identity: "revision1", contentIdentity: "ownerA-notes")
            XCTAssertFalse(paging.rows.isEmpty)
            let gate = RequestGate()
            let delayed = PocketBaseClient(transport: { request in
                let response = try await server.respond(request)
                await gate.hold()
                return response
            })
            let refresh = Task {
                await paging.reset(api: delayed, query: RecordQueries.knowledge(), identity: "revision2", contentIdentity: contentIdentity)
            }
            await gate.waitForRequest()
            XCTAssertTrue(paging.rows.isEmpty)
            XCTAssertFalse(paging.loaded)
            await gate.resume(); await refresh.value
            XCTAssertTrue(paging.isCurrent("revision2"))
        }
    }

    func testLateRetainedRefreshCannotReplaceNewerRows() async throws {
        let server = ModelServer()
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        let paging = PagingState<Knowledge>()
        await paging.reset(api: api, query: RecordQueries.knowledge(), identity: "revision1", contentIdentity: "ownerA-notes")
        let initialTitle = paging.rows.first?.title
        try await api.mutate("knowledge", id: "testknowledge01", body: ["title": .string("Obsolete title")])
        let gate = RequestGate()
        let delayed = PocketBaseClient(transport: { request in
            let response = try await server.respond(request)
            await gate.hold()
            return response
        })
        let obsolete = Task {
            await paging.reset(api: delayed, query: RecordQueries.knowledge(), identity: "revision2", contentIdentity: "ownerA-notes")
        }
        await gate.waitForRequest()
        XCTAssertEqual(paging.rows.first?.title, initialTitle)
        try await api.mutate("knowledge", id: "testknowledge01", body: ["title": .string("Current title")])
        await paging.reset(api: api, query: RecordQueries.knowledge(), identity: "revision3", contentIdentity: "ownerA-notes")
        XCTAssertEqual(paging.rows.first?.title, "Current title")
        await gate.resume(); await obsolete.value
        XCTAssertEqual(paging.rows.first?.title, "Current title")
        XCTAssertTrue(paging.isCurrent("revision3"))
    }

    func testFailedRetainedRefreshKeepsRowsAndCanRetry() async throws {
        let server = ModelServer()
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        let paging = PagingState<Knowledge>()
        await paging.reset(api: api, query: RecordQueries.knowledge(), identity: "revision1", contentIdentity: "ownerA-notes")
        let initialIDs = paging.rows.map(\.id)
        await server.failRead("knowledge/records")
        await paging.reset(api: api, query: RecordQueries.knowledge(), identity: "revision2", contentIdentity: "ownerA-notes")
        XCTAssertEqual(paging.rows.map(\.id), initialIDs)
        XCTAssertNotNil(paging.initialError)
        XCTAssertFalse(paging.isCurrent("revision2"))
        XCTAssertFalse(paging.isLoading)
        let requestsAfterFailure = await server.requests
        await paging.appeared(initialIDs.last!)
        let requestsAfterAppearance = await server.requests
        XCTAssertEqual(requestsAfterAppearance, requestsAfterFailure)
        XCTAssertNotNil(paging.initialError)
        XCTAssertFalse(paging.loaded)
        await paging.reset(api: api, query: RecordQueries.knowledge(), identity: "revision2-retry", contentIdentity: "ownerA-notes")
        XCTAssertEqual(paging.rows.map(\.id), initialIDs)
        XCTAssertNil(paging.initialError)
        XCTAssertTrue(paging.isCurrent("revision2-retry"))
    }

    func testStreamingSummariesIncludeRecordsBeyondLoadedPagesAndPendingIDs() async throws {
        let server = ModelServer()
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        let session = FocusSession(durationMinutes: 1, now: Date(timeIntervalSince1970: 100))
        let complete = SessionEngine(now: { Date(timeIntervalSince1970: 160) }).finish(session, save: true)
        for index in 0..<125 {
            try await api.mutate("pomodoro_sessions", body: ["id": .string(index == 0 ? complete.id : String(format: "focus%010d", index)),
                "mode": .string("complete"), "durationMinutes": .number(1), "remainingSeconds": .number(0)])
            try await api.mutate("tasks", body: ["id": .string(String(format: "sumtask%08d", index)), "project": .string("testproject0001"),
                "isDone": .bool(index % 2 == 0), "focusedSeconds": .number(10)])
        }
        let total = try await api.focusedTotal(pending: [complete, complete])
        XCTAssertEqual(total, 125 * 60)
        let summary = try await api.projectSummary("testproject0001")
        XCTAssertEqual(summary.total, 125)
        XCTAssertEqual(summary.completed, 63)
        XCTAssertEqual(summary.seconds, 1250)
    }

    func testProjectListSummaryUsesCountsWithoutScanningTaskBodies() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer()
        let direct = PocketBaseClient(transport: { try await server.respond($0) })
        for index in 0..<125 {
            try await direct.mutate("tasks", body: ["id": .string(String(format: "counttask%06d", index)),
                "project": .string("testproject0001"), "isDone": .bool(index % 2 == 0), "focusedSeconds": .number(10)])
        }
        let model = PokusModel(authentication: authentication("ownerA"), store: try PokusStore(directory: root),
            credentials: MemoryCredentials(), surfaces: SilentSurfaces(), makeClient: { token in
                PocketBaseClient(token: token, transport: { request in
                    let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
                    XCTAssertEqual(query.first { $0.name == "perPage" }?.value, "1")
                    XCTAssertEqual(query.first { $0.name == "fields" }?.value, "id")
                    return try await server.respond(request)
                })
            }, startAutomatically: false)
        let requestsBefore = await server.requests
        let summary = try await model.readAPI().projectSummary("testproject0001", includeFocus: false)
        let requestsAfter = await server.requests
        XCTAssertEqual(summary.completed, 63)
        XCTAssertEqual(summary.total, 125)
        XCTAssertEqual(summary.seconds, 0)
        XCTAssertEqual(requestsAfter, requestsBefore + 2)
        _ = try await model.readAPI().projectSummary("testproject0001", includeFocus: false)
        let requestsAfterReopen = await server.requests
        XCTAssertEqual(requestsAfterReopen, requestsAfter)
    }

    func testHabitReadsRespectHistoricalTargetsYearRangeAndUnfinishedToday() async throws {
        let server = ModelServer()
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        let id = "numberhabit0001", today = DayKey(rawValue: "2026-01-02")!
        try await api.mutate("habits", body: ["id": .string(id), "name": .string("Read"), "kind": .string("number"), "unit": .string("pages"), "startDay": .string("2025-12-30")])
        for (index, pair) in [("2025-12-30", 10.0), ("2026-01-01", 20.0)].enumerated() {
            try await api.mutate("habit_targets", body: ["id": .string(String(format: "target%09d", index)), "habit": .string(id), "day": .string(pair.0), "target": .number(pair.1)])
        }
        for (index, pair) in [("2025-12-30", 10.0), ("2025-12-31", 15.0), ("2026-01-01", 20.0), ("2026-01-02", 5.0)].enumerated() {
            try await api.mutate("habit_entries", body: ["id": .string(String(format: "entry%010d", index)), "habit": .string(id), "day": .string(pair.0), "value": .number(pair.1)])
        }
        let stats = try await api.habitStatistics(through: today)
        XCTAssertEqual(stats.overall, Streaks(current: 3, longest: 3, completedDays: 3))
        let year = try await api.habitActivity(year: 2026, today: today, habit: id)
        XCTAssertEqual(year.individual?.entries.count, 2)
        XCTAssertEqual(year.individual?.fraction(on: today), 0.25)
        XCTAssertEqual(year.progress[DayKey(rawValue: "2026-01-01")!]?.completed, 1)
        let oldDay = DayKey(rawValue: "2025-12-31")!
        let index = try await api.habitDay(oldDay)
        XCTAssertEqual(index.completed, [id])
        let rows = try await api.habitRows(ids: [id], on: oldDay, index: index)
        XCTAssertEqual(rows.first?.1.target(on: oldDay), 10)
        XCTAssertEqual(rows.first?.1.value(on: oldDay), 15)
        try await api.mutate("habit_entries", id: "entry0000000001", body: ["value": .number(3)])
        let changed = try await api.habitDay(oldDay)
        XCTAssertEqual(changed.remaining, [id])
        let refreshed = try await api.habitStatistics(through: today)
        XCTAssertEqual(refreshed.overall.current, 1)
        XCTAssertEqual(refreshed.overall.completedDays, 2)
    }

    func testHabitDayCountsAndHydrationAreIndependentOfTheFirstPage() async throws {
        let server = ModelServer()
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        let day = DayKey(rawValue: "2026-01-01")!
        for index in 0..<60 {
            let id = String(format: "habit%010d", index)
            try await api.mutate("habits", body: ["id": .string(id), "name": .string("Habit \(index)"), "kind": .string("check"), "unit": .string(""), "startDay": .string("2025-01-01")])
            if index >= 30 {
                try await api.mutate("habit_entries", body: ["id": .string(String(format: "entry%010d", index)), "habit": .string(id), "day": .string(day.rawValue), "value": .number(1)])
            }
        }
        let index = try await api.habitDay(day)
        XCTAssertEqual(index.ids.count, 60)
        XCTAssertEqual(index.progress, DayProgress(completed: 30, total: 60))
        let rows = try await api.habitRows(ids: Array(index.remaining.prefix(25)), on: day, index: index)
        XCTAssertEqual(rows.count, 25)
        XCTAssertTrue(rows.allSatisfy { !$0.1.isComplete(on: day) })
        let stats = try await api.habitStatistics(through: day)
        XCTAssertEqual(stats.byID.count, 60)
        XCTAssertEqual(stats.overall.completedDays, 1)
    }

    func testSparseRichTextSearchAndSegmentedTaskOrder() async throws {
        let server = ModelServer()
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        for index in 0..<60 {
            try await api.mutate("tasks", body: ["id": .string(String(format: "task%011d", index)),
                "title": .string("Task \(index)"), "description": .string(index >= 30 ? "<p>Caf&#233; &amp; Unicode</p>" : "Other"),
                "priority": .string(index % 2 == 0 ? "urgent" : "low"), "isDone": .bool(index >= 55)])
        }
        let search = RecordReader(api: api, query: RecordQueries.tasks(status: "all", search: "café & unicode"))
        let batch = try await search.next()
        XCTAssertEqual(batch.items.count, 25)
        XCTAssertTrue(batch.items.allSatisfy { Int($0.id.suffix(11))! >= 30 })
        await search.accept()
        let tail = try await search.next()
        XCTAssertEqual(tail.items.count, 5)
        XCTAssertFalse(tail.hasMore)
        let smart = RecordReader(api: api, query: RecordQueries.tasks(status: "all"))
        var rows: [FocusTask] = []
        while true {
            let page = try await smart.next(); rows += page.items; await smart.accept()
            if !page.hasMore { break }
        }
        XCTAssertEqual(rows.count, 60)
        XCTAssertFalse(rows.prefix(55).contains(where: \.isDone))
        XCTAssertTrue(rows.suffix(5).allSatisfy(\.isDone))
        XCTAssertTrue(rows.prefix(28).allSatisfy { $0.priority == .urgent })
        let alpha = RecordReader(api: api, query: RecordQueries.tasks(status: "all", sort: "alphabetical"))
        let sorted = try await alpha.next()
        XCTAssertEqual(sorted.items.count, 25)
        XCTAssertEqual(sorted.items.map(\.title), rows.map(\.title).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }.prefix(25).map { $0 })
    }

    func testProjectSegmentsKeepDatedRowsFirstAndDueIncludesOverdue() async throws {
        let server = ModelServer()
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        for index in 0..<60 {
            try await api.mutate("projects", body: ["id": .string(String(format: "project%08d", index)), "title": .string("Project \(index)"),
                "dueDate": .string(index < 30 ? String(format: "2020-01-%02d", 1 + index) : ""),
                "status": .string(index == 0 ? "completed" : "active")])
        }
        let reader = RecordReader(api: api, query: RecordQueries.projects())
        var rows: [Project] = []
        while true {
            let batch = try await reader.next(); rows += batch.items; await reader.accept()
            if !batch.hasMore { break }
        }
        XCTAssertEqual(rows.count, 61)
        XCTAssertTrue(rows.prefix(30).allSatisfy { !($0.dueDate ?? "").isEmpty })
        XCTAssertTrue(rows.suffix(31).allSatisfy { ($0.dueDate ?? "").isEmpty })
        XCTAssertEqual(rows.prefix(30).compactMap(\.dueDate), rows.prefix(30).compactMap(\.dueDate).sorted())
        let dueReader = RecordReader(api: api, query: RecordQueries.projects(status: "due"))
        let due = try await dueReader.next(); await dueReader.accept()
        let tail = try await dueReader.next()
        XCTAssertEqual(due.items.count + tail.items.count, 29)
        XCTAssertTrue((due.items + tail.items).allSatisfy { WorkspaceRules.dueSoon($0) })
    }

    func testCalendarQueriesInheritanceOverridesArchiveAndUnscheduledAcrossPages() async throws {
        let server = ModelServer()
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        try await api.mutate("projects", body: ["id": .string("calendarproject"), "title": .string("Dated project"), "dueDate": .string("2026-10-10")])
        for index in 0..<60 {
            try await api.mutate("tasks", body: ["id": .string(String(format: "calendart%06d", index)), "title": .string("Inherited \(index)"), "project": .string("calendarproject")])
        }
        try await api.mutate("tasks", body: ["id": .string("ownoutside00001"), "title": .string("Outside month"), "project": .string("calendarproject"), "dueDate": .string("2026-11-01")])
        try await api.mutate("tasks", body: ["id": .string("unassigned00001"), "title": .string("Undated task")])
        let start = DayKey(rawValue: "2026-10-01")!, end = DayKey(rawValue: "2026-10-31")!
        let window = try await api.calendarWindow(from: start, through: end)
        XCTAssertEqual(window.items.filter { $0.kind == .task }.count, 60)
        XCTAssertTrue(window.items.filter { $0.kind == .task }.allSatisfy { $0.inheritsProjectDate && $0.day?.rawValue == "2026-10-10" })
        XCTAssertFalse(window.items.contains { $0.sourceID == "ownoutside00001" })
        let overdue = try await api.calendarOverdue(before: DayKey(rawValue: "2026-10-11")!)
        XCTAssertEqual(overdue.filter { $0.kind == .task }.count, 60)
        try await api.mutate("projects", id: "calendarproject", body: ["dueDate": .string("")])
        let unscheduled = try await api.calendarUnscheduled()
        XCTAssertEqual(unscheduled.filter { $0.kind == .task }.count, 61)
        XCTAssertTrue(unscheduled.allSatisfy { $0.day == nil })
        try await api.mutate("projects", id: "calendarproject", body: ["dueDate": .string("2026-10-10"), "isDone": .bool(true)])
        let archived = try await api.calendarWindow(from: start, through: end)
        XCTAssertTrue(archived.items.isEmpty)
        let withoutArchived = try await api.calendarUnscheduled()
        XCTAssertEqual(withoutArchived.filter { $0.kind == .task }.map(\.sourceID), ["unassigned00001"])
    }

    func testCalendarReminderBoundsAndCompletionAreIndependentOfProcessing() async throws {
        let server = ModelServer()
        let api = PocketBaseClient(transport: { try await server.respond($0) })
        let day = DayKey(rawValue: "2026-10-06")!, zone = TimeZone(identifier: "Asia/Jakarta")!
        let start = CalendarProjection.startOfDay(day, timeZone: zone).timeIntervalSince1970 * 1000
        let end = CalendarProjection.startOfDay(day.adding(days: 1), timeZone: zone).timeIntervalSince1970 * 1000
        for (id, instant, completed) in [("atstart00000001", start, false), ("atend0000000001", end, false), ("done00000000001", start + 1000, true)] {
            try await api.mutate("captures", body: ["id": .string(id), "title": .string(id), "isProcessed": .bool(true), "reminderAt": .number(instant), "reminderDone": .bool(completed)])
        }
        let window = try await api.calendarWindow(from: day, through: day, timeZone: zone)
        XCTAssertEqual(Set(window.items.map(\.sourceID)), ["atstart00000001", "done00000000001"])
        XCTAssertTrue(window.items.first { $0.sourceID == "done00000000001" }?.isComplete == true)
        let pending = try await api.calendarReminders()
        XCTAssertEqual(Set(pending.map(\.id)), ["atstart00000001", "atend0000000001"])
    }

    func testReminderValidationRoundingCompletionAndRemovalPreserveCaptureContent() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(), model = try model(server, root: root)
        for date in [Date(timeIntervalSinceNow: -60), Date(timeIntervalSince1970: .infinity), Date(timeIntervalSince1970: 253402300800)] {
            do { try await model.setCaptureReminder(id: "testcapture0001", date: date); XCTFail("Expected invalid date to fail") }
            catch { XCTAssertTrue(error.localizedDescription.contains("future")) }
        }
        let invalidWrites = await server.writes
        XCTAssertEqual(invalidWrites, 0)
        let date = Date(timeIntervalSince1970: 2_000_000_000.12345)
        try await model.setCaptureReminder(id: "testcapture0001", date: date)
        var record = try XCTUnwrap(model.library.captures.first)
        XCTAssertEqual(record.reminderAt, 2_000_000_000_123)
        XCTAssertEqual(record.note, "<p>Source notes</p>")
        try await model.setCaptureProcessed(record, processed: true)
        try await model.setCaptureReminderDone(id: record.id, done: true)
        record = try XCTUnwrap(model.library.captures.first)
        XCTAssertTrue(record.reminderDone && record.isProcessed)
        try await model.setCaptureReminder(id: record.id, date: date.addingTimeInterval(60))
        XCTAssertFalse(try XCTUnwrap(model.library.captures.first).reminderDone)
        try await model.setCaptureReminder(id: record.id, date: nil)
        record = try XCTUnwrap(model.library.captures.first)
        XCTAssertEqual(record.reminderAt, 0)
        XCTAssertFalse(record.reminderDone)
        XCTAssertTrue(record.isProcessed)
        XCTAssertEqual(record.title, "Test capture")
        XCTAssertEqual(record.note, "<p>Source notes</p>")
    }

    func testQueuedCaptureEditsKeepReminderAndContentWithoutConcurrentReplacement() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(path: "captures/records/testcapture0001", method: "PATCH")
        let model = try model(server, root: root)
        let date = Date(timeIntervalSince1970: 2_000_000_000)
        let reminder = Task { try await model.setCaptureReminder(id: "testcapture0001", date: date) }
        await server.gate.waitForRequest()
        let edit = Task { await model.write(collection: .captures, id: "testcapture0001", fields: ["title": .string("Edited while saving")]) }
        await Task.yield()
        await server.gate.resume()
        try await reminder.value
        let saved = await edit.value
        XCTAssertTrue(saved)
        let capture = try XCTUnwrap(model.library.captures.first)
        XCTAssertEqual(capture.title, "Edited while saving")
        XCTAssertEqual(capture.reminderAt, 2_000_000_000_000)
        XCTAssertFalse(capture.reminderDone)
    }

    func testCapturePreviewFinishingAfterReminderSaveKeepsReminderMetadata() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(path: "link-preview")
        let model = try model(server, root: root, previewBudget: .seconds(30))
        let fetched: Capture? = try await model.readAPI().record("captures", id: "testcapture0001")
        let original = try XCTUnwrap(fetched)
        let save = Task {
            try await model.saveCapture(original: original, creationID: original.id, projectID: nil, kind: .article,
                                        title: "Edited title", url: "https://example.org/new", author: "", replacementNote: nil)
        }
        await server.gate.waitForRequest()
        try await model.setCaptureReminder(id: original.id, date: Date(timeIntervalSince1970: 2_000_000_000))
        try await model.setCaptureReminderDone(id: original.id, done: true)
        await server.gate.resume()
        let saved = try await save.value
        XCTAssertTrue(saved)
        let capture = try XCTUnwrap(model.library.captures.first)
        XCTAssertEqual(capture.title, "Edited title")
        XCTAssertEqual(capture.url, "https://example.org/new")
        XCTAssertEqual(capture.note, original.note)
        XCTAssertEqual(capture.reminderAt, 2_000_000_000_000)
        XCTAssertTrue(capture.reminderDone)
    }

    func testCaptureSchedulerPreservesOtherAlertsCapsPendingAndCancelsCompleted() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(), model = try model(server, root: root)
        let api = try model.freshReadAPI(), now = Date(timeIntervalSince1970: 1_800_000_000)
        for index in 0..<65 {
            try await api.mutate("captures", body: ["id": .string(String(format: "reminder%07d", index)), "title": .string("Reminder \(index)"),
                "reminderAt": .number(now.addingTimeInterval(Double(index + 1) * 60).timeIntervalSince1970 * 1000), "reminderDone": .bool(false)])
        }
        let client = FakeCaptureNotifications()
        client.seed("pokus.focus.test"); client.seed("daily.evening-check-in")
        let scheduler = CaptureReminderScheduler(client: client, now: { now })
        await scheduler.refresh(model: model)
        XCTAssertEqual(client.requests.count, 62)
        XCTAssertNotNil(client.requests["pokus.focus.test"])
        XCTAssertNotNil(client.requests["daily.evening-check-in"])
        XCTAssertTrue(model.captureReminderNotice?.contains("5 later reminders") == true)
        let first = try XCTUnwrap(client.requests.keys.first { $0.contains("reminder0000000") })
        client.delivered.insert(first)
        try await api.mutate("captures", id: "reminder0000000", body: ["reminderDone": .bool(true)])
        await scheduler.refresh(model: model)
        XCTAssertNil(client.requests[first]); XCTAssertFalse(client.delivered.contains(first))
        XCTAssertEqual(client.requests.count, 62)
        XCTAssertTrue(client.requests.keys.contains { $0.contains("reminder0000060") })
    }

    func testCaptureSchedulerUsesFreshReadsAndRetainsAlertsOnNetworkFailure() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(), model = try model(server, root: root)
        let now = Date(timeIntervalSince1970: 1_800_000_000), client = FakeCaptureNotifications()
        let scheduler = CaptureReminderScheduler(client: client, now: { now })
        _ = try await model.readAPI().calendarReminders()
        try await model.freshReadAPI().mutate("captures", id: "testcapture0001", body: ["reminderAt": .number(1_800_000_060_000), "reminderDone": .bool(false)])
        await scheduler.refresh(model: model)
        XCTAssertEqual(client.requests.count, 1)
        let existing = Set(client.requests.keys)
        await server.failRead("captures/records")
        await scheduler.refresh(model: model)
        XCTAssertEqual(Set(client.requests.keys), existing)
        XCTAssertTrue(model.captureReminderNotice?.contains("couldn't refresh") == true)
    }

    func testCaptureSchedulerPermissionIsExplicitAndDenialKeepsSavedReminder() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(), model = try model(server, root: root)
        try await model.setCaptureReminder(id: "testcapture0001", date: Date(timeIntervalSince1970: 2_000_000_000))
        let client = FakeCaptureNotifications(); client.status = .notDetermined; client.grantPermission = false
        let scheduler = CaptureReminderScheduler(client: client)
        await scheduler.refresh(model: model)
        XCTAssertEqual(client.permissionRequests, 0)
        await scheduler.refresh(model: model, requestPermission: true)
        XCTAssertEqual(client.permissionRequests, 1)
        XCTAssertTrue(client.requests.isEmpty)
        XCTAssertEqual(model.library.captures.first?.reminderAt, 2_000_000_000_000)
        XCTAssertTrue(model.captureReminderNotice?.contains("Settings") == true)
    }

    func testCaptureSchedulerKeepsSyncedAlertsWhileColdStartLoadsCredentials() async throws {
        let server = ModelServer()
        let model = PokusModel(credentials: MemoryCredentials(), surfaces: SilentSurfaces(),
            makeClient: { token in PocketBaseClient(token: token, transport: { try await server.respond($0) }) },
            startAutomatically: false)
        XCTAssertNil(model.scope)
        XCTAssertFalse(model.storageReady)
        let client = FakeCaptureNotifications()
        let reminderID = "pokus.capture.ownerA.testcapture0001.2000000000000"
        client.seed(reminderID); client.delivered = [reminderID]
        let scheduler = CaptureReminderScheduler(client: client)
        await scheduler.refresh(model: model)
        XCTAssertEqual(Set(client.requests.keys), [reminderID])
        XCTAssertEqual(client.delivered, [reminderID])
        let requestCount = await server.requests
        XCTAssertEqual(requestCount, 0)
    }

    func testSignOutClearsAlertsBeforeLateNotificationAddFinishes() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(), model = try model(server, root: root)
        try await model.setCaptureReminder(id: "testcapture0001", date: Date(timeIntervalSince1970: 2_000_000_000))
        let client = FakeCaptureNotifications(), gate = RequestGate()
        client.seed("pokus.capture.ownerA.old.100"); client.seed("pokus.focus.test")
        client.delivered = ["pokus.capture.ownerA.old.100"]
        client.addGate = gate
        let scheduler = CaptureReminderScheduler(client: client)
        let refresh = Task { await scheduler.refresh(model: model) }
        await gate.waitForRequest()
        await model.signOut()
        await scheduler.refresh(model: model)
        XCTAssertEqual(Set(client.requests.keys), ["pokus.focus.test"])
        XCTAssertTrue(client.delivered.isEmpty)
        await gate.resume()
        await refresh.value
        XCTAssertEqual(Set(client.requests.keys), ["pokus.focus.test"])
    }

    func testSupersededNotificationAddCannotRestoreCompletedReminder() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(), model = try model(server, root: root)
        try await model.setCaptureReminder(id: "testcapture0001", date: Date(timeIntervalSince1970: 2_000_000_000))
        let client = FakeCaptureNotifications(), gate = RequestGate()
        client.addGate = gate
        let scheduler = CaptureReminderScheduler(client: client)
        let earlier = Task { await scheduler.refresh(model: model) }
        await gate.waitForRequest()
        try await model.setCaptureReminderDone(id: "testcapture0001", done: true)
        let started = expectation(description: "Replacement reconciliation started")
        client.onPending = { started.fulfill() }
        let latest = Task { await scheduler.refresh(model: model) }
        await fulfillment(of: [started], timeout: 3)
        await gate.resume()
        await earlier.value; await latest.value
        XCTAssertTrue(client.requests.isEmpty)
        XCTAssertTrue(model.library.captures.first?.reminderDone == true)
    }

    func testExplicitNotificationPermissionSurvivesOverlappingRefresh() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(path: "captures/records", method: "GET"), model = try model(server, root: root)
        try await model.setCaptureReminder(id: "testcapture0001", date: Date(timeIntervalSince1970: 2_000_000_000))
        let client = FakeCaptureNotifications(); client.status = .notDetermined
        let scheduler = CaptureReminderScheduler(client: client)
        let explicit = Task { await scheduler.refresh(model: model, requestPermission: true) }
        await server.gate.waitForRequest()
        let started = expectation(description: "Automatic reconciliation started")
        client.onPending = { started.fulfill() }
        let automatic = Task { await scheduler.refresh(model: model) }
        await fulfillment(of: [started], timeout: 3)
        await server.gate.resume()
        await explicit.value; await automatic.value
        XCTAssertEqual(client.permissionRequests, 1)
        XCTAssertEqual(client.requests.count, 1)
    }

    func testNotificationScheduleFailureDoesNotRollBackSavedReminder() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(), model = try model(server, root: root)
        try await model.setCaptureReminder(id: "testcapture0001", date: Date(timeIntervalSince1970: 2_000_000_000))
        let client = FakeCaptureNotifications(); client.failAdd = true
        await CaptureReminderScheduler(client: client).refresh(model: model)
        XCTAssertEqual(model.library.captures.first?.reminderAt, 2_000_000_000_000)
        XCTAssertTrue(model.captureReminderNotice?.contains("couldn't refresh") == true)
    }

    func testConfirmedCaptureChangesCancelTheirOldAlertsEvenWhenRefreshFails() async throws {
        for mutation in ["complete", "remove", "delete", "reschedule"] {
            let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            defer { try? FileManager.default.removeItem(at: root) }
            let server = ModelServer(), model = try model(server, root: root)
            try await model.setCaptureReminder(id: "testcapture0001", date: Date(timeIntervalSince1970: 2_000_000_000))
            let client = FakeCaptureNotifications()
            let notificationScheduler = CaptureReminderScheduler(client: client)
            model.cancelCaptureReminderAlerts = { owner, id in await notificationScheduler.cancel(owner: owner, captureID: id) }
            let oldID = "pokus.capture.ownerA.testcapture0001.2000000000000"
            let otherID = "pokus.capture.ownerA.testcapture00010.2000000000000"
            client.seed(oldID); client.seed(otherID); client.seed("pokus.focus.test")
            client.delivered = [oldID, otherID]
            switch mutation {
            case "complete": try await model.setCaptureReminderDone(id: "testcapture0001", done: true)
            case "remove": try await model.setCaptureReminder(id: "testcapture0001", date: nil)
            case "delete": try await model.deleteCapture(id: "testcapture0001")
            default: try await model.setCaptureReminder(id: "testcapture0001", date: Date(timeIntervalSince1970: 2_000_000_060))
            }
            XCTAssertNil(client.requests[oldID], mutation)
            XCTAssertFalse(client.delivered.contains(oldID), mutation)
            XCTAssertEqual(Set(client.requests.keys), [otherID, "pokus.focus.test"], mutation)
            XCTAssertEqual(client.delivered, [otherID], mutation)
            await server.failRead("captures/records")
            await notificationScheduler.refresh(model: model)
            XCTAssertEqual(Set(client.requests.keys), [otherID, "pokus.focus.test"], mutation)
            XCTAssertTrue(model.captureReminderNotice?.contains("couldn't refresh") == true, mutation)
            XCTAssertNil(model.error, mutation)
        }
    }

    func testConfirmedCompletionCancelsInFlightAddWithoutWaitingForRefresh() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(), model = try model(server, root: root)
        try await model.setCaptureReminder(id: "testcapture0001", date: Date(timeIntervalSince1970: 2_000_000_000))
        let client = FakeCaptureNotifications(), gate = RequestGate()
        client.addGate = gate
        let scheduler = CaptureReminderScheduler(client: client)
        model.cancelCaptureReminderAlerts = { owner, id in await scheduler.cancel(owner: owner, captureID: id) }
        let earlier = Task { await scheduler.refresh(model: model) }
        await gate.waitForRequest()
        try await model.setCaptureReminderDone(id: "testcapture0001", done: true)
        XCTAssertTrue(model.library.captures.first?.reminderDone == true)
        await server.failRead("captures/records")
        let started = expectation(description: "Refresh after confirmed cancellation")
        client.onPending = { started.fulfill() }
        let latest = Task { await scheduler.refresh(model: model) }
        await fulfillment(of: [started], timeout: 3)
        await gate.resume()
        await earlier.value; await latest.value
        XCTAssertTrue(client.requests.isEmpty)
        XCTAssertTrue(model.captureReminderNotice?.contains("couldn't refresh") == true)
    }

    func testNotificationRoutesAcceptOnlyKnownIdentifiersAndMatchingCapturePayloads() {
        let timestamp = 2_000_000_000_000.0
        let payload: [AnyHashable: Any] = ["owner": "ownerA", "pokusCapture": "capture1", "reminderAt": timestamp]
        XCTAssertEqual(NotificationLaunchRoute.parse(userInfo: payload, identifier: "pokus.capture.ownerA.capture1.2000000000000"),
                       .capture(owner: "ownerA", id: "capture1", reminderAt: timestamp))
        XCTAssertEqual(NotificationLaunchRoute.parse(userInfo: ["owner": "ownerA", "pokusCapture": "capture1", "reminderAt": 2_000_000_000_000],
                       identifier: "pokus.capture.ownerA.capture1.2000000000000"), .capture(owner: "ownerA", id: "capture1", reminderAt: timestamp))
        XCTAssertNil(NotificationLaunchRoute.parse(userInfo: payload, identifier: "pokus.capture.ownerB.capture1.2000000000000"))
        XCTAssertNil(NotificationLaunchRoute.parse(userInfo: payload, identifier: "pokus.calendar-verification.test"))
        XCTAssertEqual(NotificationLaunchRoute.parse(userInfo: [:], identifier: "daily.evening-check-in"), .habits)
        XCTAssertEqual(NotificationLaunchRoute.parse(userInfo: ["pokusTimer": true], identifier: "pokus.focus.session1"), .timer)
        XCTAssertNil(NotificationLaunchRoute.parse(userInfo: [:], identifier: "pokus.focus.session1"))
        XCTAssertNil(NotificationLaunchRoute.parse(userInfo: ["pokusTimer": true], identifier: "unrelated"))
        XCTAssertNil(NotificationLaunchRoute.parse(userInfo: [:], identifier: "unrelated"))
    }

    func testCaptureNotificationRoutesRejectMalformedTimestampsAndIdentifiers() {
        for value in [Double.nan, .infinity, -.infinity, -1, 0, 1.5, 253_402_300_800_000] {
            let payload: [AnyHashable: Any] = ["owner": "ownerA", "pokusCapture": "capture1", "reminderAt": value]
            let suffix = value.isFinite ? String(Int64(value)) : "0"
            XCTAssertNil(NotificationLaunchRoute.parse(userInfo: payload, identifier: "pokus.capture.ownerA.capture1.\(suffix)"))
        }
        for (value, suffix) in [(true as Any, "1"), ("2000000000000" as Any, "2000000000000")] {
            XCTAssertNil(NotificationLaunchRoute.parse(userInfo: ["owner": "ownerA", "pokusCapture": "capture1", "reminderAt": value],
                                                       identifier: "pokus.capture.ownerA.capture1.\(suffix)"))
        }
        XCTAssertNil(NotificationLaunchRoute.parse(userInfo: ["owner": "", "pokusCapture": "capture1", "reminderAt": 2_000_000_000_000],
                                                   identifier: "pokus.capture..capture1.2000000000000"))
        XCTAssertNil(NotificationLaunchRoute.parse(userInfo: ["owner": "ownerA", "pokusCapture": "capture.1", "reminderAt": 2_000_000_000_000],
                                                   identifier: "pokus.capture.ownerA.capture.1.2000000000000"))
    }

    func testNotificationRouteConsumptionKeepsColdLaunchUntilAccountIsReady() {
        defer { NotificationLaunchRoute.pending = nil }
        let capture = NotificationLaunchRoute.Destination.capture(owner: "ownerA", id: "capture1", reminderAt: 2_000_000_000_000)
        NotificationLaunchRoute.pending = capture
        XCTAssertNil(NotificationLaunchRoute.consume(owner: nil))
        XCTAssertEqual(NotificationLaunchRoute.pending, capture)
        XCTAssertEqual(NotificationLaunchRoute.consume(owner: "ownerA"), capture)
        XCTAssertNil(NotificationLaunchRoute.pending)
        NotificationLaunchRoute.pending = capture
        XCTAssertNil(NotificationLaunchRoute.consume(owner: "ownerB"))
        XCTAssertNil(NotificationLaunchRoute.pending)
        NotificationLaunchRoute.pending = .habits
        XCTAssertNil(NotificationLaunchRoute.consume(owner: nil))
        XCTAssertEqual(NotificationLaunchRoute.pending, .habits)
        XCTAssertEqual(NotificationLaunchRoute.consume(owner: "ownerA"), .habits)
        NotificationLaunchRoute.pending = .habits
        XCTAssertEqual(NotificationLaunchRoute.consume(owner: nil, localHabits: true), .habits)
        NotificationLaunchRoute.pending = .timer
        XCTAssertEqual(NotificationLaunchRoute.consume(owner: nil), .timer)
        XCTAssertNil(NotificationLaunchRoute.pending)
    }

    func testSettingProjectDateMovesCachedUnscheduledProjectIntoCalendar() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(), model = try model(server, root: root)
        let originalRows = try await model.readAPI().calendarUnscheduled()
        XCTAssertTrue(originalRows.contains { $0.sourceID == "testproject0001" })
        let fetched: Project? = try await model.readAPI().record("projects", id: "testproject0001")
        let project = try XCTUnwrap(fetched), date = Date()
        let saved = try await model.saveProject(original: project, creationID: project.id, title: project.title,
            description: "", status: project.lifecycle, dueDate: date, captureID: nil)
        XCTAssertTrue(saved)
        let unscheduled = try await model.readAPI().calendarUnscheduled()
        XCTAssertFalse(unscheduled.contains { $0.sourceID == project.id })
        let day = DayKey(date: date)
        let calendar = try await model.readAPI().calendarWindow(from: day, through: day)
        XCTAssertEqual(calendar.items.first { $0.sourceID == project.id }?.day, day)
        let reread: Project? = try await model.readAPI().record("projects", id: project.id)
        XCTAssertEqual(reread?.description, project.description)
    }
}

/// Simulates losing and regaining the connection underneath the model.
private actor NetworkSwitch {
    private(set) var offline = false
    func set(offline: Bool) { self.offline = offline }
    func check() throws { if offline { throw URLError(.notConnectedToInternet) } }
}

extension PokusModelTests {
    private func offlineFirstModel(_ server: ModelServer, network: NetworkSwitch, root: URL) throws -> PokusModel {
        PokusModel(authentication: authentication("ownerA"), store: try PokusStore(directory: root),
                   credentials: MemoryCredentials(), surfaces: SilentSurfaces(),
                   makeClient: { token in PocketBaseClient(token: token, transport: { request in
                       try await network.check()
                       return try await server.respond(request)
                   }) },
                   startAutomatically: false, replicaDirectory: root.appendingPathComponent("replica"))
    }
    private func settle(_ model: PokusModel) async {
        for _ in 0..<500 where model.isSyncing || model.isSyncingData { try? await Task.sleep(for: .milliseconds(10)) }
    }

    func testOfflineEditsApplyLocallyAndSyncWhenReachable() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(), network = NetworkSwitch()
        let model = try offlineFirstModel(server, network: network, root: root)
        await model.refresh()
        XCTAssertTrue(model.replicaStatus.ready)
        await network.set(offline: true)
        XCTAssertTrue(model.canEdit)
        let saved = await model.write(collection: .projects, creationID: "offlineproject1", fields: ["title": .string("Made offline")])
        XCTAssertTrue(saved)
        let paging = PagingState<Project>()
        await paging.reset(api: try model.readAPI(), query: RecordQueries.projects())
        XCTAssertEqual(Set(paging.rows.map(\.title)), ["Made offline", "Test project"])
        await settle(model)
        await model.syncData(force: true)
        XCTAssertTrue(model.pendingIDs.contains("offlineproject1"))
        XCTAssertNotNil(model.dataSyncError)
        await network.set(offline: false)
        await model.syncData(force: true)
        await settle(model)
        XCTAssertTrue(model.pendingIDs.isEmpty)
        XCTAssertNil(model.dataSyncError)
        let remote: Project? = try await PocketBaseClient(transport: { try await server.respond($0) }).record("projects", id: "offlineproject1")
        XCTAssertEqual(remote?.title, "Made offline")
    }

    func testDownloadedRecordsOpenWithoutNetworkAfterRelaunch() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(), network = NetworkSwitch()
        let first = try offlineFirstModel(server, network: network, root: root)
        await first.refresh()
        XCTAssertTrue(first.replicaStatus.ready)
        await network.set(offline: true)
        let relaunched = try offlineFirstModel(server, network: network, root: root)
        try await relaunched.activate(authentication("ownerA"))
        XCTAssertTrue(relaunched.replicaStatus.ready)
        let before = await server.requests
        let note: Knowledge? = try await relaunched.readAPI().record("knowledge", id: "testknowledge01")
        let captures = try await relaunched.readAPI().count("captures")
        let total = try await relaunched.focusTotal(pending: [])
        XCTAssertEqual(note?.title, "Test knowledge")
        XCTAssertEqual(captures, 1)
        XCTAssertEqual(total, 0)
        let after = await server.requests
        XCTAssertEqual(after, before)
    }

    func testPullToRefreshSendsQueuedSessionsWithoutWaitingForRetryDelay() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let server = ModelServer(), network = NetworkSwitch()
        let model = PokusModel(authentication: authentication("ownerA"), store: try PokusStore(directory: root),
                               credentials: MemoryCredentials(), surfaces: SilentSurfaces(),
                               makeClient: { token in PocketBaseClient(token: token, transport: { request in
                                   try await network.check()
                                   return try await server.respond(request)
                               }) }, startAutomatically: false)
        await network.set(offline: true)
        await model.start(minutes: 25)
        for _ in 0..<500 where model.syncError == nil { try? await Task.sleep(for: .milliseconds(10)) }
        await settle(model)
        XCTAssertEqual(model.pendingCount, 1)
        await network.set(offline: false)
        await model.sync()
        XCTAssertEqual(model.pendingCount, 1, "Automatic retries wait for the backoff delay")
        await model.refresh()
        XCTAssertEqual(model.pendingCount, 0, "Pull to refresh sends queued sessions immediately")
    }
}
