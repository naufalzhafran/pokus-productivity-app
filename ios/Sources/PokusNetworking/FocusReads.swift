import DailyCore
import Foundation
import PokusCore

extension PocketBaseClient {
    /// Completed sessions that ended on or after `start`, newest first. Recent windows are read
    /// from the device copy, which keeps the last 90 days of sessions.
    public func completedSessions(since start: Date) async throws -> [FocusSession] {
        let lower = Int(floor(start.timeIntervalSince1970 * 1000))
        return try await list("pomodoro_sessions", filter: "mode = 'complete' && lastTick >= \(lower)", sort: "-lastTick,id")
    }

    /// Focus statistics for `today`, merging sessions saved on this device but not yet synced.
    public func focusStatistics(today: DayKey, local: [FocusSession], timeZone: TimeZone = .autoupdatingCurrent) async throws -> FocusStatistics {
        let synced = try await completedSessions(since: FocusStatistics.windowStart(today: today, timeZone: timeZone))
        return FocusStatistics(sessions: local + synced, today: today, timeZone: timeZone)
    }
}
