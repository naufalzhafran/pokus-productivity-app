import CoreFoundation
import Foundation

@MainActor
enum NotificationLaunchRoute {
    enum Destination: Equatable, Sendable {
        case timer, habits
        case capture(owner: String, id: String, reminderAt: Double)
    }
    static var pending: Destination?

    nonisolated static func parse(userInfo: [AnyHashable: Any], identifier: String) -> Destination? {
        // Habit reminders: the legacy repeating request, and one request per day in newer versions.
        if identifier == "daily.evening-check-in" || identifier.hasPrefix("daily.evening-check-in.") { return .habits }
        let timerPrefix = "pokus.focus."
        if identifier.hasPrefix(timerPrefix), identifier.count > timerPrefix.count,
           userInfo["pokusTimer"] as? Bool == true { return .timer }
        guard let owner = userInfo["owner"] as? String, validID(owner),
              let capture = userInfo["pokusCapture"] as? String, validID(capture),
              let number = userInfo["reminderAt"] as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let timestamp = number.doubleValue
        guard timestamp.isFinite, timestamp > 0, timestamp <= 253_402_300_799_000,
              timestamp.rounded() == timestamp,
              identifier == "pokus.capture.\(owner).\(capture).\(Int64(timestamp))" else { return nil }
        return .capture(owner: owner, id: capture, reminderAt: timestamp)
    }

    static func consume(owner: String?, localHabits: Bool = false) -> Destination? {
        guard let route = pending else { return nil }
        switch route {
        case .timer:
            pending = nil
            return route
        case .habits:
            guard owner != nil || localHabits else { return nil }
            pending = nil
            return route
        case .capture(let expectedOwner, _, _):
            guard let owner else { return nil }
            pending = nil
            return owner == expectedOwner ? route : nil
        }
    }

    nonisolated private static func validID(_ value: String) -> Bool {
        !value.isEmpty && value.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber) }
    }
}
