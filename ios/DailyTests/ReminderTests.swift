import UserNotifications
import XCTest
@testable import Daily

@MainActor
private final class FakeReminderClient: ReminderClient {
    var status: UNAuthorizationStatus = .notDetermined
    var grantsPermission = true
    var permissionRequests = 0
    var scheduled: [(Int, Int)] = []
    var cancellations = 0
    var failsSchedule = false
    enum Failure: Error { case scheduling }

    func authorizationStatus() async -> UNAuthorizationStatus { status }
    func requestPermission() async throws -> Bool {
        permissionRequests += 1
        status = grantsPermission ? .authorized : .denied
        return grantsPermission
    }
    func schedule(hour: Int, minute: Int) async throws {
        if failsSchedule { throw Failure.scheduling }
        scheduled.append((hour, minute))
    }
    func cancel() { cancellations += 1 }
}

final class ReminderTests: XCTestCase {
    @MainActor
    private func makeManager(_ client: FakeReminderClient) -> (ReminderManager, UserDefaults, String) {
        let suite = "DailyReminderTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        return (ReminderManager(client: client, defaults: defaults), defaults, suite)
    }

    @MainActor
    func testStartsDisabledAndOnlyRequestsPermissionWhenEnabled() async {
        let client = FakeReminderClient()
        let (manager, defaults, suite) = makeManager(client)
        defer { defaults.removePersistentDomain(forName: suite) }
        XCTAssertFalse(manager.enabled)
        XCTAssertEqual(manager.hour, 20)
        await manager.refreshAuthorization()
        XCTAssertEqual(client.permissionRequests, 0)
        await manager.setEnabled(true)
        XCTAssertTrue(manager.enabled)
        XCTAssertEqual(client.permissionRequests, 1)
        XCTAssertEqual(client.scheduled.first?.0, 20)
        XCTAssertEqual(client.scheduled.first?.1, 0)
        await manager.setEnabled(false)
        XCTAssertFalse(manager.enabled)
        XCTAssertEqual(client.cancellations, 1)
    }

    @MainActor
    func testDeniedPermissionDoesNotSchedule() async {
        let client = FakeReminderClient()
        client.grantsPermission = false
        let (manager, defaults, suite) = makeManager(client)
        defer { defaults.removePersistentDomain(forName: suite) }
        await manager.setEnabled(true)
        XCTAssertFalse(manager.enabled)
        XCTAssertTrue(manager.permissionDenied)
        XCTAssertTrue(client.scheduled.isEmpty)
    }

    @MainActor
    func testTimeChangeAndFailedScheduleKeepPreviousPreferences() async {
        let client = FakeReminderClient()
        client.status = .authorized
        let (manager, defaults, suite) = makeManager(client)
        defer { defaults.removePersistentDomain(forName: suite) }
        await manager.setEnabled(true)
        let date = Calendar.current.date(from: DateComponents(year: 2001, month: 1, day: 1, hour: 9, minute: 30))!
        await manager.setTime(date)
        XCTAssertEqual(manager.hour, 9)
        XCTAssertEqual(manager.minute, 30)
        XCTAssertEqual(client.scheduled.count, 2)
        client.failsSchedule = true
        await manager.setTime(date.addingTimeInterval(3600))
        XCTAssertEqual(manager.hour, 9)
        XCTAssertNotNil(manager.errorMessage)
        XCTAssertTrue(manager.enabled)
    }

    @MainActor
    func testRevokedPermissionDisablesReminder() async {
        let client = FakeReminderClient()
        client.status = .authorized
        let (manager, defaults, suite) = makeManager(client)
        defer { defaults.removePersistentDomain(forName: suite) }
        await manager.setEnabled(true)
        client.status = .denied
        await manager.refreshAuthorization()
        XCTAssertFalse(manager.enabled)
        XCTAssertEqual(client.cancellations, 1)
    }
    @MainActor
    func testSignOutCancelsReminderWithoutErasingPreference() async {
        let client = FakeReminderClient(); client.status = .authorized
        let (manager, defaults, suite) = makeManager(client)
        defer { defaults.removePersistentDomain(forName: suite) }
        await manager.setEnabled(true)
        await manager.setAccountAvailable(false)
        XCTAssertEqual(client.cancellations, 1)
        XCTAssertTrue(manager.enabled)
        XCTAssertTrue(defaults.bool(forKey: "reminder.enabled"))
        await manager.setEnabled(true)
        XCTAssertEqual(client.scheduled.count, 1)
        await manager.setAccountAvailable(true)
        XCTAssertEqual(client.scheduled.count, 2)
    }
}
