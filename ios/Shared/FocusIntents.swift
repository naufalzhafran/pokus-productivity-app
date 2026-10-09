import AppIntents
import Foundation

/// Intents shared by the app and the PokusActivity extension. Live Activity buttons and the
/// Control Center control run them in the app's process, where the app installs `handler`.
enum FocusIntentAction: Sendable, Equatable {
    case toggle(sessionID: String)
    case stop(sessionID: String)
    case openTimer
}

@MainActor
enum FocusIntentBridge {
    static var handler: (@MainActor (FocusIntentAction) async -> Void)?
    static func run(_ action: FocusIntentAction) async { await handler?(action) }
}

/// Pauses or resumes the running session from its Live Activity.
struct ToggleFocusIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Pause or Resume Focus"
    static let isDiscoverable = false
    @Parameter(title: "Session") var sessionID: String
    init() {}
    init(sessionID: String) { self.sessionID = sessionID }
    @MainActor func perform() async throws -> some IntentResult {
        await FocusIntentBridge.run(.toggle(sessionID: sessionID))
        return .result()
    }
}

/// Ends the running session from its Live Activity and saves the elapsed time.
struct StopFocusIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Stop Focus"
    static let description = IntentDescription("Ends the focus session and saves the elapsed time.")
    static let isDiscoverable = false
    @Parameter(title: "Session") var sessionID: String
    init() {}
    init(sessionID: String) { self.sessionID = sessionID }
    @MainActor func perform() async throws -> some IntentResult {
        await FocusIntentBridge.run(.stop(sessionID: sessionID))
        return .result()
    }
}

/// Opens the Focus tab, from Control Center or Shortcuts.
struct OpenFocusTimerIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Focus Timer"
    static let description = IntentDescription("Opens the Pokus focus timer.")
    static let openAppWhenRun = true
    init() {}
    @MainActor func perform() async throws -> some IntentResult {
        await FocusIntentBridge.run(.openTimer)
        return .result()
    }
}
