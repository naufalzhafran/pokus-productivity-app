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
    public init(sessionID: String, durationMinutes: Int) { self.sessionID = sessionID; self.durationMinutes = durationMinutes }
}
#endif
