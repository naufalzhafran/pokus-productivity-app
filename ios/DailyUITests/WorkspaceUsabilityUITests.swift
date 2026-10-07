import XCTest

@MainActor final class WorkspaceUsabilityUITests: XCTestCase {
    func testProjectRequiresTitleBeforeSaving() {
        let app = launchLibrary()
        app.buttons["Create"].tap()
        app.buttons["New project"].tap()
        XCTAssertTrue(app.navigationBars["New project"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Save"].isEnabled)

        let title = app.textFields["Title"]
        title.tap()
        title.typeText("   ")
        XCTAssertFalse(app.buttons["Save"].isEnabled)
        title.typeText("Reading plan")
        XCTAssertTrue(app.buttons["Save"].isEnabled)
        app.buttons["Save"].tap()
        XCTAssertTrue(app.navigationBars["New project"].waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Project saved"].waitForExistence(timeout: 5))
    }

    func testCaptureStageCanBeChangedAtLargestTextSize() {
        let app = launchLibrary(accessibilityText: true)
        reveal(app.buttons["libraryCaptures"], in: app)
        app.buttons["libraryCaptures"].tap()

        let stage = app.buttons["captureStage"]
        XCTAssertTrue(stage.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(stage.frame.height, 44)
        XCTAssertGreaterThanOrEqual(stage.frame.minX, app.frame.minX)
        XCTAssertLessThanOrEqual(stage.frame.maxX, app.frame.maxX)
        stage.tap()
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Capture stages at largest text size"
        attachment.lifetime = .keepAlways
        add(attachment)
        app.buttons["Inbox"].tap()
        XCTAssertTrue(app.staticTexts["No matching captures"].waitForExistence(timeout: 5))
        reveal(app.buttons["Clear search and filters"], in: app)
        app.buttons["Clear search and filters"].tap()
        XCTAssertTrue(app.buttons["Test capture"].waitForExistence(timeout: 5))
    }

    func testTaskActionsKeepCompletionAndDeletionSeparate() {
        let app = launchLibrary()
        reveal(app.buttons["Unassigned tasks"], in: app)
        app.buttons["Unassigned tasks"].tap()
        app.buttons["New task"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["New task"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Save"].isEnabled)
        XCTAssertFalse(app.staticTexts["Uses the project's deadline when available."].exists)
        let title = app.textFields["Title"]
        title.tap()
        title.typeText("Read a chapter")
        app.buttons["Save"].tap()

        let task = app.buttons["Read a chapter"]
        XCTAssertTrue(task.waitForExistence(timeout: 5))
        task.tap()
        let complete = app.buttons["Complete task"]
        XCTAssertTrue(complete.waitForExistence(timeout: 5))
        complete.tap()
        XCTAssertTrue(app.buttons["Reopen task"].waitForExistence(timeout: 5))
        app.buttons["Reopen task"].tap()
        XCTAssertTrue(complete.waitForExistence(timeout: 5))
        XCTAssertFalse(app.navigationBars.buttons["Delete task"].exists)
        reveal(app.buttons["Delete task"], in: app)
        app.buttons["Delete task"].tap()
        let confirmation = app.alerts["Delete this task?"]
        XCTAssertTrue(confirmation.waitForExistence(timeout: 5))
        confirmation.buttons["Cancel"].tap()
        XCTAssertTrue(app.buttons["Focus on this task"].isEnabled)
    }

    private func launchLibrary(accessibilityText: Bool = false) -> XCUIApplication {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-pokus"]
        if accessibilityText { app.launchArguments.append("-ui-testing-accessibility") }
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Library"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(app.navigationBars["Library"].waitForExistence(timeout: 10))
        return app
    }

    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        let list = app.collectionViews.firstMatch
        for _ in 0..<8 where !element.isHittable { list.swipeUp() }
        XCTAssertTrue(element.isHittable)
    }
}
