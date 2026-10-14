#if os(iOS)
import ActivityKit
import Foundation

public struct FocusActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var deadline: Date
        public var remainingSeconds: Int
        public var paused: Bool
        /// Set once the Pokus has finished; absent in states written by older versions.
        public var completed: Bool
        public init(deadline: Date, remainingSeconds: Int, paused: Bool, completed: Bool = false) {
            self.deadline = deadline; self.remainingSeconds = remainingSeconds; self.paused = paused; self.completed = completed
        }
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            deadline = try c.decode(Date.self, forKey: .deadline)
            remainingSeconds = try c.decode(Int.self, forKey: .remainingSeconds)
            paused = try c.decode(Bool.self, forKey: .paused)
            completed = try c.decodeIfPresent(Bool.self, forKey: .completed) ?? false
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
