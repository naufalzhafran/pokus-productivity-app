import XCTest

@MainActor final class DailyUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    private func launch(history: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-local-habits"] + (history ? ["-ui-testing-history"] : [])
        app.launch()
        app.tabBars.buttons["Library"].tap()
        app.buttons["libraryHabits"].tap()
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
        XCTAssertTrue(app.staticTexts["1 habit remaining"].waitForExistence(timeout: 5))
        XCTAssertEqual(check.label, "Mark Walk complete")
    }

    func testCheckboxRenameAndUnchangedDraft() {
        let app = launch()
        app.buttons["createFirstHabit"].tap()
        let name = app.textFields["habitName"]
        name.tap(); name.typeText("Walk")
        app.buttons["saveHabit"].tap()
        XCTAssertTrue(app.buttons["check-Walk"].waitForExistence(timeout: 5))
        app.buttons["Walk, view progress"].tap()
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
        app.buttons["entry-Read"].tap()
        let total = app.textFields["dailyTotal"]
        total.tap()
        total.typeText(XCUIKeyboardKey.delete.rawValue + "20")
        app.buttons["saveEntry"].tap()
        XCTAssertTrue(app.staticTexts["All your habits are complete."].waitForExistence(timeout: 5))
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
        let date = String(format: "%04d-%02d-%02d", components.year!, components.month!, components.day!)
        let square = app.buttons["day-\(date)"]
        XCTAssertTrue(square.waitForExistence(timeout: 5))
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
        app.buttons["chooseHistoryDate"].tap()
        XCTAssertTrue(app.datePickers["historyDatePicker"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.switches["history-Move your body"].exists)
        app.buttons["Done"].tap()
        app.swipeUp()
        app.buttons["detail-Read a little"].tap()
        XCTAssertTrue(app.navigationBars["Read a little"].waitForExistence(timeout: 5))
        capture("Individual progress")
        app.buttons["chooseHistoryDate"].tap()
        XCTAssertTrue(app.buttons["history-Read a little"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.switches["history-Move your body"].exists)
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

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
