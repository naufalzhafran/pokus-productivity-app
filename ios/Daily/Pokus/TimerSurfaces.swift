import ActivityKit
import PokusCore
import UIKit
import UserNotifications

@MainActor
final class TimerSurfaces: TimerSurfaceClient {
    private let center = UNUserNotificationCenter.current()
    private var generation = UUID()
    private var completionID: String?
    private static let prefix = "pokus.focus."
    func clear() async {
        guard !ProcessInfo.processInfo.arguments.contains("-ui-testing") else { return }
        generation = UUID(); let current = generation
        await removeTimerNotifications(generation: current)
        guard generation == current else { return }
        for activity in Activity<FocusActivityAttributes>.activities {
            guard generation == current else { return }
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
    private func removeTimerNotifications(generation current: UUID) async {
        let requests = await center.pendingNotificationRequests()
        guard generation == current else { return }
        center.removePendingNotificationRequests(withIdentifiers: requests.map(\.identifier).filter { $0.hasPrefix(Self.prefix) })
        let delivered = await center.deliveredNotifications()
        guard generation == current else { return }
        center.removeDeliveredNotifications(withIdentifiers: delivered.map { $0.request.identifier }.filter { $0.hasPrefix(Self.prefix) })
    }
    func update(_ session: FocusSession?) async {
        guard !ProcessInfo.processInfo.arguments.contains("-ui-testing") else { return }
        generation = UUID(); let current = generation
        await removeTimerNotifications(generation: current)
        guard generation == current else { return }
        guard let session, session.mode == .running else {
            for activity in Activity<FocusActivityAttributes>.activities {
                guard generation == current else { return }
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            guard generation == current else { return }
            if let session, session.mode == .complete, completionID != session.id {
                completionID = session.id
                if UIApplication.shared.applicationState == .active { UINotificationFeedbackGenerator().notificationOccurred(.success) }
            }
            return
        }
        let remaining = session.remaining(at: .now)
        if session.isActive && remaining > 0 {
            let settings = await center.notificationSettings()
            if settings.authorizationStatus == .notDetermined { _ = try? await center.requestAuthorization(options: [.alert, .sound]) }
            guard generation == current else { return }
            let content = UNMutableNotificationContent()
            content.title = "Focus session complete"
            content.body = "You made room for \(session.durationMinutes) minutes of focus."
            content.sound = .default; content.userInfo = ["pokusTimer": true]
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, session.deadline.timeIntervalSinceNow), repeats: false)
            try? await center.add(UNNotificationRequest(identifier: Self.prefix + session.id, content: content, trigger: trigger))
            guard generation == current else { return }
        }
        for activity in Activity<FocusActivityAttributes>.activities where activity.attributes.sessionID != session.id {
            guard generation == current else { return }
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        guard generation == current else { return }
        let content = ActivityContent(state: FocusActivityAttributes.ContentState(deadline: session.deadline, remainingSeconds: remaining, paused: !session.isActive), staleDate: session.isActive ? session.deadline : nil)
        await Self.updateActivity(session, content: content)
    }

    private nonisolated static func updateActivity(_ session: FocusSession, content: ActivityContent<FocusActivityAttributes.ContentState>) async {
        if let activity = Activity<FocusActivityAttributes>.activities.first(where: { $0.attributes.sessionID == session.id }) { await activity.update(content) }
        else if ActivityAuthorizationInfo().areActivitiesEnabled {
            _ = try? Activity.request(attributes: FocusActivityAttributes(sessionID: session.id, durationMinutes: session.durationMinutes), content: content, pushType: nil)
        }
    }
}
