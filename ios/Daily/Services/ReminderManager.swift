import Foundation
import Observation
import UserNotifications

@MainActor
protocol ReminderClient {
    func authorizationStatus() async -> UNAuthorizationStatus
    func requestPermission() async throws -> Bool
    func schedule(hour: Int, minute: Int) async throws
    func cancel()
}

@MainActor
final class SystemReminderClient: ReminderClient {
    static let identifier = "daily.evening-check-in"
    private let center = UNUserNotificationCenter.current()

    func authorizationStatus() async -> UNAuthorizationStatus {
        await center.notificationSettings().authorizationStatus
    }

    func requestPermission() async throws -> Bool {
        try await center.requestAuthorization(options: [.alert, .sound])
    }

    func schedule(hour: Int, minute: Int) async throws {
        let content = UNMutableNotificationContent()
        content.title = "A little, every day."
        content.body = "Take a moment to check in with your habits."
        content.sound = .default
        // No fixed timezone: follow the device's local wall-clock time.
        var components = DateComponents()
        components.hour = hour
        components.minute = minute
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
        // The stable identifier replaces the previous request without creating duplicates.
        try await center.add(UNNotificationRequest(identifier: Self.identifier, content: content, trigger: trigger))
    }

    func cancel() {
        center.removePendingNotificationRequests(withIdentifiers: [Self.identifier])
        center.removeDeliveredNotifications(withIdentifiers: [Self.identifier])
    }
}

@MainActor
private final class UITestReminderClient: ReminderClient {
    func authorizationStatus() async -> UNAuthorizationStatus { .authorized }
    func requestPermission() async throws -> Bool { true }
    func schedule(hour: Int, minute: Int) async throws {}
    func cancel() {}
}

@MainActor
@Observable
final class ReminderManager {
    private(set) var enabled: Bool
    private(set) var hour: Int
    private(set) var minute: Int
    private(set) var authorization: UNAuthorizationStatus = .notDetermined
    private(set) var isUpdating = false
    var errorMessage: String?
    private var accountAvailable = true
    @ObservationIgnored private let client: any ReminderClient
    @ObservationIgnored private let defaults: UserDefaults

    init(client: (any ReminderClient)? = nil, defaults: UserDefaults? = nil) {
        let isTest = ProcessInfo.processInfo.arguments.contains("-ui-testing")
        self.client = client ?? (isTest ? UITestReminderClient() : SystemReminderClient())
        let preferences = defaults ?? (isTest ? UserDefaults(suiteName: "DailyUITests")! : .standard)
        if isTest && defaults == nil { preferences.removePersistentDomain(forName: "DailyUITests") }
        self.defaults = preferences
        enabled = preferences.bool(forKey: "reminder.enabled")
        let savedHour = preferences.object(forKey: "reminder.hour") as? Int ?? 20
        let savedMinute = preferences.object(forKey: "reminder.minute") as? Int ?? 0
        hour = (0...23).contains(savedHour) ? savedHour : 20
        minute = (0...59).contains(savedMinute) ? savedMinute : 0
    }

    var selectedTime: Date {
        Calendar.autoupdatingCurrent.date(from: DateComponents(year: 2001, month: 1, day: 1, hour: hour, minute: minute)) ?? .now
    }

    var permissionDenied: Bool { authorization == .denied }
    func setAccountAvailable(_ available: Bool) async {
        accountAvailable = available
        if !available { client.cancel() }
        else if enabled {
            do {
                try await client.schedule(hour: hour, minute: minute)
                if !accountAvailable { client.cancel() }
            }
            catch { errorMessage = "The reminder couldn't be scheduled. \(error.localizedDescription)" }
        }
    }

    func refreshAuthorization() async {
        authorization = await client.authorizationStatus()
        if permissionDenied && enabled {
            client.cancel()
            enabled = false
            defaults.set(false, forKey: "reminder.enabled")
        }
    }

    func setEnabled(_ requested: Bool) async {
        guard !isUpdating, accountAvailable else { return }
        isUpdating = true
        errorMessage = nil
        defer { isUpdating = false }
        if !requested {
            client.cancel()
            enabled = false
            defaults.set(false, forKey: "reminder.enabled")
            return
        }
        do {
            authorization = await client.authorizationStatus()
            if authorization == .notDetermined {
                guard try await client.requestPermission() else {
                    await refreshAuthorization()
                    return
                }
                authorization = await client.authorizationStatus()
            }
            guard authorization == .authorized || authorization == .provisional || authorization == .ephemeral else { return }
            try await client.schedule(hour: hour, minute: minute)
            enabled = true
            defaults.set(true, forKey: "reminder.enabled")
        } catch {
            errorMessage = "The reminder couldn't be scheduled. \(error.localizedDescription)"
        }
    }

    func setTime(_ date: Date) async {
        guard !isUpdating else { return }
        let components = Calendar.autoupdatingCurrent.dateComponents([.hour, .minute], from: date)
        guard let nextHour = components.hour, let nextMinute = components.minute else { return }
        isUpdating = true
        errorMessage = nil
        defer { isUpdating = false }
        do {
            if enabled && accountAvailable { try await client.schedule(hour: nextHour, minute: nextMinute) }
            hour = nextHour
            minute = nextMinute
            defaults.set(hour, forKey: "reminder.hour")
            defaults.set(minute, forKey: "reminder.minute")
        } catch {
            errorMessage = "The time couldn't be changed. Your previous reminder is still scheduled. \(error.localizedDescription)"
        }
    }
}
