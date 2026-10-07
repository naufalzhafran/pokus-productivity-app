#if canImport(UIKit)
import UserNotifications
import XCTest

final class CalendarNotificationDeliveryTests: XCTestCase {
    func testAuthorizedLocalNotificationReachesNotificationCenter() async throws {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
            throw XCTSkip("Notification permission is not already granted; this test does not request it.")
        }
        let identifier = "pokus.calendar-verification." + UUID().uuidString
        defer {
            center.removePendingNotificationRequests(withIdentifiers: [identifier])
            center.removeDeliveredNotifications(withIdentifiers: [identifier])
        }
        let content = UNMutableNotificationContent()
        content.title = "Pokus reminder test"
        content.body = "Temporary notification used to verify delivery."
        try await center.add(UNNotificationRequest(identifier: identifier, content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: 2, repeats: false)))
        let deadline = Date().addingTimeInterval(12)
        while Date() < deadline {
            if await center.deliveredNotifications().contains(where: { $0.request.identifier == identifier }) { return }
            try await Task.sleep(for: .milliseconds(250))
        }
        XCTFail("The scheduled test notification did not appear in Notification Center within 12 seconds.")
    }
}
#endif
