import XCTest

@MainActor final class DailyUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    private func launch(history: Bool = false, accessibilityText: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-local-habits"] + (history ? ["-ui-testing-history"] : [])
        if accessibilityText { app.launchArguments.append("-ui-testing-accessibility") }
        app.launch()
        app.tabBars.buttons["Library"].tap()
        let habits = app.buttons["libraryHabits"]
        reveal(habits, in: app)
        habits.tap()
        XCTAssertTrue(app.navigationBars["Habits"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.segmentedControls.buttons["Today"].exists)
        return app
    }

    func testEmptyHabitsUsesOneActionAndStableNavigation() {
        let app = launch()
        XCTAssertTrue(app.staticTexts["No habits yet"].exists)
        XCTAssertTrue(app.buttons["createFirstHabit"].isHittable)
        XCTAssertFalse(app.buttons["addHabit"].exists)
        capture("Habits empty state")
        app.segmentedControls.buttons["Progress"].tap()
        XCTAssertTrue(app.navigationBars["Habits"].exists)
        XCTAssertTrue(app.buttons["addHabit"].waitForExistence(timeout: 5))
        app.buttons["addHabit"].tap()
        XCTAssertTrue(app.navigationBars["New habit"].waitForExistence(timeout: 5))
        app.buttons["Cancel"].tap()
        app.segmentedControls.buttons["Today"].tap()
        XCTAssertTrue(app.staticTexts["No habits yet"].waitForExistence(timeout: 5))
    }

    func testCreateCheckAndUncheckHabit() {
        let app = launch()
        app.buttons["createFirstHabit"].tap()
        app.textFields["habitName"].tap()
        app.textFields["habitName"].typeText("Walk")
        app.buttons["saveHabit"].tap()
        let check = app.buttons["check-Walk"]
        XCTAssertTrue(check.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["addHabit"].exists)
        XCTAssertTrue(app.staticTexts["To do"].exists)
        check.tap()
        XCTAssertTrue(app.staticTexts["All done for today"].waitForExistence(timeout: 5))
        XCTAssertEqual(check.label, "Mark Walk incomplete")
        check.tap()
        XCTAssertTrue(app.staticTexts["0 of 1 complete"].waitForExistence(timeout: 5))
        XCTAssertEqual(check.label, "Mark Walk complete")
    }

    func testCheckboxRenameAndUnchangedDraft() {
        let app = launch()
        app.buttons["createFirstHabit"].tap()
        let name = app.textFields["habitName"]
        name.tap(); name.typeText("Walk")
        app.buttons["saveHabit"].tap()
        XCTAssertTrue(app.buttons["check-Walk"].waitForExistence(timeout: 5))
        app.buttons["check-Walk"].press(forDuration: 1)
        app.buttons["View history"].tap()
        app.buttons["Habit options"].tap()
        app.buttons["Edit habit"].tap()
        XCTAssertTrue(app.navigationBars["Edit habit"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Track with"].exists)
        XCTAssertFalse(app.staticTexts["Make it measurable"].exists)
        XCTAssertFalse(app.textFields["habitTarget"].exists)
        XCTAssertFalse(app.buttons["saveHabit"].isEnabled)
        name.tap(); name.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 4))
        XCTAssertTrue(app.staticTexts["Give your habit a name."].exists)
        XCTAssertFalse(app.buttons["saveHabit"].isEnabled)
        name.typeText("Walk outside")
        app.buttons["saveHabit"].tap()
        XCTAssertTrue(app.navigationBars["Walk outside"].waitForExistence(timeout: 5))
    }

    func testNumericHabitAndProgress() {
        let app = launch()
        app.buttons["createFirstHabit"].tap()
        app.textFields["habitName"].tap()
        app.textFields["habitName"].typeText("Read")
        app.segmentedControls.buttons["Number"].tap()
        app.textFields["habitTarget"].tap()
        app.textFields["habitTarget"].typeText("20")
        app.textFields["habitUnit"].tap()
        app.textFields["habitUnit"].typeText("pages")
        app.buttons["saveHabit"].tap()
        let entry = app.buttons["entry-Read"]
        let increment = app.buttons["Add one to Read"]
        XCTAssertTrue(increment.waitForExistence(timeout: 5))
        increment.tap()
        XCTAssertTrue(entry.waitForExistence(timeout: 5))
        let updated = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == '1 of 20 pages'"), object: entry)
        XCTAssertEqual(XCTWaiter.wait(for: [updated], timeout: 5), .completed)
        XCTAssertFalse(app.navigationBars["Daily total"].exists)
        entry.tap()
        let total = app.textFields["dailyTotal"]
        total.tap()
        total.typeText(XCUIKeyboardKey.delete.rawValue + "20")
        app.buttons["saveEntry"].tap()
        XCTAssertTrue(app.staticTexts["All done for today"].waitForExistence(timeout: 5))
        let completed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == '20 of 20 pages, completed'"), object: entry)
        XCTAssertEqual(XCTWaiter.wait(for: [completed], timeout: 5), .completed)
        XCTAssertFalse(increment.exists)
        entry.tap()
        XCTAssertTrue(total.waitForExistence(timeout: 5))
        XCTAssertEqual(total.value as? String, "20")
        app.buttons["Cancel"].tap()
        app.segmentedControls.buttons["Progress"].tap()
        XCTAssertTrue(app.navigationBars["Habits"].exists)
        XCTAssertTrue(app.buttons["addHabit"].exists)
        XCTAssertTrue(app.staticTexts["Activity"].exists)
        XCTAssertTrue(app.buttons["chooseHistoryDate"].exists)
    }

    func testHistoricalEntryCanBeCorrected() {
        let app = launch(history: true)
        capture("Today with habits")
        app.segmentedControls.buttons["Progress"].tap()
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let yesterday = calendar.date(byAdding: .day, value: -1, to: .now)!
        let components = calendar.dateComponents([.year, .month, .day], from: yesterday)
        if components.month != calendar.component(.month, from: .now) {
            app.buttons["Previous month"].tap()
        }
        let date = String(format: "%04d-%02d-%02d", components.year!, components.month!, components.day!)
        let square = app.buttons["day-\(date)"]
        XCTAssertTrue(square.waitForExistence(timeout: 5))
        reveal(square, in: app)
        XCTAssertGreaterThanOrEqual(square.frame.width, 44)
        XCTAssertGreaterThanOrEqual(square.frame.height, 44)
        capture("Overall progress")
        square.tap()
        capture("After choosing a square")
        let toggle = app.switches["history-Move your body"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        let before = toggle.value as? String
        // SwiftUI exposes the labelled row and its UISwitch separately.
        let control = toggle.switches.firstMatch
        if control.exists { control.tap() } else { toggle.tap() }
        capture("Corrected daily entries")
        XCTAssertNotEqual(toggle.value as? String, before)
        app.buttons["Done"].tap()
        square.tap()
        XCTAssertNotEqual(app.switches["history-Move your body"].value as? String, before)
    }

    func testDateChooserAndIndividualProgress() {
        let app = launch(history: true)
        app.segmentedControls.buttons["Progress"].tap()
        let chooseDate = app.buttons["chooseHistoryDate"]
        reveal(chooseDate, in: app)
        chooseDate.tap()
        XCTAssertTrue(app.datePickers["historyDatePicker"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.switches["history-Move your body"].exists)
        app.buttons["Done"].tap()
        app.swipeUp()
        app.buttons["detail-Read a little"].tap()
        XCTAssertTrue(app.navigationBars["Read a little"].waitForExistence(timeout: 5))
        capture("Individual progress")
        reveal(chooseDate, in: app)
        chooseDate.tap()
        XCTAssertTrue(app.buttons["history-Read a little"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.switches["history-Move your body"].exists)
    }

    func testMonthNavigationKeepsCurrentMonthBounded() {
        let app = launch(history: true)
        app.segmentedControls.buttons["Progress"].tap()
        let month = app.staticTexts["activityMonth"]
        XCTAssertTrue(month.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["addHabit"].isHittable)
        XCTAssertTrue(app.navigationBars.buttons["BackButton"].isHittable)
        let initialMonth = month.label
        let previous = app.buttons["Previous month"]
        let next = app.buttons["Next month"]
        XCTAssertTrue(previous.isEnabled)
        XCTAssertFalse(next.isEnabled)
        previous.tap()
        let changed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label != %@", initialMonth), object: month)
        XCTAssertEqual(XCTWaiter.wait(for: [changed], timeout: 5), .completed)
        XCTAssertTrue(next.isEnabled)
        next.tap()
        let restored = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", initialMonth), object: month)
        XCTAssertEqual(XCTWaiter.wait(for: [restored], timeout: 5), .completed)
        XCTAssertFalse(next.isEnabled)
        app.buttons["addHabit"].tap()
        XCTAssertTrue(app.navigationBars["New habit"].waitForExistence(timeout: 5))
        app.buttons["Cancel"].tap()
        XCTAssertTrue(app.navigationBars["New habit"].waitForNonExistence(timeout: 5))
        capture("Habits progress overview")
    }

    func testLayoutsAndSettings() {
        let app = launch(history: true)
        capture("Today layout")
        let edit = app.buttons["entry-Read a little"]
        for _ in 0..<8 {
            if edit.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(edit.isHittable)
        capture("Habit row layout")
        edit.tap()
        XCTAssertTrue(app.textFields["dailyTotal"].waitForExistence(timeout: 5))
        app.buttons["Cancel"].tap()
        app.segmentedControls.buttons["Progress"].tap()
        let chooseDate = app.buttons["chooseHistoryDate"]
        for _ in 0..<8 {
            if chooseDate.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(chooseDate.isHittable)
        capture("Activity layout")
        chooseDate.tap()
        XCTAssertTrue(app.datePickers["historyDatePicker"].waitForExistence(timeout: 5))
        app.buttons["Done"].tap()
        app.tabBars.buttons["Profile"].tap()
        app.buttons["Habit reminders"].tap()
        XCTAssertTrue(app.switches["dailyReminder"].waitForExistence(timeout: 5))
        capture("Settings layout")
    }

    func testHabitLoggingAndHistoryAtAccessibilityTextSize() {
        let app = launch(history: true, accessibilityText: true)
        for appearance in ["Light", "Dark"] {
            app.tabBars.buttons["Profile"].tap()
            let picker = app.descendants(matching: .any).matching(identifier: "appearancePicker").firstMatch
            reveal(picker, in: app)
            picker.tap()
            app.buttons[appearance].tap()
            app.tabBars.buttons["Library"].tap()

            let entry = app.buttons["entry-Read a little"]
            reveal(entry, in: app)
            XCTAssertGreaterThanOrEqual(entry.frame.width, 44)
            XCTAssertGreaterThanOrEqual(entry.frame.height, 44)
            XCTAssertLessThanOrEqual(entry.frame.maxX, app.frame.maxX)
            entry.tap()
            XCTAssertTrue(app.textFields["dailyTotal"].waitForExistence(timeout: 5))
            app.buttons["Cancel"].tap()

            app.segmentedControls.buttons["Progress"].tap()
            let chooseDate = app.buttons["chooseHistoryDate"]
            reveal(chooseDate, in: app)
            XCTAssertGreaterThanOrEqual(chooseDate.frame.height, 44)
            capture("\(appearance) Habits at accessibility text size")
            chooseDate.tap()
            XCTAssertTrue(app.datePickers["historyDatePicker"].waitForExistence(timeout: 5))
            app.buttons["Done"].tap()
            app.segmentedControls.buttons["Today"].tap()
        }
    }

    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<10 {
            if element.exists && element.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(element.isHittable)
    }

    private func capture(_ name: String) {
        // Let native toolbar transitions finish before recording the layout.
        Thread.sleep(forTimeInterval: 0.5)
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
