import XCTest

@MainActor final class NativeUsabilityUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    func testEmptyTodayOffersWorkingDestinations() {
        let app = launch(signedIn: true)
        app.tabBars.buttons["Today"].tap()
        let unscheduled = app.buttons["todayUnscheduled"]
        XCTAssertTrue(unscheduled.waitForExistence(timeout: 10))
        unscheduled.tap()
        XCTAssertTrue(app.navigationBars["Unscheduled"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Test project"].waitForExistence(timeout: 5))
        app.navigationBars.buttons["BackButton"].tap()
        app.buttons["todayBrowseHabits"].tap()
        XCTAssertTrue(app.navigationBars["Habits"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["createFirstHabit"].waitForExistence(timeout: 5))
    }

    func testSignInErrorProvidesFullDetailsAndRelevantRecovery() {
        for accessibilityText in [false, true] {
            verifySignInRecovery(accessibilityText: accessibilityText)
        }
    }

    private func verifySignInRecovery(accessibilityText: Bool) {
        let app = launch(signedIn: false, accessibilityText: accessibilityText)
        let signIn = app.buttons["Continue with Google"]
        XCTAssertTrue(signIn.waitForExistence(timeout: 5))
        revealSignIn(signIn, in: app)
        signIn.tap()
        let recovery = app.buttons["recoverAppError"]
        XCTAssertTrue(recovery.waitForExistence(timeout: 5))
        XCTAssertEqual(recovery.label, "Sign in again")
        // Accessibility frame conversions can return 43.999999999999986 for 44 points.
        for button in [recovery, app.buttons["Details"], app.buttons["Dismiss"]] {
            XCTAssertGreaterThanOrEqual(button.frame.height + 0.01, 44)
            XCTAssertTrue(button.isHittable)
            XCTAssertGreaterThanOrEqual(button.frame.minX, app.frame.minX)
            XCTAssertLessThanOrEqual(button.frame.maxX, app.frame.maxX)
        }
        revealSignIn(signIn, in: app)
        capture(accessibilityText ? "Sign-in recovery at AX5" : "Sign-in recovery")
        app.buttons["Details"].tap()
        let alert = app.alerts["Couldn't complete the action"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        XCTAssertTrue(alert.staticTexts["Google sign-in is disabled in UI tests."].exists)
        alert.buttons["OK"].tap()
        recovery.tap()
        XCTAssertTrue(recovery.exists)
        app.buttons["Dismiss"].tap()
        XCTAssertTrue(recovery.waitForNonExistence(timeout: 5))
    }

    private func revealSignIn(_ signIn: XCUIElement, in app: XCUIApplication) {
        let scroll = app.scrollViews["signedOutFocus"]
        for _ in 0..<8 where !signIn.isHittable { scroll.swipeUp() }
        XCTAssertTrue(signIn.isHittable)
    }

    func testHabitReminderShowsTimeOnlyWhenEnabled() {
        let app = launch(signedIn: true)
        app.tabBars.buttons["Profile"].tap()
        let reminders = app.buttons["Habit reminders"]
        for _ in 0..<6 {
            if reminders.exists && reminders.isHittable { break }
            app.swipeUp()
        }
        reminders.tap()
        let toggle = app.switches["dailyReminder"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        let time = app.descendants(matching: .any)["habitReminderTime"].firstMatch
        XCTAssertFalse(time.exists)
        let control = toggle.switches.firstMatch
        if control.exists { control.tap() } else { toggle.tap() }
        XCTAssertTrue(time.waitForExistence(timeout: 5))
        XCTAssertEqual(toggle.value as? String, "1")
        capture("Enabled habit reminder")
        if control.exists { control.tap() } else { toggle.tap() }
        XCTAssertTrue(time.waitForNonExistence(timeout: 5))
        XCTAssertEqual(toggle.value as? String, "0")
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func launch(signedIn: Bool, accessibilityText: Bool = false) -> XCUIApplication {
        XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"] + (signedIn ? ["-ui-testing-pokus"] : [])
        if accessibilityText { app.launchArguments.append("-ui-testing-accessibility") }
        app.launch()
        XCTAssertTrue(app.navigationBars["Focus"].waitForExistence(timeout: 10))
        if signedIn { XCTAssertTrue(app.buttons["startFocus"].waitForExistence(timeout: 10)) }
        return app
    }
}
