import DailyCore
import DailyPersistence
import SwiftUI
import UserNotifications

@main
struct DailyApp: App {
    @UIApplicationDelegateAdaptor(NotificationDelegate.self) private var appDelegate
    @State private var bootstrap = AppBootstrap()

    var body: some Scene {
        WindowGroup {
            RootView(store: bootstrap.store, pokus: bootstrap.pokus, habitError: bootstrap.errorMessage, retryHabits: bootstrap.load)
                .defaultAppStorage(ProcessInfo.processInfo.arguments.contains("-ui-testing") ? UserDefaults(suiteName: "DailyUITests")! : .standard)
        }
    }
}

@MainActor
@Observable
final class AppBootstrap {
    var store: HabitStore?
    var errorMessage: String?
    /// App-level so a background refresh can sync without any window.
    let pokus = PokusModel()

    init() {
        BackgroundRefresh.model = pokus
        load()
    }

    func load() {
        do {
            let arguments = ProcessInfo.processInfo.arguments
            guard arguments.contains("-preview-data") || (arguments.contains("-ui-testing") && arguments.contains("-ui-testing-local-habits")) else {
                store = nil; errorMessage = nil; return
            }
            let inMemory = arguments.contains("-ui-testing") || arguments.contains("-preview-data")
            let store = try HabitStore(container: HabitStore.makeContainer(inMemory: inMemory))
            if arguments.contains("-preview-data") || arguments.contains("-ui-testing-history") {
                try Self.seed(store)
            }
            self.store = store
            errorMessage = nil
        } catch {
            errorMessage = "Your saved data couldn't be opened. \(error.localizedDescription)"
        }
    }

    /// Explicit preview/test fixtures only; a normal first launch is always empty.
    private static func seed(_ store: HabitStore) throws {
        let today = DayKey()
        let start = today.adding(days: -100)
        try store.create(name: "Read a little", kind: .number, unit: "pages", target: 20, today: start)
        try store.create(name: "Move your body", kind: .check, today: start)
        try store.create(name: "Drink water", kind: .number, unit: "glasses", target: 8, today: start)
        let habits = store.histories
        for offset in -100...0 {
            let day = today.adding(days: offset)
            for (index, habit) in habits.enumerated() {
                if (abs(offset) + index * 3) % 9 < 7 {
                    let value = offset == 0 && index == 0 ? 12.0 : habit.target(on: day)
                    try store.setValue(value, for: habit.id, on: day, today: today)
                }
            }
        }
    }
}

extension Notification.Name {
    static let openDailyToday = Notification.Name("openDailyToday")
    static let openPokusTimer = Notification.Name("openPokusTimer")
    static let openPokusCalendar = Notification.Name("openPokusCalendar")
}

final class NotificationDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        BackgroundRefresh.register()
        return true
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let route = NotificationLaunchRoute.parse(userInfo: response.notification.request.content.userInfo,
            identifier: response.notification.request.identifier) else { return }
        await MainActor.run {
            NotificationLaunchRoute.pending = route
            switch route {
            case .timer: NotificationCenter.default.post(name: .openPokusTimer, object: nil)
            case .habits: NotificationCenter.default.post(name: .openDailyToday, object: nil)
            case .capture: NotificationCenter.default.post(name: .openPokusCalendar, object: nil)
            }
        }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }
}
