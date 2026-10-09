import DailyCore
import Foundation
import PokusCore
import WidgetKit

/// Keeps the Home Screen widget's copy of today's focus and the running session current.
@MainActor
enum FocusWidgetSync {
    static let kind = "PokusTodayFocus"
    private static var enabled: Bool { !ProcessInfo.processInfo.arguments.contains("-ui-testing") }

    /// Pass `todaySeconds` when statistics were just computed; otherwise the saved total is kept.
    static func update(todaySeconds: Int? = nil, session: FocusSession?) {
        guard enabled, let defaults = PokusAppGroup.defaults else { return }
        let today = DayKey(), previous = FocusWidgetSnapshot.read(from: defaults)
        let running = session?.mode == .running ? session : nil
        let snapshot = FocusWidgetSnapshot(day: today, todaySeconds: todaySeconds ?? previous?.todaySeconds(on: today) ?? 0,
            deadline: running?.isActive == true ? running?.deadline : nil, paused: running?.isActive == false,
            remainingSeconds: running?.remaining(at: .now) ?? 0)
        guard snapshot != previous else { return }
        snapshot.write(to: defaults)
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
    }

    /// Signing out removes the account's numbers from the Home Screen.
    static func clear() {
        guard enabled, let defaults = PokusAppGroup.defaults, defaults.data(forKey: FocusWidgetSnapshot.key) != nil else { return }
        defaults.removeObject(forKey: FocusWidgetSnapshot.key)
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
    }
}

extension PokusModel {
    /// Saves links and text shared from other apps as captures, oldest first. Each item is
    /// removed only after its capture is saved, so a failure leaves the rest for next time.
    func importSharedCaptures() async -> Int {
        guard !ProcessInfo.processInfo.arguments.contains("-ui-testing"), let inbox = SharedCaptureInbox() else { return 0 }
        var saved = 0
        for item in inbox.pending() {
            guard canEdit, let scope else { break }
            // A previous import may have saved it before the app stopped.
            if let existing: Capture = try? await readAPI().record("captures", id: item.id), existing.id == item.id {
                inbox.remove(item.id); continue
            }
            guard self.scope == scope else { break }
            let parsed = LibraryRules.parseCaptureText(item.text)
            let ok = (try? await saveCapture(original: nil, creationID: item.id, projectID: nil, kind: parsed.kind, title: "",
                                             url: parsed.url?.absoluteString ?? "", author: "", replacementNote: parsed.note)) ?? false
            guard ok else { break }
            inbox.remove(item.id); saved += 1
        }
        return saved
    }
}
