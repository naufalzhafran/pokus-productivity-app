import Combine
import DailyCore
import DailyPersistence
import PokusCore
import SwiftUI

struct RootView: View {
    let store: HabitStore?
    let pokus: PokusModel
    let habitError: String?
    let retryHabits: () -> Void
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("pokus.appearance") private var appearance = "system"
    @AppStorage("pokus.duration") private var duration = 25
    @State private var today = DayKey()
    @State private var selectedTab = 0
    @State private var creating: Creation?
    @State private var savedNotice: String?
    @State private var habitsProgress = false
    @State private var habitNavigationID = UUID()
    @State private var libraryPath: [LibraryRoute] = []
    @State private var selectedCapture: String?
    @State private var captureReminders = CaptureReminderScheduler()
    @State private var reminders = ReminderManager()
    @State private var timeRevision = 0
    private var maintenanceID: String {
        "\(scenePhase)-\(pokus.scope?.generation.uuidString ?? "")-\(pokus.session?.deadline.timeIntervalSince1970 ?? 0)-\(pokus.session?.isActive ?? false)-\(pokus.pendingCount)-\(pokus.replicaStatus.pendingChanges)-\(timeRevision)"
    }
    private var localPreview: Bool {
        let args = ProcessInfo.processInfo.arguments
        return args.contains("-preview-data") || (args.contains("-ui-testing") && args.contains("-ui-testing-local-habits"))
    }

    var body: some View {
        VStack(spacing: 0) {
            if let error = pokus.error {
                AppErrorNotice(message: error, recoveryTitle: errorRecoveryTitle,
                    recoveryDisabled: pokus.isLoading || pokus.isSaving || pokus.isSigningIn || (pokus.storageReady && !pokus.isOnline),
                    recover: { Task { await recoverFromError() } },
                    dismiss: { pokus.error = nil })
            }
            if let savedNotice {
                HStack {
                    Label(savedNotice, systemImage: "checkmark.circle")
                    Spacer()
                    Button { self.savedNotice = nil } label: {
                        Label("Dismiss", systemImage: "xmark").labelStyle(.iconOnly)
                            .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                    }.accessibilityIdentifier("dismissCaptureSaved")
                }.font(.subheadline).padding(.horizontal).background(.regularMaterial)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("captureSavedNotice")
            }
            TabView(selection: $selectedTab) {
                NavigationStack { PokusTimerView(model: pokus, isVisible: selectedTab == 0, newCapture: newCapture) }
                    .tabItem { Label("Focus", systemImage: "timer") }.tag(0)
                NavigationStack {
                    PokusCalendarView(model: pokus, today: today, showsMonth: false, openHabits: openHabits, selectedCapture: $selectedCapture,
                                      newCapture: newCapture, newTask: newTask, openTimer: { selectedTab = 0 },
                                      startFocus: { pokus.request = .startFocus })
                }.id(pokus.scope?.generation).tabItem { Label("Today", systemImage: "sun.max") }.tag(2)
                NavigationStack(path: $libraryPath) { PokusLibraryView(model: pokus, habitStore: habitStore, today: today, habitsProgress: $habitsProgress) }
                    .id("\(habitNavigationID)-\(pokus.scope?.generation.uuidString ?? "signedout")")
                    .tabItem { Label("Library", systemImage: "books.vertical") }.tag(4)
                NavigationStack { PokusProfileView(model: pokus, reminders: reminders) }
                    .tabItem { Label("Profile", systemImage: "person.crop.circle") }.tag(3)
            }
        }
        .sheet(item: $creating) { creation in
            switch creation {
            case .capture:
                CaptureEditorView(model: pokus, onSaved: { _ in savedNotice = "Capture saved" })
            case .task:
                // Today's New task is dated today so it stays on Today; the date can still be cleared.
                TaskEditorView(model: pokus, original: nil, projectID: "", initialDueDate: .now, onSaved: { _ in savedNotice = "Task saved" })
            }
        }
        .preferredColorScheme(appearance == "light" ? .light : appearance == "dark" ? .dark : nil)
        .onChange(of: creating) { _, next in if next != nil { savedNotice = nil } }
        .task(id: savedNotice) {
            // The saved notice clears itself; VoiceOver users keep it until they dismiss it.
            guard savedNotice != nil, !UIAccessibility.isVoiceOverRunning else { return }
            do { try await Task.sleep(for: .seconds(4)) } catch { return }
            withAnimation { savedNotice = nil }
        }
        .transformEnvironment(\.dynamicTypeSize) { size in
            if ProcessInfo.processInfo.arguments.contains("-ui-testing-accessibility") { size = .accessibility5 }
        }
        .onChange(of: pokus.account?.id) { _, owner in
            savedNotice = nil; creating = nil
            selectedCapture = nil; libraryPath = []
            routeNotification()
            Task { await reminders.setAccountAvailable(owner != nil || localPreview) }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in timeRevision += 1; refreshDate(); Task { await pokus.tick(forceSurfaces: true) } }
        .onReceive(NotificationCenter.default.publisher(for: .NSSystemTimeZoneDidChange)) { _ in timeRevision += 1; refreshDate() }
        .onReceive(NotificationCenter.default.publisher(for: .openDailyToday)) { _ in routeNotification() }
        .onReceive(NotificationCenter.default.publisher(for: .openPokusTimer)) { _ in routeNotification(); Task { await pokus.tick() } }
        .onReceive(NotificationCenter.default.publisher(for: .openPokusCalendar)) { _ in routeNotification() }
        .onOpenURL { url in
            guard url.scheme == "pokus" else { return }
            switch url.host {
            case "timer": pokus.request = .timer
            case "start": pokus.request = .startFocus
            case "capture": pokus.request = .newCapture
            default: break
            }
        }
        .onChange(of: pokus.request) { _, _ in Task { await handleRequest() } }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background {
                BackgroundRefresh.schedule()
                Task { await pokus.flushStorage() }
            }
            if phase == .active {
                refreshDate()
                Task { await reminders.refreshAuthorization(); await pokus.tick(forceSurfaces: true); await importSharedCaptures(); await pokus.refreshIfNeeded(); await captureReminders.refresh(model: pokus); await refreshHabitReminder() }
            }
        }
        .task {
            routeNotification()
            await handleRequest()
            pokus.openTimer = { selectedTab = 0 }
            pokus.requestCaptureReminderAlerts = { await captureReminders.refresh(model: pokus, requestPermission: true) }
            pokus.refreshCaptureReminderAlerts = { await captureReminders.refresh(model: pokus) }
            pokus.cancelCaptureReminderAlerts = { owner, captureID in await captureReminders.cancel(owner: owner, captureID: captureID) }
            pokus.habitsDidChange = { await refreshHabitReminder() }
            await reminders.setAccountAvailable(pokus.account != nil || localPreview)
            await reminders.refreshAuthorization()
            await refreshHabitReminder()
        }
        .task(id: "\(pokus.account?.id ?? "")-\(pokus.storageReady)-\(pokus.replicaStatus.ready)") {
            await importSharedCaptures()
        }
        .task(id: "\(pokus.queryIdentity)-\(pokus.isOnline)-\(pokus.storageReady)-\(timeRevision)") {
            await captureReminders.refresh(model: pokus)
        }
        .task(id: maintenanceID) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                refreshDate()
                await pokus.tick()
                let now = Date()
                let midnight = Calendar.autoupdatingCurrent.nextDate(after: now, matching: DateComponents(hour: 0), matchingPolicy: .nextTime) ?? now.addingTimeInterval(3600)
                var delay = midnight.timeIntervalSince(now)
                if let session = pokus.session, session.mode == .running, session.isActive { delay = min(delay, max(1, session.deadline.timeIntervalSince(now))) }
                if pokus.pendingCount > 0 || pokus.replicaStatus.pendingChanges > 0 { delay = min(delay, 30) }
                do { try await Task.sleep(for: .seconds(max(1, delay))) } catch { return }
                await pokus.sync()
                await pokus.syncData()
            }
        }
    }
    private var habitStore: (any HabitViewStore)? {
        if localPreview, let store { return LocalHabitViewStore(store: store) }
        if let owner = pokus.account?.id { return AccountHabitViewStore(model: pokus, owner: owner) }
        return nil
    }
    private var errorRecoveryTitle: String {
        if !pokus.storageReady { return "Reload saved data" }
        if pokus.account == nil || pokus.authentication?.isValid == false { return "Sign in again" }
        return "Refresh"
    }
    private func recoverFromError() async {
        if !pokus.storageReady { await pokus.load() }
        else if pokus.account == nil || pokus.authentication?.isValid == false { await pokus.signIn() }
        else { await pokus.refresh() }
    }
    private enum Creation: String, Identifiable { case capture, task; var id: String { rawValue } }
    private var newCapture: (() -> Void)? { pokus.account == nil ? nil : { creating = .capture } }
    private var newTask: (() -> Void)? { pokus.account == nil ? nil : { creating = .task } }
    private func openHabits() { selectedTab = 4; habitsProgress = false; libraryPath = [.habits] }
    private func refreshDate() {
        let newDay = DayKey()
        if today != newDay { today = newDay }
    }
    private func importSharedCaptures() async {
        guard scenePhase == .active else { return }
        // Items a background refresh already saved are announced now, too.
        let count = await pokus.importSharedCaptures() + pokus.backgroundSharedImports
        pokus.backgroundSharedImports = 0
        if count > 0 { savedNotice = count == 1 ? "Shared item saved to Captures" : "\(count) shared items saved to Captures" }
    }
    /// Skips today's habit reminder once every habit is checked in, and keeps the next week scheduled.
    private func refreshHabitReminder() async {
        guard reminders.enabled, let habitStore else { return }
        let day = DayKey()
        guard let index = try? await habitStore.dayIndex(day) else { return }
        await reminders.updateSchedule(allHabitsComplete: !index.ids.isEmpty && index.remaining.isEmpty, today: day)
    }
    /// Opens what an App Intent, widget, or link asked for.
    private func handleRequest() async {
        guard let request = pokus.request else { return }
        pokus.request = nil
        switch request {
        case .timer:
            creating = nil; selectedTab = 0
            await pokus.tick()
        case .startFocus:
            creating = nil; selectedTab = 0
            await pokus.waitUntilReady()
            if pokus.account != nil, !pokus.hasRunningSession {
                if pokus.session?.mode == .complete { await pokus.reset() }
                await pokus.start(minutes: duration)
            } else { await pokus.tick() }
        case .newCapture:
            if pokus.account != nil { creating = .capture } else { selectedTab = 0 }
        }
    }
    private func routeNotification() {
        guard let route = NotificationLaunchRoute.consume(owner: pokus.account?.id, localHabits: localPreview) else { return }
        switch route {
        case .timer: selectedTab = 0
        case .habits:
            habitNavigationID = UUID(); refreshDate(); openHabits()
        case .capture(_, let id, _):
            selectedCapture = id; selectedTab = 2
        }
    }
}

private struct AppErrorNotice: View {
    let message: String
    let recoveryTitle: String
    let recoveryDisabled: Bool
    let recover: () -> Void
    let dismiss: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var showingDetails = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(message).font(.footnote).lineLimit(3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel(message)
            let layout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 0))
                : AnyLayout(HStackLayout(spacing: 16))
            layout {
                Button(action: recover) {
                    Text(recoveryTitle).frame(minHeight: 44).contentShape(Rectangle())
                }
                    .disabled(recoveryDisabled)
                    .accessibilityIdentifier("recoverAppError")
                HStack {
                    Button { showingDetails = true } label: {
                        Text("Details").frame(minHeight: 44).contentShape(Rectangle())
                    }
                    Spacer()
                    Button(action: dismiss) {
                        Label("Dismiss", systemImage: "xmark")
                            .labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                }
            }
        }
        .padding(.horizontal, 16).padding(.top, 8)
        .background(.regularMaterial)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("appErrorNotice")
        .alert("Couldn't complete the action", isPresented: $showingDetails) {
            Button("OK", role: .cancel) { }
        } message: { Text(message) }
    }
}
