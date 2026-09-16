import Combine
import DailyCore
import DailyPersistence
import SwiftUI

struct RootView: View {
    let store: HabitStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var today = DayKey()
    @State private var selectedTab = 0
    @State private var navigationID = UUID()
    @State private var reminders = ReminderManager()
    private let clock = Timer.publish(every: 20, on: .main, in: .common).autoconnect()

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                TodayView(store: store, today: today)
            }
            .tabItem { Label("Today", systemImage: "checkmark.circle") }
            .tag(0)

            NavigationStack {
                ProgressViewScreen(store: store, today: today)
            }
            .tabItem { Label("Progress", systemImage: "chart.bar.xaxis") }
            .tag(1)

            NavigationStack {
                SettingsView(reminders: reminders)
            }
            .tabItem { Label("Settings", systemImage: "slider.horizontal.3") }
            .tag(2)
        }
        .id(navigationID)
        .onReceive(clock) { _ in refreshDate() }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in refreshDate() }
        .onReceive(NotificationCenter.default.publisher(for: .NSSystemTimeZoneDidChange)) { _ in refreshDate() }
        .onReceive(NotificationCenter.default.publisher(for: .openDailyToday)) { _ in
            navigationID = UUID()
            selectedTab = 0
            refreshDate()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                refreshDate()
                Task { await reminders.refreshAuthorization() }
            }
        }
        .task { await reminders.refreshAuthorization() }
    }

    private func refreshDate() {
        let newDay = DayKey()
        if today != newDay { today = newDay }
    }
}
