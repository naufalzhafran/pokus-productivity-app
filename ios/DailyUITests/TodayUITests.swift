import XCTest

@MainActor final class TodayUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    override func tearDown() async throws {
        await MainActor.run {
            let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            attachment.name = name
            attachment.lifetime = .keepAlways
            add(attachment)
        }
        try await super.tearDown()
    }

    func testNumericHabitQuickAddAndDailyTotalFromRow() {
        let app = launchToday()
        let entry = app.buttons["entry-Calendar pages"]
        assertProgress("2 of 5 pages", entry: entry)

        tapInAgenda(app.buttons["Add one to Calendar pages"], in: app)
        assertProgress("3 of 5 pages", entry: entry)
        XCTAssertFalse(app.navigationBars["Daily total"].exists)

        tapInAgenda(entry, in: app)
        XCTAssertTrue(app.navigationBars["Daily total"].waitForExistence(timeout: 5))
        let total = app.textFields["dailyTotal"]
        XCTAssertTrue(total.waitForExistence(timeout: 5))
        XCTAssertEqual(total.value as? String, "3")
        total.tap()
        total.typeText(XCUIKeyboardKey.delete.rawValue + "4")
        app.buttons["saveEntry"].tap()
        XCTAssertTrue(app.navigationBars["Daily total"].waitForNonExistence(timeout: 5))
        assertProgress("4 of 5 pages", entry: entry)

        tapInAgenda(entry, in: app)
        XCTAssertTrue(total.waitForExistence(timeout: 5))
        XCTAssertEqual(total.value as? String, "4")
        app.buttons["Cancel"].tap()
    }

    func testCheckboxRowCompletesAndReopensFromCompletedSection() {
        let app = launchToday()
        let check = app.buttons["check-Calendar check-in"]
        tapInAgenda(check, in: app)
        let completed = completedSection(count: 2, in: app)
        XCTAssertTrue(completed.waitForExistence(timeout: 5))
        XCTAssertTrue(check.waitForNonExistence(timeout: 5))

        tapInAgenda(completed, in: app)
        XCTAssertTrue(check.waitForExistence(timeout: 5))
        XCTAssertEqual(check.label, "Mark Calendar check-in incomplete")
        tapInAgenda(check, in: app)
        XCTAssertTrue(completedSection(count: 1, in: app).waitForExistence(timeout: 5))
        XCTAssertTrue(check.waitForExistence(timeout: 5))
        XCTAssertEqual(check.label, "Mark Calendar check-in complete")
    }

    func testHabitHistoryIsAvailableFromRowContextMenu() {
        let app = launchToday()
        let entry = app.buttons["entry-Calendar pages"]
        revealInAgenda(entry, in: app)
        entry.press(forDuration: 1)
        let history = app.buttons["View history"]
        XCTAssertTrue(history.waitForExistence(timeout: 5))
        history.tap()
        XCTAssertTrue(app.navigationBars["Calendar pages"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Habit options"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.navigationBars["Daily total"].exists)
    }

    func testTodayOptionsShowsReminderHelpAndExistingDestinations() {
        let app = launchToday()
        XCTAssertFalse(app.staticTexts["Web reminder changes reach iPhone alerts after this app next syncs."].exists)
        XCTAssertFalse(app.buttons["Calendar options"].exists)

        app.buttons["Today options"].tap()
        app.buttons["About reminder alerts"].tap()
        let alert = app.alerts["Reminder alerts"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        XCTAssertTrue(alert.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'sync'")).firstMatch.exists)
        alert.buttons["OK"].tap()
        XCTAssertTrue(alert.waitForNonExistence(timeout: 5))

        app.buttons["Today options"].tap()
        app.buttons["Unscheduled"].tap()
        XCTAssertTrue(app.navigationBars["Unscheduled"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Set date"].firstMatch.waitForExistence(timeout: 5))
        app.navigationBars.buttons["BackButton"].tap()

        app.buttons["Today options"].tap()
        app.buttons["Habits"].tap()
        XCTAssertTrue(app.navigationBars["Habits"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tabBars.buttons["Library"].isSelected)
    }

    func testHabitControlsRemainReachableAtLargestTextSizeInBothAppearances() {
        let app = launchToday(accessibilityText: true)
        let entry = app.buttons["entry-Calendar pages"]
        let increment = app.buttons["Add one to Calendar pages"]
        for (index, appearance) in ["Light", "Dark"].enumerated() {
            app.tabBars.buttons["Profile"].tap()
            let picker = app.descendants(matching: .any).matching(identifier: "appearancePicker").firstMatch
            for _ in 0..<8 {
                if picker.exists && picker.isHittable { break }
                app.swipeUp()
            }
            XCTAssertTrue(picker.isHittable)
            picker.tap()
            app.buttons[appearance].tap()
            app.tabBars.buttons["Today"].tap()

            for control in [app.buttons["check-Calendar check-in"], entry, increment] {
                revealInAgenda(control, in: app)
                XCTAssertGreaterThanOrEqual(control.frame.width, 44)
                XCTAssertGreaterThanOrEqual(control.frame.height, 44)
                XCTAssertGreaterThanOrEqual(control.frame.minX, app.frame.minX)
                XCTAssertLessThanOrEqual(control.frame.maxX, app.frame.maxX)
            }
            increment.tap()
            revealInAgenda(entry, in: app)
            assertProgress("\(index + 3) of 5 pages", entry: entry)
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.name = "\(appearance) Today at AX5"
            attachment.lifetime = .keepAlways
            add(attachment)
            entry.tap()
            XCTAssertTrue(app.textFields["dailyTotal"].waitForExistence(timeout: 5))
            app.buttons["Cancel"].tap()
        }
    }

    private func launchToday(accessibilityText: Bool = false) -> XCUIApplication {
        XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-pokus", "-ui-testing-calendar"]
        if accessibilityText { app.launchArguments.append("-ui-testing-accessibility") }
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Today"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Today"].tap()
        XCTAssertTrue(app.navigationBars["Today"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.collectionViews["calendarAgenda"].waitForExistence(timeout: 10))
        revealInAgenda(app.buttons["entry-Calendar pages"], in: app)
        return app
    }

    private func completedSection(count: Int, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Completed (\(count))")).firstMatch
    }

    private func assertProgress(_ progress: String, entry: XCUIElement,
                                file: StaticString = #filePath, line: UInt = #line) {
        let predicate = NSPredicate(format: "value == %@", progress)
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: entry)
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: 5), .completed, file: file, line: line)
    }

    private func tapInAgenda(_ element: XCUIElement, in app: XCUIApplication,
                             file: StaticString = #filePath, line: UInt = #line) {
        revealInAgenda(element, in: app, file: file, line: line)
        element.tap()
    }

    private func revealInAgenda(_ element: XCUIElement, in app: XCUIApplication,
                                file: StaticString = #filePath, line: UInt = #line) {
        let list = app.collectionViews["calendarAgenda"]
        XCTAssertTrue(list.waitForExistence(timeout: 5), file: file, line: line)
        for attempt in 0..<12 {
            if element.exists && element.isHittable { break }
            let top = max(list.frame.minY, app.navigationBars.firstMatch.frame.maxY)
            let bottom = min(list.frame.maxY, app.tabBars.firstMatch.frame.minY)
            let towardLater: Bool
            if element.exists && !element.frame.isEmpty {
                if element.frame.minY < top { towardLater = false }
                else if element.frame.maxY > bottom { towardLater = true }
                else { towardLater = element.frame.midY > (top + bottom) / 2 }
            } else {
                // Search both directions when a virtualized row has no usable frame.
                towardLater = attempt < 4
            }
            let start = towardLater ? 0.7 : 0.3
            let end = towardLater ? 0.3 : 0.7
            list.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: start))
                .press(forDuration: 0.1, thenDragTo: list.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: end)))
        }
        XCTAssertTrue(element.isHittable, file: file, line: line)
    }
}
