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
            Group {
                if let store = bootstrap.store {
                    RootView(store: store)
                } else {
                    ContentUnavailableView {
                        Label("Couldn't open Daily", systemImage: "externaldrive.badge.exclamationmark")
                    } description: {
                        Text(bootstrap.errorMessage ?? "Your habits couldn't be loaded. Your saved data has not been changed.")
                    } actions: {
                        Button("Try again") { bootstrap.load() }
                            .buttonStyle(.borderedProminent)
                    }
                }
            }
            .tint(DailyTheme.green)
        }
    }
}

@MainActor
@Observable
final class AppBootstrap {
    var store: HabitStore?
    var errorMessage: String?

    init() { load() }

    func load() {
        do {
            let arguments = ProcessInfo.processInfo.arguments
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
}

final class NotificationDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .openDailyToday, object: nil)
            completionHandler()
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }
}

