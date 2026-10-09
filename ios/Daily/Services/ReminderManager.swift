import DailyCore
import Foundation
import Observation
import UserNotifications

@MainActor
protocol ReminderClient {
    func authorizationStatus() async -> UNAuthorizationStatus
    func requestPermission() async throws -> Bool
    /// Replaces the scheduled reminders with one per day for the next week, leaving out `skipping`.
    func schedule(hour: Int, minute: Int, skipping: DayKey?) async throws
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

    func schedule(hour: Int, minute: Int, skipping: DayKey?) async throws {
        // Delivered alerts stay in Notification Center; only upcoming requests are replaced.
        center.removePendingNotificationRequests(withIdentifiers: Self.knownIdentifiers)
        let content = UNMutableNotificationContent()
        content.title = "A little, every day."
        content.body = "Take a moment to check in with your habits."
        content.sound = .default
        // One request per day, so a day whose habits are already done can be left out. Components
        // carry no time zone: each follows the device's local wall-clock time.
        for occurrence in DailyReminderSchedule.occurrences(after: .now, hour: hour, minute: minute, skipping: skipping) {
            let trigger = UNCalendarNotificationTrigger(dateMatching: occurrence.components, repeats: false)
            try await center.add(UNNotificationRequest(identifier: Self.dailyIdentifier(for: occurrence.day), content: content, trigger: trigger))
        }
    }

    /// Removes every scheduled habit reminder, including the repeating one older versions scheduled.
    func cancel() {
        center.removePendingNotificationRequests(withIdentifiers: Self.knownIdentifiers)
        center.removeDeliveredNotifications(withIdentifiers: Self.knownIdentifiers)
    }

    static func dailyIdentifier(for day: DayKey) -> String { "\(Self.identifier).\(day.rawValue)" }
    /// The legacy repeating request plus every day a schedule made in the last week can cover.
    private static var knownIdentifiers: [String] {
        let today = DayKey()
        return [identifier] + (-2...(DailyReminderSchedule.days + 1)).map { dailyIdentifier(for: today.adding(days: $0)) }
    }
}

@MainActor
private final class UITestReminderClient: ReminderClient {
    func authorizationStatus() async -> UNAuthorizationStatus { .authorized }
    func requestPermission() async throws -> Bool { true }
    func schedule(hour: Int, minute: Int, skipping: DayKey?) async throws {}
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
    /// The day whose habits were all complete when last checked; its reminder is left out.
    private var completedDay: DayKey?
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
                try await client.schedule(hour: hour, minute: minute, skipping: skippedDay)
                if !accountAvailable { client.cancel() }
            }
            catch { errorMessage = "The reminder couldn't be scheduled. \(error.localizedDescription)" }
        }
    }

    private var skippedDay: DayKey? { completedDay == DayKey() ? completedDay : nil }

    /// Records whether today's habits are all done and reschedules the next week, so the reminder
    /// skips a finished day and never runs out while the app is used.
    func updateSchedule(allHabitsComplete: Bool, today: DayKey = DayKey()) async {
        completedDay = allHabitsComplete ? today : nil
        guard enabled, accountAvailable, !isUpdating else { return }
        do {
            try await client.schedule(hour: hour, minute: minute, skipping: skippedDay)
            if !accountAvailable || !enabled { client.cancel() }
        } catch { errorMessage = "The reminder couldn't be scheduled. \(error.localizedDescription)" }
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
            try await client.schedule(hour: hour, minute: minute, skipping: skippedDay)
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
            if enabled && accountAvailable { try await client.schedule(hour: nextHour, minute: nextMinute, skipping: skippedDay) }
            hour = nextHour
            minute = nextMinute
            defaults.set(hour, forKey: "reminder.hour")
            defaults.set(minute, forKey: "reminder.minute")
        } catch {
            errorMessage = "The time couldn't be changed. Your previous reminder is still scheduled. \(error.localizedDescription)"
        }
    }
}
