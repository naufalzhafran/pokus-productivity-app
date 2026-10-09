import Foundation
import XCTest
@testable import DailyCore

final class DailyReminderScheduleTests: XCTestCase {
    private let zone = TimeZone(identifier: "Asia/Jakarta")!
    private func date(_ day: Int, hour: Int, minute: Int = 0) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        return calendar.date(from: DateComponents(year: 2026, month: 10, day: day, hour: hour, minute: minute))!
    }

    func testSchedulesTodayAndTheNextDaysAtTheChosenTime() {
        let occurrences = DailyReminderSchedule.occurrences(after: date(9, hour: 8), hour: 20, minute: 30, timeZone: zone)
        XCTAssertEqual(occurrences.count, 7)
        XCTAssertEqual(occurrences.first?.day.rawValue, "2026-10-09")
        XCTAssertEqual(occurrences.last?.day.rawValue, "2026-10-15")
        XCTAssertEqual(occurrences.first?.components, DateComponents(year: 2026, month: 10, day: 9, hour: 20, minute: 30))
        XCTAssertNil(occurrences.first?.components.timeZone)
    }

    func testSkipsTodayWhenItsTimePassedOrItsHabitsAreDone() {
        let late = DailyReminderSchedule.occurrences(after: date(9, hour: 21), hour: 20, minute: 0, timeZone: zone)
        XCTAssertEqual(late.map(\.day.rawValue).first, "2026-10-10")
        XCTAssertEqual(late.count, 7)
        let done = DailyReminderSchedule.occurrences(after: date(9, hour: 8), hour: 20, minute: 0,
                                                     skipping: DayKey(rawValue: "2026-10-09"), timeZone: zone)
        XCTAssertEqual(done.map(\.day.rawValue).first, "2026-10-10")
        XCTAssertFalse(done.map(\.day.rawValue).contains("2026-10-09"))
        XCTAssertEqual(done.count, 7)
        // A completed day in the past doesn't change the schedule.
        let stale = DailyReminderSchedule.occurrences(after: date(9, hour: 8), hour: 20, minute: 0,
                                                      skipping: DayKey(rawValue: "2026-10-08"), timeZone: zone)
        XCTAssertEqual(stale.first?.day.rawValue, "2026-10-09")
    }

    func testCrossesMonthBoundaries() {
        let occurrences = DailyReminderSchedule.occurrences(after: date(29, hour: 8), hour: 7, minute: 0, count: 4, timeZone: zone)
        XCTAssertEqual(occurrences.map(\.day.rawValue), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"])
    }
}
