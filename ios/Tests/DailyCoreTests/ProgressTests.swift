import Foundation
import XCTest
@testable import DailyCore

final class ProgressTests: XCTestCase {
    private let today = DayKey(rawValue: "2026-09-15")!
    private func habit(kind: HabitKind = .check, start: DayKey? = nil,
                       targets: [TargetChange] = [], entries: [DayKey: Double] = [:]) -> HabitHistory {
        HabitHistory(id: UUID(), name: "Read", kind: kind, startDay: start ?? today.adding(days: -10),
                     targets: targets, entries: entries)
    }

    func testNumericThresholdAndPartialIntensity() {
        let h = habit(kind: .number, targets: [.init(day: today.adding(days: -10), target: 8)],
                      entries: [today: 7.5, today.adding(days: -1): 8, today.adding(days: -2): 9])
        XCTAssertFalse(h.isComplete(on: today))
        XCTAssertEqual(h.fraction(on: today), 0.9375)
        XCTAssertEqual(ProgressCalculator.intensity(for: h.fraction(on: today)), 3)
        XCTAssertTrue(h.isComplete(on: today.adding(days: -1)))
        XCTAssertEqual(h.fraction(on: today.adding(days: -2)), 1)
        XCTAssertEqual(ProgressCalculator.intensity(for: 1), 4)
        XCTAssertEqual(ProgressCalculator.intensity(for: 0), 0)
    }

    func testUnfinishedTodayPreservesYesterdayStreak() {
        let days = Set((-3 ... -1).map { today.adding(days: $0) })
        let result = Streaks(completed: days, today: today)
        XCTAssertEqual(result.current, 3)
        XCTAssertEqual(result.longest, 3)
        XCTAssertEqual(Streaks(completed: days, today: today.adding(days: 1)).current, 0)
    }

    func testLongestRunAndBackfillingGap() {
        var days = Set([-6, -5, -4, -2, 0].map { today.adding(days: $0) })
        XCTAssertEqual(Streaks(completed: days, today: today).current, 1)
        XCTAssertEqual(Streaks(completed: days, today: today).longest, 3)
        days.insert(today.adding(days: -1))
        days.insert(today.adding(days: -3))
        XCTAssertEqual(Streaks(completed: days, today: today).current, 7)
        days.remove(today.adding(days: -1))
        XCTAssertEqual(Streaks(completed: days, today: today).current, 1)
    }

    func testFutureDaysNeverExtendStreak() {
        let result = Streaks(completed: [today, today.adding(days: 1), today.adding(days: 2)], today: today)
        XCTAssertEqual(result.current, 1)
        XCTAssertEqual(result.longest, 1)
        XCTAssertEqual(result.completedDays, 1)
    }

    func testOverallStreakUsesAnyCompletedHabitButNotPartialProgress() {
        let check = habit(entries: [today.adding(days: -1): 1])
        let number = habit(kind: .number, targets: [.init(day: today.adding(days: -10), target: 5)], entries: [today: 4])
        XCTAssertEqual(ProgressCalculator.progress(on: today, habits: [check, number]).completed, 0)
        XCTAssertEqual(ProgressCalculator.streaks(habits: [check, number], today: today).current, 1)
        let completedNumber = habit(kind: .number, targets: number.targets, entries: [today: 5])
        XCTAssertEqual(ProgressCalculator.streaks(habits: [check, completedNumber], today: today).current, 2)
        XCTAssertEqual(ProgressCalculator.progress(on: today, habits: [check, completedNumber]).fraction, 0.5)
    }

    func testNewHabitDoesNotChangeOlderDenominator() {
        let older = habit(entries: [today.adding(days: -1): 1])
        let newer = habit(start: today)
        let yesterday = ProgressCalculator.progress(on: today.adding(days: -1), habits: [older, newer])
        XCTAssertEqual(yesterday.total, 1)
        XCTAssertEqual(yesterday.fraction, 1)
        XCTAssertEqual(ProgressCalculator.progress(on: today, habits: []).fraction, 0)
    }

    func testTargetChangesPreservePreviousDaysAndApplyToBackfill() {
        let h = habit(kind: .number, targets: [
            .init(day: today.adding(days: -10), target: 5), .init(day: today, target: 10)
        ], entries: [today.adding(days: -1): 5, today: 5])
        XCTAssertTrue(h.isComplete(on: today.adding(days: -1)))
        XCTAssertFalse(h.isComplete(on: today))
        XCTAssertEqual(h.target(on: today.adding(days: -4)), 5)
    }

    func testUncheckingRemovesCompletion() {
        let h = habit(entries: [today: 0])
        XCTAssertFalse(h.isComplete(on: today))
        XCTAssertEqual(h.completedDays(through: today), [])
    }

    func testLocaleAwareNumberInputRejectsInvalidAndPartialValues() {
        XCTAssertEqual(NumberText.parse("1,5", locale: Locale(identifier: "id_ID")), 1.5)
        XCTAssertEqual(NumberText.parse("0", locale: Locale(identifier: "en_US")), 0)
        for value in ["", "-1", "NaN", "inf", "1x", "1,000", "1.2.3", "1e5"] {
            XCTAssertNil(NumberText.parse(value, locale: Locale(identifier: "en_US")), value)
        }
        XCTAssertNotNil(NumberText.parse(NumberText.editable(1.5)))
    }
}

