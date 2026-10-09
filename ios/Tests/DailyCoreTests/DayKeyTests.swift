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

    func testYearGridContainsEveryDateOnceForMondayAndSundayStarts() {
        for firstWeekday in [1, 2] {
            for year in [2024, 2026, 2028] {
                let weeks = DayKey.yearGrid(year, firstWeekday: firstWeekday)
                XCTAssertTrue(weeks.allSatisfy {
                    $0.count == 7 && $0[0].weekdayIndex(firstWeekday: firstWeekday) == 0 && $0[6].weekdayIndex(firstWeekday: firstWeekday) == 6
                })
                let dates = weeks.flatMap { $0 }.filter { $0.year == year }
                XCTAssertEqual(dates.count, year == 2026 ? 365 : 366)
                XCTAssertEqual(Set(dates).count, dates.count)
            }
        }
        // 2026-01-01 is a Thursday.
        XCTAssertEqual(DayKey.yearGrid(2026, firstWeekday: 2)[0][0].rawValue, "2025-12-29")
        XCTAssertEqual(DayKey.yearGrid(2026, firstWeekday: 1)[0][0].rawValue, "2025-12-28")
    }

    func testWeekdayIndexFollowsTheFirstWeekday() {
        let sunday = DayKey(rawValue: "2026-10-04")!, monday = DayKey(rawValue: "2026-10-05")!
        XCTAssertEqual(sunday.weekdayIndex(firstWeekday: 1), 0)
        XCTAssertEqual(monday.weekdayIndex(firstWeekday: 1), 1)
        XCTAssertEqual(sunday.weekdayIndex(firstWeekday: 2), 6)
        XCTAssertEqual(monday.weekdayIndex(firstWeekday: 2), 0)
        XCTAssertEqual(DayKey(rawValue: "2026-10-08")!.startOfWeek(firstWeekday: 1), sunday)
        XCTAssertEqual(DayKey(rawValue: "2026-10-08")!.startOfWeek(firstWeekday: 2), monday)
        XCTAssertEqual(sunday.startOfWeek(firstWeekday: 2).rawValue, "2026-09-28")
    }

    func testWeeksCoverWholeWeeksFromTheFirstWeekday() {
        let first = DayKey(rawValue: "2026-10-01")!, last = DayKey(rawValue: "2026-10-31")!
        let mondayWeeks = DayKey.weeks(from: first, through: last, firstWeekday: 2)
        XCTAssertEqual(mondayWeeks.first?.rawValue, "2026-09-28")
        XCTAssertEqual(mondayWeeks.last?.rawValue, "2026-11-01")
        XCTAssertEqual(mondayWeeks.count % 7, 0)
        let sundayWeeks = DayKey.weeks(from: first, through: last, firstWeekday: 1)
        XCTAssertEqual(sundayWeeks.first?.rawValue, "2026-09-27")
        XCTAssertEqual(sundayWeeks.last?.rawValue, "2026-10-31")
        XCTAssertEqual(sundayWeeks.count, 35)
    }

    func testWeekdaySymbolsRotateToTheFirstWeekday() {
        let english = Locale(identifier: "en_US")
        XCTAssertEqual(DayKey.weekdaySymbols(firstWeekday: 1, locale: english), ["S", "M", "T", "W", "T", "F", "S"])
        XCTAssertEqual(DayKey.weekdaySymbols(firstWeekday: 2, locale: english), ["M", "T", "W", "T", "F", "S", "S"])
        XCTAssertEqual(DayKey.weekdaySymbols(firstWeekday: 7, locale: english).first, "S")
        XCTAssertEqual(DayKey.weekdaySymbols(firstWeekday: 2, locale: Locale(identifier: "fr_FR")).count, 7)
    }
}

