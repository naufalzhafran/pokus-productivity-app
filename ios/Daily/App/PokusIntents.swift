import AppIntents
import Foundation

/// Starts a focus session with the default length and opens the timer.
struct StartFocusIntent: AppIntent {
    static let title: LocalizedStringResource = "Start Focus"
    static let description = IntentDescription("Starts a Pokus focus session with your default length.")
    static let openAppWhenRun = true
    init() {}
    @MainActor func perform() async throws -> some IntentResult {
        AppBootstrap.shared.pokus.request = .startFocus
        return .result()
    }
}

/// Opens a new capture.
struct NewCaptureIntent: AppIntent {
    static let title: LocalizedStringResource = "New Capture"
    static let description = IntentDescription("Opens Pokus to save a link, book, or thought.")
    static let openAppWhenRun = true
    init() {}
    @MainActor func perform() async throws -> some IntentResult {
        AppBootstrap.shared.pokus.request = .newCapture
        return .result()
    }
}

struct PokusShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: StartFocusIntent(), phrases: [
            "Start focus in \(.applicationName)",
            "Start a \(.applicationName) session"
        ], shortTitle: "Start Focus", systemImageName: "timer")
        AppShortcut(intent: NewCaptureIntent(), phrases: [
            "New capture in \(.applicationName)",
            "Capture in \(.applicationName)"
        ], shortTitle: "New Capture", systemImageName: "tray.and.arrow.down")
    }
}

extension AppBootstrap {
    /// Live Activity buttons and the Control Center control act on the shared model.
    func installIntentHandler() {
        let model = pokus
        FocusIntentBridge.handler = { action in
            switch action {
            case .openTimer:
                model.request = .timer
            case .toggle(let id):
                await model.waitUntilReady()
                if model.session?.id == id, model.session?.mode == .running { await model.toggle() }
            case .stop(let id):
                await model.waitUntilReady()
                if model.session?.id == id, model.session?.mode == .running { await model.stop(save: true) }
            }
        }
    }
}
