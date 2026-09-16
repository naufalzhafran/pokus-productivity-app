import Foundation
import XCTest
@testable import DailyCore

final class DayKeyTests: XCTestCase {
    func testLeapDayAndYearBoundary() {
        XCTAssertEqual(DayKey(rawValue: "2024-02-28")!.adding(days: 1).rawValue, "2024-02-29")
        XCTAssertEqual(DayKey(rawValue: "2024-02-29")!.adding(days: 1).rawValue, "2024-03-01")
        XCTAssertEqual(DayKey(rawValue: "2025-12-31")!.adding(days: 1).rawValue, "2026-01-01")
        XCTAssertNil(DayKey(rawValue: "2025-02-29"))
        XCTAssertNil(DayKey(rawValue: "2026-2-01"))
    }

    func testLocalDateAtMidnightAndStableStoredIdentity() {
        let instant = ISO8601DateFormatter().date(from: "2026-09-14T17:01:00Z")!
        let jakarta = DayKey(date: instant, timeZone: TimeZone(identifier: "Asia/Jakarta")!)
        let losAngeles = DayKey(date: instant, timeZone: TimeZone(identifier: "America/Los_Angeles")!)
        XCTAssertEqual(jakarta.rawValue, "2026-09-15")
        XCTAssertEqual(losAngeles.rawValue, "2026-09-14")
        XCTAssertEqual(DayKey(rawValue: jakarta.rawValue), jakarta)
    }

    func testDayArithmeticAcrossDaylightSaving() {
        let spring = DayKey(rawValue: "2026-03-07")!
        XCTAssertEqual(spring.adding(days: 2).rawValue, "2026-03-09")
        let fall = DayKey(rawValue: "2026-10-31")!
        XCTAssertEqual(fall.adding(days: 2).rawValue, "2026-11-02")
        XCTAssertEqual(DayKey.days(from: spring, through: spring.adding(days: 2)).count, 3)
    }

    func testYearGridContainsEveryDateOnceWithMondayRows() {
        for year in [2024, 2026, 2028] {
            let weeks = DayKey.yearGrid(year)
            XCTAssertTrue(weeks.allSatisfy { $0.count == 7 && $0[0].weekdayIndex == 0 && $0[6].weekdayIndex == 6 })
            let dates = weeks.flatMap { $0 }.filter { $0.year == year }
            XCTAssertEqual(dates.count, year == 2026 ? 365 : 366)
            XCTAssertEqual(Set(dates).count, dates.count)
        }
    }
}

