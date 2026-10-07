import Combine
import DailyCore
import DailyPersistence
import SwiftUI

struct RootView: View {
    let store: HabitStore?
    let pokus: PokusModel
    let habitError: String?
    let retryHabits: () -> Void
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var typeSize
    @AppStorage("pokus.appearance") private var appearance = "system"
    @State private var today = DayKey()
    @State private var selectedTab = 0
    @State private var captureReturnTab = 0
    @State private var captureDraftID = UUID()
    @State private var captureConfirmation = false
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
        TabView(selection: $selectedTab) {
            NavigationStack { PokusTimerView(model: pokus, isVisible: selectedTab == 0) }
                .tabItem { Label("Pocus", systemImage: "timer") }.tag(0)
            NavigationStack {
                PokusCalendarView(model: pokus, today: today, showsMonth: false, openHabits: openHabits, selectedCapture: $selectedCapture)
            }.id(pokus.scope?.generation).tabItem { Label("Today", systemImage: "sun.max") }.tag(2)
            Group {
                if pokus.account != nil {
                    CaptureEditorView(model: pokus, onClose: {
                        if selectedTab == 1 { selectedTab = captureReturnTab }
                        captureDraftID = UUID()
                    }, onSaved: { _ in captureConfirmation = true }).id("\(captureDraftID)-\(pokus.account?.id ?? "signedout")")
                } else {
                    NavigationStack { AccountNotice(model: pokus).navigationTitle("New capture") }
                }
            }.tabItem { Label("Capture", systemImage: "plus.circle.fill") }.tag(1)
            NavigationStack(path: $libraryPath) { PokusLibraryView(model: pokus, habitStore: habitStore, today: today, habitsProgress: $habitsProgress) }
                .id("\(habitNavigationID)-\(pokus.scope?.generation.uuidString ?? "signedout")")
                .tabItem { Label("Library", systemImage: "books.vertical") }.tag(4)
            NavigationStack { PokusProfileView(model: pokus, reminders: reminders) }
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }.tag(3)
        }
        .onChange(of: selectedTab) { previous, current in
            if current == 1 { captureReturnTab = previous }
        }
        .preferredColorScheme(appearance == "light" ? .light : appearance == "dark" ? .dark : nil)
        .safeAreaInset(edge: .top) {
            if captureConfirmation {
                HStack {
                    Label("Capture saved", systemImage: "checkmark.circle")
                    Spacer()
                    Button("Dismiss", systemImage: "xmark") { captureConfirmation = false }.labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
                }.font(.subheadline).padding(.horizontal).background(.regularMaterial)
                    .accessibilityIdentifier("captureSavedNotice")
            }
        }
        .onChange(of: selectedTab) { _, current in if current == 1 { captureConfirmation = false } }
        .transformEnvironment(\.dynamicTypeSize) { size in
            if ProcessInfo.processInfo.arguments.contains("-ui-testing-accessibility") { size = .accessibility5 }
        }
        .safeAreaInset(edge: .top) {
            if let error = pokus.error {
                let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4)) : AnyLayout(HStackLayout(spacing: 12))
                layout {
                    Text(error).font(.footnote).lineLimit(3).accessibilityLabel(error)
                    HStack {
                        Button(pokus.storageReady ? "Refresh" : "Reload saved data") { Task { if !pokus.storageReady { await pokus.load() } else { await pokus.refresh() } } }
                            .frame(minHeight: 44).disabled(pokus.isLoading)
                        Button("Dismiss", systemImage: "xmark") { pokus.error = nil }
                            .labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
                    }
                }.padding(12).background(.regularMaterial)
            }
        }
        .onChange(of: pokus.account?.id) { _, owner in
            captureConfirmation = false
            selectedCapture = nil; libraryPath = []
            routeNotification()
            Task { await reminders.setAccountAvailable(owner != nil || localPreview) }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in timeRevision += 1; refreshDate(); Task { await pokus.tick(forceSurfaces: true) } }
        .onReceive(NotificationCenter.default.publisher(for: .NSSystemTimeZoneDidChange)) { _ in timeRevision += 1; refreshDate() }
        .onReceive(NotificationCenter.default.publisher(for: .openDailyToday)) { _ in routeNotification() }
        .onReceive(NotificationCenter.default.publisher(for: .openPokusTimer)) { _ in routeNotification(); Task { await pokus.tick() } }
        .onReceive(NotificationCenter.default.publisher(for: .openPokusCalendar)) { _ in routeNotification() }
        .onOpenURL { url in if url.scheme == "pokus", url.host == "timer" { selectedTab = 0; Task { await pokus.tick() } } }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background {
                BackgroundRefresh.schedule()
                Task { await pokus.flushStorage() }
            }
            if phase == .active {
                refreshDate()
                Task { await reminders.refreshAuthorization(); await pokus.tick(forceSurfaces: true); await pokus.refreshIfNeeded(); await captureReminders.refresh(model: pokus) }
            }
        }
        .task {
            routeNotification()
            pokus.openTimer = { selectedTab = 0 }
            pokus.requestCaptureReminderAlerts = { await captureReminders.refresh(model: pokus, requestPermission: true) }
            pokus.refreshCaptureReminderAlerts = { await captureReminders.refresh(model: pokus) }
            pokus.cancelCaptureReminderAlerts = { owner, captureID in await captureReminders.cancel(owner: owner, captureID: captureID) }
            await reminders.setAccountAvailable(pokus.account != nil || localPreview)
            await reminders.refreshAuthorization()
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
    private func openHabits() { selectedTab = 4; habitsProgress = false; libraryPath = [.habits] }
    private func refreshDate() {
        let newDay = DayKey()
        if today != newDay { today = newDay }
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
