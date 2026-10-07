import BackgroundTasks
import Foundation

/// Periodic background sync: send queued changes and download what changed elsewhere.
@MainActor
enum BackgroundRefresh {
    static let identifier = "com.centaurwarrunner.Daily.refresh"
    static weak var model: PokusModel?

    /// Must run before launch finishes.
    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: .main) { task in
            MainActor.assumeIsolated { handle(task) }
        }
    }

    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    private static func handle(_ task: BGTask) {
        schedule()
        guard let model else { task.setTaskCompleted(success: false); return }
        let work = Task { await model.backgroundSync() }
        task.expirationHandler = { work.cancel() }
        Task {
            await work.value
            task.setTaskCompleted(success: !work.isCancelled)
        }
    }
}
