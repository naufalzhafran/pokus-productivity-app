import XCTest
@testable import DailyCore

final class HabitCalendarMonthTests: XCTestCase {
    func testGridIncludesLeapDayOnceAndPadsOnlyOutsideMonth() {
        let month = HabitCalendarMonth(containing: DayKey(rawValue: "2024-02-20")!, firstWeekday: 2)
        XCTAssertEqual(month.firstDay.rawValue, "2024-02-01")
        XCTAssertEqual(month.days.count, 29)
        XCTAssertEqual(month.grid.count, 35)
        XCTAssertTrue(month.grid.prefix(3).allSatisfy { $0 == nil })
        XCTAssertEqual(month.grid.compactMap { $0 }, month.days)
        XCTAssertEqual(month.days.last?.rawValue, "2024-02-29")
    }

    func testMonthNavigationCrossesYearWithoutSkippingDecember() {
        let january = HabitCalendarMonth(containing: DayKey(rawValue: "2026-01-31")!)
        XCTAssertEqual(january.adding(months: -1)?.firstDay.rawValue, "2025-12-01")
        XCTAssertEqual(january.adding(months: 1)?.firstDay.rawValue, "2026-02-01")
        XCTAssertEqual(january.adding(months: -1)?.adding(months: 1), january)
    }

    func testNavigationBoundsIncludePartialFirstAndCurrentMonths() {
        let earliest = DayKey(rawValue: "2025-12-20")!
        let latest = DayKey(rawValue: "2026-02-07")!
        let january = HabitCalendarMonth(containing: DayKey(rawValue: "2026-01-01")!)
        XCTAssertTrue(january.canMove(by: -1, earliest: earliest, latest: latest))
        XCTAssertTrue(january.canMove(by: 1, earliest: earliest, latest: latest))
        XCTAssertFalse(january.adding(months: -1)!.canMove(by: -1, earliest: earliest, latest: latest))
        XCTAssertFalse(january.adding(months: 1)!.canMove(by: 1, earliest: earliest, latest: latest))
    }

    func testSixWeekMonthAndDateLimits() {
        let month = HabitCalendarMonth(containing: DayKey(rawValue: "2026-03-01")!, firstWeekday: 2)
        XCTAssertEqual(month.grid.count, 42)
        XCTAssertEqual(month.grid[6]?.rawValue, "2026-03-01")
        XCTAssertNil(HabitCalendarMonth(containing: DayKey(rawValue: "0001-01-01")!).adding(months: -1))
        XCTAssertNil(HabitCalendarMonth(containing: DayKey(rawValue: "9999-12-01")!).adding(months: 1))
    }

    func testSundayStartShiftsTheLeadingPadding() {
        let march = HabitCalendarMonth(containing: DayKey(rawValue: "2026-03-14")!, firstWeekday: 1)
        XCTAssertEqual(march.grid.first??.rawValue, "2026-03-01")
        XCTAssertEqual(march.grid.count, 35)
        let february = HabitCalendarMonth(containing: DayKey(rawValue: "2024-02-20")!, firstWeekday: 1)
        XCTAssertEqual(february.grid.prefix(4).filter { $0 == nil }.count, 4)
        XCTAssertEqual(february.grid[4]?.rawValue, "2024-02-01")
        XCTAssertEqual(february.adding(months: 1)?.firstWeekday, 1)
    }

    func testGregorianCutoverDoesNotIncludeFollowingMonth() {
        let month = HabitCalendarMonth(containing: DayKey(rawValue: "1582-10-01")!)
        XCTAssertEqual(month.days.first?.rawValue, "1582-10-01")
        XCTAssertEqual(month.days.last?.rawValue, "1582-10-31")
        XCTAssertTrue(month.days.allSatisfy { $0.year == 1582 && $0.month == 10 })
        XCTAssertEqual(Set(month.days).count, month.days.count)
    }
}
