#if os(iOS)
import ActivityKit
import Foundation

public struct FocusActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var deadline: Date
        public var remainingSeconds: Int
        public var paused: Bool
        public init(deadline: Date, remainingSeconds: Int, paused: Bool) {
            self.deadline = deadline; self.remainingSeconds = remainingSeconds; self.paused = paused
        }
    }
    public var sessionID: String
    public var durationMinutes: Int
    /// The linked task's title; absent for untasked sessions and activities started by older versions.
    public var taskTitle: String?
    public init(sessionID: String, durationMinutes: Int, taskTitle: String? = nil) {
        self.sessionID = sessionID; self.durationMinutes = durationMinutes; self.taskTitle = taskTitle
    }
}
#endif
