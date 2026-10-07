import DailyCore
import Foundation
import PokusCore
import UserNotifications

@MainActor
protocol CaptureNotificationClient {
    func pendingRequests() async -> [UNNotificationRequest]
    func deliveredIdentifiers() async -> [String]
    func authorizationStatus() async -> UNAuthorizationStatus
    func requestPermission() async throws -> Bool
    func add(_ request: UNNotificationRequest) async throws
    func removePending(_ identifiers: [String])
    func removeDelivered(_ identifiers: [String])
}

@MainActor
private final class SystemCaptureNotificationClient: CaptureNotificationClient {
    private let center = UNUserNotificationCenter.current()
    func pendingRequests() async -> [UNNotificationRequest] { await center.pendingNotificationRequests() }
    func deliveredIdentifiers() async -> [String] { await center.deliveredNotifications().map { $0.request.identifier } }
    func authorizationStatus() async -> UNAuthorizationStatus { await center.notificationSettings().authorizationStatus }
    func requestPermission() async throws -> Bool { try await center.requestAuthorization(options: [.alert, .sound]) }
    func add(_ request: UNNotificationRequest) async throws { try await center.add(request) }
    func removePending(_ identifiers: [String]) { center.removePendingNotificationRequests(withIdentifiers: identifiers) }
    func removeDelivered(_ identifiers: [String]) { center.removeDeliveredNotifications(withIdentifiers: identifiers) }
}

@MainActor
private final class UITestCaptureNotificationClient: CaptureNotificationClient {
    func pendingRequests() async -> [UNNotificationRequest] { [] }
    func deliveredIdentifiers() async -> [String] { [] }
    func authorizationStatus() async -> UNAuthorizationStatus { .authorized }
    func requestPermission() async throws -> Bool { true }
    func add(_ request: UNNotificationRequest) async throws {}
    func removePending(_ identifiers: [String]) {}
    func removeDelivered(_ identifiers: [String]) {}
}

@MainActor
final class CaptureReminderScheduler {
    static let prefix = "pokus.capture."
    private let client: any CaptureNotificationClient
    private let now: () -> Date
    private var revision = UUID()
    private var pending: Task<Void, Never>?
    private var requestedOwner: String?

    init(client: (any CaptureNotificationClient)? = nil, now: @escaping () -> Date = { Date() }) {
        self.client = client ?? (ProcessInfo.processInfo.arguments.contains("-ui-testing")
            ? UITestCaptureNotificationClient() : SystemCaptureNotificationClient())
        self.now = now
    }

    func cancel(owner: String, captureID: String) async {
        revision = UUID()
        let previous = pending
        previous?.cancel()
        let prefix = Self.prefix + owner + "." + captureID + "."
        let removal = Task { @MainActor in
            let pendingIDs = await client.pendingRequests().map(\.identifier).filter { $0.hasPrefix(prefix) }
            client.removePending(pendingIDs)
            let deliveredIDs = await client.deliveredIdentifiers().filter { $0.hasPrefix(prefix) }
            client.removeDelivered(deliveredIDs)
        }
        pending = Task {
            await removal.value
            if let previous { await previous.value }
        }
        await removal.value
    }

    /// Orders reconciliation while allowing sign-out to clear alerts before an in-flight request finishes.
    func refresh(model: PokusModel, requestPermission: Bool = false) async {
        guard model.scope != nil || model.storageReady else { return }
        let token = UUID(), scope = model.scope, previous = pending
        if requestPermission { requestedOwner = scope?.owner }
        revision = token
        previous?.cancel()
        let work = Task { @MainActor in
            guard self.revision == token else { return }
            let existing = await self.client.pendingRequests()
            guard self.revision == token, model.scope == scope else { return }
            let captureRequests = existing.filter { $0.identifier.hasPrefix(Self.prefix) }
            let ownerPrefix = scope.map { Self.prefix + $0.owner + "." }
            self.client.removePending(captureRequests.filter { request in
                ownerPrefix.map { !request.identifier.hasPrefix($0) } ?? true
            }.map(\.identifier))
            let delivered = await self.client.deliveredIdentifiers()
            guard self.revision == token, model.scope == scope else { return }
            self.client.removeDelivered(delivered.filter { id in
                id.hasPrefix(Self.prefix) && (ownerPrefix.map { !id.hasPrefix($0) } ?? true)
            })
            guard let scope, let ownerPrefix else {
                self.requestedOwner = nil; model.captureReminderNotice = nil; model.captureReminderPermissionDenied = false
                return
            }
            if let previous { await previous.value }
            guard self.revision == token, model.scope == scope else { return }
            do {
                // An uncached, complete read must succeed before replacing this owner's alerts.
                let captures = try await model.freshReadAPI().calendarReminders()
                guard self.revision == token, model.scope == scope else { return }
                var status = await self.client.authorizationStatus()
                if self.requestedOwner == scope.owner && status == .notDetermined {
                    self.requestedOwner = nil
                    _ = try await self.client.requestPermission()
                    status = await self.client.authorizationStatus()
                }
                guard self.revision == token, model.scope == scope else { return }
                model.captureReminderPermissionDenied = status == .denied
                if self.requestedOwner == scope.owner { self.requestedOwner = nil }
                var authorized = status == .authorized || status == .provisional
                #if os(iOS)
                authorized = authorized || status == .ephemeral
                #endif
                let now = self.now().timeIntervalSince1970 * 1000
                let future = captures.filter { !$0.reminderDone && $0.reminderAt > now }
                    .sorted { $0.reminderAt == $1.reminderAt ? $0.id < $1.id : $0.reminderAt < $1.reminderAt }
                let otherCount = existing.filter { !$0.identifier.hasPrefix(Self.prefix) }.count
                let capacity = min(60, max(0, 64 - otherCount))
                let scheduled = authorized ? Array(future.prefix(capacity)) : []
                let ids = Set(scheduled.map { Self.identifier(owner: scope.owner, capture: $0) })
                self.client.removePending(captureRequests.filter {
                    $0.identifier.hasPrefix(ownerPrefix) && !ids.contains($0.identifier)
                }.map(\.identifier))
                let activeIDs = Set(captures.map { Self.identifier(owner: scope.owner, capture: $0) })
                self.client.removeDelivered(delivered.filter {
                    $0.hasPrefix(ownerPrefix) && !activeIDs.contains($0)
                })
                for capture in scheduled {
                    guard self.revision == token, model.scope == scope else { return }
                    let id = Self.identifier(owner: scope.owner, capture: capture)
                    guard capture.reminderAt > self.now().timeIntervalSince1970 * 1000 else { continue }
                    let content = UNMutableNotificationContent()
                    content.title = "Capture reminder"
                    content.body = capture.label
                    content.sound = .default
                    content.userInfo = ["pokusCapture": capture.id, "owner": scope.owner, "reminderAt": capture.reminderAt]
                    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, capture.reminderAt / 1000 - self.now().timeIntervalSince1970), repeats: false)
                    do { try await self.client.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger)) }
                    catch {
                        if self.revision != token || model.scope != scope { self.client.removePending([id]); return }
                        throw error
                    }
                    if self.revision != token || model.scope != scope { self.client.removePending([id]); return }
                }
                guard self.revision == token, model.scope == scope else { return }
                if !authorized && !future.isEmpty {
                    model.captureReminderNotice = status == .denied
                        ? "Reminders are saved. Allow notifications in Settings to receive iPhone alerts."
                        : "Reminders are saved. Enable reminder alerts to receive notifications on this iPhone."
                } else if future.count > capacity {
                    model.captureReminderNotice = "The next \(capacity) reminders have iPhone alerts. \(future.count - capacity) later reminders will be scheduled after a refresh."
                } else { model.captureReminderNotice = nil }
            } catch {
                guard self.revision == token, model.scope == scope else { return }
                model.captureReminderNotice = "Reminders are saved. iPhone alerts couldn't refresh: \(error.localizedDescription)"
            }
        }
        pending = work
        await work.value
        if revision == token { pending = nil }
    }

    static func identifier(owner: String, capture: Capture) -> String {
        prefix + owner + "." + capture.id + "." + String(format: "%.0f", capture.reminderAt)
    }
}
