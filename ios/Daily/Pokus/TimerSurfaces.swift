import ActivityKit
import PokusCore
import UIKit
import UserNotifications

@MainActor
final class TimerSurfaces: TimerSurfaceClient {
    private let center = UNUserNotificationCenter.current()
    private var generation = UUID()
    private var completionID: String?
    /// Looks up the linked task's title for the Live Activity and the completion alert.
    var taskTitle: ((String) async -> String?)?
    private static let prefix = "pokus.focus."
    func clear() async {
        guard !ProcessInfo.processInfo.arguments.contains("-ui-testing") else { return }
        FocusWidgetSync.clear()
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
        FocusWidgetSync.update(session: session)
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
                if UIApplication.shared.applicationState == .active && TimerPreferences.completionHaptic {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                }
            }
            return
        }
        let remaining = session.remaining(at: .now)
        let linkedTitle = session.task.isEmpty ? nil : await taskTitle?(session.task)
        guard generation == current else { return }
        if session.isActive && remaining > 0 {
            let settings = await center.notificationSettings()
            if settings.authorizationStatus == .notDetermined { _ = try? await center.requestAuthorization(options: [.alert, .sound]) }
            guard generation == current else { return }
            let content = UNMutableNotificationContent()
            content.title = "Focus session complete"
            content.body = Self.completionBody(minutes: session.durationMinutes, taskTitle: linkedTitle)
            content.sound = TimerPreferences.completionSound ? .default : nil; content.userInfo = ["pokusTimer": true]
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, session.deadline.timeIntervalSinceNow), repeats: false)
            try? await center.add(UNNotificationRequest(identifier: Self.prefix + session.id, content: content, trigger: trigger))
            guard generation == current else { return }
        }
        // A task linked after the session started needs a new activity: its title is fixed when it starts.
        for activity in Activity<FocusActivityAttributes>.activities
        where activity.attributes.sessionID != session.id || (linkedTitle != nil && activity.attributes.taskTitle == nil) {
            guard generation == current else { return }
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        guard generation == current else { return }
        let content = ActivityContent(state: FocusActivityAttributes.ContentState(deadline: session.deadline, remainingSeconds: remaining, paused: !session.isActive), staleDate: session.isActive ? session.deadline : nil)
        await Self.updateActivity(session, content: content, taskTitle: linkedTitle)
    }

    /// The completion alert names the linked task when there is one.
    static func completionBody(minutes: Int, taskTitle: String?) -> String {
        let title = taskTitle?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let length = "\(minutes) \(minutes == 1 ? "minute" : "minutes")"
        return title.isEmpty ? "You made room for \(length) of focus." : "\(length) on \(title)."
    }

    private nonisolated static func updateActivity(_ session: FocusSession, content: ActivityContent<FocusActivityAttributes.ContentState>, taskTitle: String?) async {
        if let activity = Activity<FocusActivityAttributes>.activities.first(where: { $0.attributes.sessionID == session.id }) { await activity.update(content) }
        else if ActivityAuthorizationInfo().areActivitiesEnabled {
            let attributes = FocusActivityAttributes(sessionID: session.id, durationMinutes: session.durationMinutes, taskTitle: taskTitle)
            _ = try? Activity.request(attributes: attributes, content: content, pushType: nil)
        }
    }
}
