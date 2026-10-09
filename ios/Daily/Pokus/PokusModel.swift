import DailyCore
import Foundation
import Network
import Observation
import PokusCore
import PokusNetworking
import PokusPersistence

enum AppRequest: Equatable, Sendable { case timer, startFocus, newCapture }

@MainActor @Observable
final class PokusModel {
    private(set) var authentication: Authentication?
    let focus = FocusTimerState()
    let workspaceState = WorkspaceState()
    let libraryState = LibraryState()
    let habitsState = HabitsState()
    private(set) var isLoading = false
    private(set) var isSaving = false
    private(set) var isSyncing = false
    private(set) var isSyncingData = false
    private(set) var replicaStatus = ReplicaStatus()
    var dataSyncError: String?
    private(set) var isSigningIn = false
    private(set) var isOnline = true
    private(set) var storageReady = false
    var error: String?
    var syncError: String?
    var selectedTaskID = ""
    var openTimer: (() -> Void)?
    /// Set by App Intents, widgets, and links; the root view handles it and clears it.
    var request: AppRequest?
    var requestCaptureReminderAlerts: (() async -> Void)?
    var captureReminderNotice: String?
    var captureReminderPermissionDenied = false
    var refreshCaptureReminderAlerts: (() async -> Void)?
    var cancelCaptureReminderAlerts: ((String, String) async -> Void)?
    private(set) var dataRevision = 0
    var queryIdentity: String { "\(scope?.generation.uuidString ?? "signedout")-\(dataRevision)" }
    /// Once this account's records are on the device, every screen reads them locally;
    /// only history the device doesn't keep is fetched (and saved) online.
    func readAPI() throws -> PocketBaseClient {
        guard account != nil else {
            throw PokusError.message("Sign in to load these records.")
        }
        let online = isOnline && authentication?.isValid == true
        if let replica, replicaStatus.ready { return client.routing(through: replica, history: readCache, online: online) }
        return client.cachingReads(in: readCache, allowNetwork: online)
    }
    func freshReadAPI() throws -> PocketBaseClient {
        if let replica, replicaStatus.ready, account != nil {
            return client.routing(through: replica, history: nil, online: isOnline && authentication?.isValid == true)
        }
        guard isOnline, authentication?.isValid == true else { throw PokusError.message("Connect and sign in to refresh reminder alerts.") }
        return client
    }
    /// Edits apply to the device copy at once and are queued for PocketBase.
    private var writeAPI: PocketBaseClient {
        guard let replica, replicaStatus.ready else { return client }
        return client.routing(through: replica, history: nil, online: isOnline && authentication?.isValid == true)
    }
    @ObservationIgnored private var store: PokusStore?
    @ObservationIgnored private let credentials: any AccountCredentials
    @ObservationIgnored private let google = GoogleSignIn()
    @ObservationIgnored private let monitor = NWPathMonitor()
    @ObservationIgnored private let engine = SessionEngine()
    @ObservationIgnored private let surfaces: any TimerSurfaceClient
    @ObservationIgnored private let makeClient: (String) -> PocketBaseClient
    @ObservationIgnored private var previewTasks: [UUID: PreviewOperation] = [:]
    @ObservationIgnored private var captureWrites: [String: (UUID, Task<Bool, Never>)] = [:]
    @ObservationIgnored private var refreshTask: Task<Void, Never>?
    @ObservationIgnored private var readCache = APIReadCache()
    @ObservationIgnored private var replica: RecordReplica?
    @ObservationIgnored private let replicaDirectory: URL?
    @ObservationIgnored private let batchesCacheWrites: Bool
    @ObservationIgnored private let cacheDirectory: URL?
    @ObservationIgnored private var cacheSession = UUID()
    @ObservationIgnored private var cachePublishTask: Task<Void, Never>?
    @ObservationIgnored private var lastRefreshAt: Date?
    @ObservationIgnored private var refreshReloadRequested = false
    @ObservationIgnored private var refreshManualRequested = false
    @ObservationIgnored private var dataRetryAt = Date.distantPast
    @ObservationIgnored private var dataFailures = 0
    @ObservationIgnored private var dataSyncAgain = false
    @ObservationIgnored private let previewBudget: Duration
    @ObservationIgnored private var workspaceVersion = 0
    @ObservationIgnored private var epoch = UUID()
    @ObservationIgnored private var retryAt = Date.distantPast
    @ObservationIgnored private var dataRetryTask: Task<Void, Never>?
    @ObservationIgnored private var failedAttempts = 0
    @ObservationIgnored private var lastSurfaceSession: FocusSession?
    @ObservationIgnored private let testing = ProcessInfo.processInfo.arguments.contains("-ui-testing")
    @ObservationIgnored private let testBackend = UITestPocketBase()
    var account: Account? { authentication?.record }
    /// With the account's records on this device, edits work offline and sync later.
    var canEdit: Bool {
        storageReady && !isSaving && account != nil && (replicaStatus.ready || (authentication?.isValid == true && isOnline))
    }
    var pendingIDs: Set<String> { replicaStatus.pendingIDs }
    var scope: AccountScope? { account.map { AccountScope(owner: $0.id, generation: epoch) } }
    var workspace: Workspace { workspaceState.value }
    var library: LibraryWorkspace { libraryState.value }
    var session: FocusSession? { focus.timer.current }
    var pendingCount: Int { focus.timer.operations.count }
    var displayedHistory: [FocusSession] {
        var entries = Dictionary(workspace.history.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
        for operation in focus.timer.operations where operation.session.mode == .complete { entries[operation.session.id] = operation.session }
        if let session, session.mode == .complete { entries[session.id] = session }
        return entries.values.sorted { $0.lastTick > $1.lastTick }
    }
    private var client: PocketBaseClient {
        if testing {
            return PocketBaseClient(baseURL: URL(string: "https://pokus-ui-tests.invalid")!,
                token: authentication?.token ?? "", transport: { [testBackend] in try await testBackend.respond($0) })
        }
        return makeClient(authentication?.token ?? "")
    }
    init(authentication: Authentication? = nil, store: PokusStore? = nil,
         credentials: any AccountCredentials = CredentialStore(),
         surfaces: (any TimerSurfaceClient)? = nil,
         makeClient: @escaping (String) -> PocketBaseClient = { PocketBaseClient(token: $0) },
         startAutomatically: Bool = true, previewBudget: Duration = .seconds(2), cacheDirectory: URL? = nil,
         replicaDirectory: URL? = nil) {
        self.authentication = authentication
        self.store = store
        self.credentials = credentials
        self.surfaces = surfaces ?? TimerSurfaces()
        self.makeClient = makeClient
        self.previewBudget = previewBudget
        self.cacheDirectory = cacheDirectory ?? (startAutomatically
            ? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
                .appendingPathComponent(ProcessInfo.processInfo.arguments.contains("-ui-testing") ? "PokusDisplayCacheUITests" : "PokusDisplayCache", isDirectory: true)
                .appendingPathComponent("v1", isDirectory: true)
            : nil)
        let arguments = ProcessInfo.processInfo.arguments
        let uiTesting = arguments.contains("-ui-testing")
        self.replicaDirectory = replicaDirectory ?? (startAutomatically && (!uiTesting || arguments.contains("-ui-testing-replica"))
            ? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                .appendingPathComponent(uiTesting ? "PokusUITests" : "Pokus", isDirectory: true).appendingPathComponent("Replica", isDirectory: true)
            : nil)
        batchesCacheWrites = startAutomatically
        storageReady = store != nil
        configureReadCache()
        (self.surfaces as? TimerSurfaces)?.taskTitle = { [weak self] id in await self?.taskTitle(id) }
        guard startAutomatically else { return }
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                let reconnected = self?.isOnline == false && path.status == .satisfied
                self?.isOnline = path.status == .satisfied
                if reconnected { await self?.refreshReadCache() }
                if path.status == .satisfied { await self?.sync(); await self?.syncData() }
            }
        }
        monitor.start(queue: DispatchQueue(label: "pokus.connectivity"))
        Task { await load() }
    }
    deinit { monitor.cancel() }
    func load() async {
        do {
            await readCache.deactivate()
            if testing, !ProcessInfo.processInfo.arguments.contains("-ui-testing-keep-cache"), let cacheDirectory {
                try? FileManager.default.removeItem(at: cacheDirectory)
            }
            let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                .appendingPathComponent(testing ? "PokusUITests" : "Pokus", isDirectory: true)
            if testing { try? FileManager.default.removeItem(at: root) }
            store = try PokusStore(directory: root)
            if !testing && !UserDefaults.standard.bool(forKey: "pokus.timerOnlyHTTPUpgrade") {
                URLCache.shared.removeAllCachedResponses()
                UserDefaults.standard.set(true, forKey: "pokus.timerOnlyHTTPUpgrade")
            }
            let cleanupErrors = await store!.removeDownloadedCaches()
            if !cleanupErrors.isEmpty { error = cleanupErrors.joined(separator: "\n") }
            if !testing { authentication = try credentials.read() }
            else if ProcessInfo.processInfo.arguments.contains("-ui-testing-pokus") {
                let claims = Data(#"{"exp":4102444800}"#.utf8).base64EncodedString().replacingOccurrences(of: "=", with: "")
                authentication = Authentication(token: "test.\(claims).test", record: Account(id: "uitestaccount", name: "Test account"))
            }
            configureReadCache()
            await refreshReplicaStatus()
            dataRevision += 1
            try await loadAccount()
        } catch { self.error = error.localizedDescription; storageReady = false }
    }
    private func loadAccount() async throws {
        guard let owner = account?.id, let store else { clearFeatureState(); storageReady = true; return }
        let generation = epoch
        storageReady = false
        let saved = try await store.read(owner)
        guard generation == epoch else { return }
        focus.timer = saved.timer; storageReady = true
        await tick()
        await refresh(reloadData: false)
    }
    func signIn() async {
        guard !testing else { error = "Google sign-in is disabled in UI tests."; return }
        guard !isSigningIn, !isSaving else { return }
        isSigningIn = true; error = nil
        defer { isSigningIn = false }
        do {
            let api = makeClient("")
            let provider = try await api.googleProvider()
            let redirect = api.baseURL.appendingPathComponent("api/pokus/ios-oauth")
            guard let authURL = URL(string: provider.authURL + redirect.absoluteString.addingPercentEncoding(withAllowedCharacters: .alphanumerics)!) else { throw PokusError.message("Invalid Google sign-in URL.") }
            let callback = try await google.authenticate(url: authURL)
            let parts = URLComponents(url: callback, resolvingAgainstBaseURL: false)
            func parameter(_ name: String) -> String? { parts?.queryItems?.first { $0.name == name }?.value }
            guard callback.scheme == "pokus", callback.host == "oauth", parameter("state") == provider.state else { throw PokusError.message("Google sign-in couldn't be verified. Please try again.") }
            guard let code = parameter("code"), !code.isEmpty else { throw PokusError.message("Google sign-in was cancelled or denied.") }
            let auth = try await api.exchange(provider: provider, code: code, redirect: redirect)
            try await activate(auth)
        } catch { self.error = error.localizedDescription }
    }

    func activate(_ auth: Authentication) async throws {
        try credentials.save(auth)
        let generation = epoch
        await readCache.deactivate()
        await replica?.flush()
        guard epoch == generation else { throw CancellationError() }
        invalidateAccount(); authentication = auth; configureReadCache(); clearFeatureState(); selectedTaskID = ""
        isLoading = false; isSyncing = false; isSyncingData = false
        dataFailures = 0; dataRetryAt = .distantPast; dataSyncError = nil
        await refreshReplicaStatus()
        lastSurfaceSession = nil; await surfaces.clear()
        failedAttempts = 0; retryAt = .distantPast; syncError = nil
        try await loadAccount()
    }
    func signOut() async {
        guard !isSaving, !isSigningIn else { return }
        do { if !testing { try credentials.clear() } } catch { self.error = error.localizedDescription; return }
        let previous = readCache, previousReplica = replica
        invalidateAccount(); authentication = nil; configureReadCache(); clearFeatureState(); selectedTaskID = ""
        let generation = epoch
        isLoading = false; isSyncing = false; isSyncingData = false; error = nil; syncError = nil; dataSyncError = nil; storageReady = true
        await previous.deactivate()
        await previous.invalidate()
        // Downloaded records leave the device; changes that haven't synced stay for the next sign-in.
        await previousReplica?.removeDownloadedData()
        guard epoch == generation else { return }
        lastSurfaceSession = nil; await surfaces.clear()
    }
    func refreshIfNeeded(now: Date = .now) async {
        if authentication?.isValid == true, let lastRefreshAt,
           now.timeIntervalSince(lastRefreshAt) < 60 { return }
        await refresh(reloadData: lastRefreshAt != nil, manual: false)
    }
    /// Pull to refresh: send everything waiting now, then download changes and deletions.
    func refresh(reloadData: Bool = true, manual: Bool = true) async {
        refreshReloadRequested = refreshReloadRequested || reloadData
        refreshManualRequested = refreshManualRequested || manual
        if let refreshTask { await refreshTask.value; return }
        guard let owner = account?.id, let store, storageReady, isOnline else { return }
        let generation = epoch
        let task = Task { await performRefresh(owner: owner, store: store, generation: generation) }
        refreshTask = task
        await task.value
        if epoch == generation { refreshTask = nil }
    }
    private func performRefresh(owner: String, store: PokusStore, generation: UUID) async {
        isLoading = true
        defer { if epoch == generation { isLoading = false } }
        let needsAuthenticationReload = authentication?.isValid != true
        do {
            let refreshed = try await client.refreshAuthentication()
            guard epoch == generation, !Task.isCancelled else { return }
            if !testing { try credentials.save(refreshed) }; authentication = refreshed
        } catch let failure as APIError where failure.status == 401 || failure.status == 403 {
            if epoch == generation, !Task.isCancelled { self.error = failure.localizedDescription }
            return
        } catch {
            // A slow or failing refresh endpoint doesn't block syncing with the saved, still valid token.
            guard epoch == generation, !Task.isCancelled, authentication?.isValid == true else {
                if epoch == generation, !Task.isCancelled { self.error = error.localizedDescription }
                return
            }
        }
        if refreshReloadRequested || needsAuthenticationReload {
            refreshReloadRequested = false
            await refreshReadCache()
        }
        guard epoch == generation, !Task.isCancelled else { return }
        do {
            let api = client
            if focus.timer.current == nil && focus.timer.operations.isEmpty {
                if let remote = try await api.latestSession() {
                    guard epoch == generation else { return }
                    adoptTimer(try await store.restore(owner, session: remote), generation: generation)
                }
            }
            if epoch == generation {
                lastRefreshAt = .now
                if refreshReloadRequested { refreshReloadRequested = false; await refreshReadCache() }
                let manual = refreshManualRequested
                refreshManualRequested = false
                await tick(); await sync(force: manual)
                await syncData(force: manual, reconcile: manual)
            }
        } catch { if epoch == generation, !Task.isCancelled { self.error = error.localizedDescription } }
    }
    func refreshHabits() async {
        guard !isSaving else { return }
        await refreshReadCache()
    }
    func writeHabits(_ operation: (PocketBaseClient, String) async throws -> [HabitMutation]) async throws {
        guard canEdit, let owner = account?.id else { throw PokusError.message("Connect and sign in to edit habits.") }
        let generation = epoch; isSaving = true
        defer { if epoch == generation { isSaving = false } }
        do {
            let mutations = try await operation(writeAPI, owner)
            guard epoch == generation else { throw PokusError.message("Your account changed. Open Habits again.") }
            habitsState.apply(mutations)
            await invalidateReads(collections: ["habits", "habit_entries", "habit_targets"])
            scheduleDataSync()
        } catch { if epoch == generation { isSaving = false }; throw error }
    }
    private func preview(_ url: URL, scope: AccountScope) async -> LinkPreview? {
        guard self.scope == scope else { return nil }
        let id = UUID(), api = client
        let task = PreviewOperation()
        previewTasks[id] = task
        defer { previewTasks[id] = nil }
        return await task.value(client: api, url: url, budget: previewBudget)
    }
    func start(minutes: Int) async {
        guard account != nil, session == nil || session?.mode == .complete else { return }
        await transition(FocusSession(task: selectedTaskID, durationMinutes: minutes, now: .now))
    }
    func taskTitle(_ id: String) async -> String? {
        if let task = workspace.tasks.first(where: { $0.id == id }) { return task.title }
        let task: FocusTask? = try? await readAPI().record("tasks", id: id)
        return task?.title
    }
    /// Lets intents launched in the background wait for the saved timer to load.
    func waitUntilReady() async {
        for _ in 0..<50 where !storageReady { try? await Task.sleep(for: .milliseconds(100)) }
    }
    /// Whether a session is counting down or paused; its linked task can't change until it ends.
    var hasRunningSession: Bool { session?.mode == .running }
    /// Links the next session to a task and opens the timer. A running session keeps its task,
    /// so this only opens the timer then and returns false.
    @discardableResult func focus(on taskID: String) -> Bool {
        guard !hasRunningSession else { openTimer?(); return false }
        selectedTaskID = taskID
        if session?.mode == .complete { Task { await reset() } }
        openTimer?()
        return true
    }
    func toggle() async { if let session { await transition(engine.toggle(session)) } }
    func stop(save: Bool) async { if let session { await transition(engine.finish(session, save: save)) } }
    func reset() async { if session?.mode != .running { await transition(nil) } }
    func tick(forceSurfaces: Bool = false) async {
        guard let session, storageReady else { return }
        if session.mode == .running && session.isActive && session.remaining(at: .now) == 0 {
            await transition(engine.finish(session, save: true))
        } else if forceSurfaces || lastSurfaceSession != session {
            lastSurfaceSession = session
            await surfaces.update(session)
        }
    }
    private func transition(_ next: FocusSession?) async {
        guard !focus.isSaving, storageReady, let owner = account?.id, let store else { return }
        focus.isSaving = true; let generation = epoch
        do {
            let saved = try await store.transition(owner, session: next)
            guard epoch == generation else { return }
            adoptTimer(saved, generation: generation); error = nil
            focus.isSaving = false
            lastSurfaceSession = session
            await surfaces.update(session)
        } catch { if epoch == generation { focus.isSaving = false; self.error = "Your timer couldn't be saved. \(error.localizedDescription)" } }
        Task { await sync() }
    }
    private func adoptTimer(_ saved: AccountSnapshot, generation: UUID) {
        guard epoch == generation else { return }
        if saved.timer.revision >= focus.timer.revision { focus.timer = saved.timer }
    }
    func sync(force: Bool = false) async {
        guard !testing, !isSyncing, storageReady, isOnline, let owner = account?.id, let store else { return }
        guard pendingCount > 0 else { return }
        guard force || Date() >= retryAt else { return }
        guard authentication?.isValid == true else {
            if pendingCount > 0 { syncError = "Sign in again to sync your saved sessions." }; return
        }
        let generation = epoch; let api = client; isSyncing = true
        defer { if epoch == generation { isSyncing = false } }
        var completed = false
        do {
            while epoch == generation && isOnline {
                let saved = try await store.read(owner)
                guard epoch == generation else { return }
                guard let operation = saved.timer.operations.first else { break }
                let authoritative = try await api.send(operation, owner: owner)
                guard epoch == generation else { return }
                if authoritative.mode == .complete {
                    workspaceVersion += 1
                    let version = workspaceVersion
                    if !authoritative.task.isEmpty {
                        do {
                            let task: FocusTask? = try await api.record("tasks", id: authoritative.task)
                            guard epoch == generation else { return }
                            if version == workspaceVersion, let task { workspaceState.value.tasks.upsert(task) }
                        } catch {
                            guard epoch == generation else { return }
                            self.error = "Your session synced, but the task total couldn't refresh. Pull to refresh to try again."
                        }
                    }
                }
                guard epoch == generation else { return }
                let acknowledged = try await store.acknowledge(owner, operation: operation, authoritative: authoritative)
                guard epoch == generation else { return }
                adoptTimer(acknowledged, generation: generation)
                if authoritative.mode == .complete {
                    completed = true
                    await replica?.recordCompletedSession(authoritative)
                    await invalidateReads(collections: ["tasks", "pomodoro_sessions"])
                }
                lastSurfaceSession = session
                await surfaces.update(session)
            }
            guard epoch == generation else { return }
            syncError = nil; failedAttempts = 0; retryAt = .distantPast
            // Task focus totals changed on the server; bring them into the device copy.
            if completed { scheduleDataSync(pull: true) }
        } catch {
            if epoch == generation {
                failedAttempts += 1
                retryAt = Date().addingTimeInterval(min(300, 15 * pow(2, Double(min(failedAttempts, 5)))))
                syncError = error.localizedDescription
            }
        }
    }
    func write(collection: WorkspaceCollection, id: String? = nil, creationID: String? = nil,
               fields: [String: JSONValue], delete: Bool = false) async -> Bool {
        if collection == .captures, let id, let scope {
            let previous = captureWrites[id]?.1, token = UUID()
            let operation = Task {
                if let previous { _ = await previous.value }
                guard self.scope == scope else { return false }
                return await self.performWrite(collection: collection, id: id, creationID: creationID, fields: fields, delete: delete)
            }
            captureWrites[id] = (token, operation)
            let result = await operation.value
            if captureWrites[id]?.0 == token { captureWrites[id] = nil }
            return result
        }
        return await performWrite(collection: collection, id: id, creationID: creationID, fields: fields, delete: delete)
    }

    private func performWrite(collection: WorkspaceCollection, id: String?, creationID: String?,
                              fields: [String: JSONValue], delete: Bool) async -> Bool {
        guard canEdit, let owner = account?.id else { error = "Connect and sign in to edit projects and tasks."; return false }
        isSaving = true; let generation = epoch
        workspaceVersion += 1
        defer { if epoch == generation { isSaving = false } }
        do {
            let api = writeAPI
            if delete {
                guard let id else { throw PokusError.message("This item couldn't be identified.") }
                do { try await api.delete(collection.rawValue, id: id) }
                catch let failure as APIError where failure.status == 404 { }
                guard epoch == generation else { return false }
                remove(collection, id: id)
            }
            else {
                let record = try await api.save(collection, id: id, creationID: creationID, fields: fields, owner: owner)
                guard epoch == generation else { return false }
                workspaceState.apply(record); libraryState.apply(record)
            }
            workspaceVersion += 1
            error = nil
            if collection == .captures, let id, delete || fields["reminderAt"] != nil || fields["reminderDone"] != nil {
                await cancelCaptureReminderAlerts?(owner, id)
                guard epoch == generation else { return false }
            }
            await invalidateReads(collections: affectedCollections(collection))
            scheduleDataSync()
            return epoch == generation
        } catch { if epoch == generation { self.error = error.localizedDescription }; return false }
    }

    func saveCapture(fields: [String: JSONValue], original: Capture? = nil, creationID: String,
                     projectID: String?) async -> Bool {
        guard canEdit, let scope else { error = "Connect and sign in to save captures."; return false }
        var fields = fields
        if case .string(let link) = fields["url"], link != (original?.url ?? "") {
            fields["preview"] = .null
            if let url = LibraryRules.safeURL(link), let preview = await preview(url, scope: scope),
               let data = try? JSONEncoder().encode(preview), let value = try? JSONDecoder().decode(JSONValue.self, from: data) {
                fields["preview"] = value
            }
        }
        guard self.scope == scope, !Task.isCancelled else { return false }
        if let original { return await write(collection: .captures, id: original.id, fields: fields) }
        guard canEdit else { error = "Another change is saving. Try again."; return false }
        isSaving = true
        workspaceVersion += 1
        defer { if self.scope == scope { isSaving = false } }
        do {
            let capture = try await writeAPI.createCapture(id: creationID, fields: fields, projectID: projectID, owner: scope.owner)
            guard self.scope == scope else { return false }
            libraryState.apply(.capture(capture))
            if let projectID, let index = workspaceState.value.projects.firstIndex(where: { $0.id == projectID }) {
                var links = workspaceState.value.projects[index].captures ?? []
                if !links.contains(capture.id) { links.append(capture.id) }
                workspaceState.value.projects[index].captures = links
            }
            workspaceVersion += 1
            error = nil
            await invalidateReads(collections: affectedCollections(.captures))
            scheduleDataSync()
            return self.scope == scope
        } catch { if self.scope == scope { self.error = error.localizedDescription }; return false }
    }

    // MARK: Offline records

    /// Sends queued edits, then downloads changes. Runs one pass at a time; a request made
    /// during a pass runs another pass right after.
    func syncData(force: Bool = false, reconcile: Bool = false, pull: Bool = true) async {
        guard let replica, storageReady, isOnline, authentication?.isValid == true else {
            if replica != nil, authentication?.isValid != true, replicaStatus.pendingChanges > 0 {
                dataSyncError = "Sign in again to sync your changes. They're saved on this iPhone."
            }
            return
        }
        guard force || Date() >= dataRetryAt else { return }
        if isSyncingData { dataSyncAgain = true; return }
        let generation = epoch, api = client
        isSyncingData = true
        defer { if epoch == generation { isSyncingData = false } }
        repeat {
            dataSyncAgain = false
            do {
                let wasReady = replicaStatus.ready
                let pushed = try await replica.push(api)
                guard epoch == generation else { return }
                let pulled = pull || !replicaStatus.ready ? try await replica.pull(api, reconcile: reconcile) : false
                guard epoch == generation else { return }
                dataFailures = 0; dataRetryAt = .distantPast; dataSyncError = nil
                dataRetryTask?.cancel(); dataRetryTask = nil
                await refreshReplicaStatus()
                // The first full download replaces the older saved-response copies.
                if !wasReady && replicaStatus.ready { await readCache.invalidate() }
                if pushed || pulled || !wasReady { dataRevision += 1 }
            } catch {
                guard epoch == generation else { return }
                dataFailures += 1
                dataRetryAt = Date().addingTimeInterval(min(300, 15 * pow(2, Double(min(dataFailures, 5)))))
                dataSyncError = (error as? APIError)?.status == 401
                    ? "Sign in again to sync your changes. They're saved on this iPhone."
                    : "Couldn't sync right now. Your changes are saved on this iPhone and will sync when connected."
                if (error as? APIError)?.status != 401 { scheduleDataRetry() }
                await refreshReplicaStatus()
                return
            }
        } while dataSyncAgain && epoch == generation && isOnline
    }
    /// Retries on its own once the backoff passes, so a brief server or network failure heals without a manual refresh.
    private func scheduleDataRetry() {
        dataRetryTask?.cancel()
        let delay = max(1, dataRetryAt.timeIntervalSinceNow)
        dataRetryTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            await self?.syncData()
        }
    }
    /// After an edit only the queue is sent; downloads happen on refresh, reconnect, and foreground.
    private func scheduleDataSync(pull: Bool = false) {
        guard replica != nil else { return }
        Task { await syncData(pull: pull) }
    }
    private func refreshReplicaStatus() async {
        guard let replica else { replicaStatus = ReplicaStatus(); return }
        let generation = epoch
        let status = await replica.status()
        guard epoch == generation else { return }
        replicaStatus = status
        if let notice = status.notice {
            error = notice
            await replica.clearNotice()
        }
    }
    /// Lifetime focus from the device's running total, or a server scan before the first download.
    func focusTotal(pending: [FocusSession]) async throws -> Int {
        if let replica, replicaStatus.ready, let total = await replica.focusTotal(pending: pending) { return total }
        return try await readAPI().focusedTotal(pending: pending)
    }
    func habitStatistics(through day: DayKey, habit: String?) async throws -> HabitStatistics {
        if let replica, replicaStatus.ready, let value = await replica.habitStatistics(through: day, habit: habit) { return value }
        return try await readAPI().habitStatistics(through: day, habit: habit)
    }
    func retryFailedChanges() async {
        await replica?.retryFailed()
        await refreshReplicaStatus()
        await syncData(force: true)
    }
    func discardChange(_ id: String) async {
        await replica?.discard(id)
        await refreshReplicaStatus()
        dataRevision += 1
    }
    func freeUpSpace() async {
        await replica?.freeUpSpace()
        await readCache.invalidate()
        await refreshReplicaStatus()
        dataRevision += 1
    }
    /// Downloads everything again; unsynced changes are sent first and never discarded.
    func redownload() async {
        await replica?.prepareRedownload()
        await syncData(force: true, reconcile: true)
    }
    func flushStorage() async {
        await readCache.flush()
        await replica?.flush()
    }
    /// Background refresh: renew sign-in, send queued work, and download changes.
    func backgroundSync() async {
        for _ in 0..<50 where !storageReady { try? await Task.sleep(for: .milliseconds(100)) }
        guard account != nil, !Task.isCancelled else { return }
        await refresh(reloadData: false, manual: false)
        await syncData(force: true)
        await flushStorage()
    }

    private func remove(_ collection: WorkspaceCollection, id: String) {
        switch collection {
        case .projects:
            workspaceState.value.projects.removeAll { $0.id == id }
            for index in workspaceState.value.tasks.indices where workspaceState.value.tasks[index].project == id { workspaceState.value.tasks[index].project = "" }
            for index in libraryState.value.knowledge.indices {
                if libraryState.value.knowledge[index].project == id { libraryState.value.knowledge[index].project = "" }
                libraryState.value.knowledge[index].linkedProjects.removeAll { $0 == id }
            }
        case .tasks: workspaceState.value.tasks.removeAll { $0.id == id }
        case .categories:
            workspaceState.value.categories.removeAll { $0.id == id }
            for index in workspaceState.value.tasks.indices where workspaceState.value.tasks[index].category == id { workspaceState.value.tasks[index].category = "" }
            for index in libraryState.value.knowledge.indices where libraryState.value.knowledge[index].category == id { libraryState.value.knowledge[index].category = "" }
        case .captures:
            libraryState.value.captures.removeAll { $0.id == id }
            for index in workspaceState.value.projects.indices { workspaceState.value.projects[index].captures?.removeAll { $0 == id } }
            for index in libraryState.value.knowledge.indices { libraryState.value.knowledge[index].sources.removeAll { $0 == id } }
        case .knowledge: libraryState.value.knowledge.removeAll { $0.id == id }
        }
    }

    private func invalidateAccount() {
        epoch = UUID()
        cachePublishTask?.cancel(); cachePublishTask = nil
        lastRefreshAt = nil; refreshReloadRequested = false
        refreshTask?.cancel(); refreshTask = nil
        for task in previewTasks.values { task.cancel() }
        previewTasks.removeAll()
    }

    private func configureReadCache() {
        cacheSession = UUID()
        cachePublishTask?.cancel(); cachePublishTask = nil
        let session = cacheSession, generation = epoch
        let owner = account?.id
        let safeOwner = owner.flatMap { value in
            !value.isEmpty && value.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }) ? value : nil
        }
        readCache = APIReadCache(directory: safeOwner.flatMap { cacheDirectory?.appendingPathComponent($0, isDirectory: true) },
            accountID: owner, staleWhileRevalidate: true, persistDelay: batchesCacheWrites ? .seconds(1) : .zero, onUpdate: { [weak self] in
                Task { @MainActor in self?.publishCachedUpdate(session: session, generation: generation) }
            })
        replica = safeOwner.flatMap { owner in
            replicaDirectory.map { RecordReplica(directory: $0.appendingPathComponent(owner, isDirectory: true), owner: owner) }
        }
        replicaStatus = ReplicaStatus()
    }
    private func publishCachedUpdate(session: UUID, generation: UUID) {
        guard session == cacheSession, generation == epoch else { return }
        cachePublishTask?.cancel()
        cachePublishTask = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(150)) } catch { return }
            guard let self, session == cacheSession, generation == epoch else { return }
            dataRevision += 1
            cachePublishTask = nil
        }
    }
    private func refreshReadCache() async {
        let generation = epoch
        await readCache.markStale()
        if generation == epoch { dataRevision += 1 }
    }
    private func invalidateReads(collections: Set<String>) async {
        let generation = epoch
        await readCache.markForRevalidation(collections: collections)
        await refreshReplicaStatus()
        if generation == epoch { dataRevision += 1 }
    }
    private func affectedCollections(_ collection: WorkspaceCollection) -> Set<String> {
        switch collection {
        case .projects: ["projects", "tasks", "captures", "knowledge"]
        case .tasks: ["tasks"]
        case .categories: ["categories", "tasks", "knowledge"]
        case .captures: ["captures", "projects", "knowledge"]
        case .knowledge: ["knowledge", "captures"]
        }
    }

    private func clearFeatureState() {
        focus.timer = TimerSnapshot(); focus.isSaving = false
        workspaceState.value = Workspace(); libraryState.value = LibraryWorkspace()
        habitsState.replace(HabitWorkspace(), histories: [])
    }

}
