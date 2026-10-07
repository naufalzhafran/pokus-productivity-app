import XCTest

@MainActor final class TimerTaskContextUITests: XCTestCase {
    func testLinkedTaskStaysVisibleThroughCompactFocusAndCompletion() {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-pokus", "-ui-testing-calendar"]
        app.launch()
        defer {
            XCUIDevice.shared.orientation = .portrait
            app.terminate()
        }

        XCTAssertTrue(app.tabBars.buttons["Library"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Library"].tap()
        tap(app.buttons["libraryProjects"], in: app)
        tap(app.buttons["Test project"], in: app)
        tap(app.buttons["Calendar inherited task"], in: app)
        tap(app.buttons["Focus on this task"], in: app)

        let start = app.buttons["startFocus"]
        XCTAssertTrue(start.waitForExistence(timeout: 5))
        let permissions = addUIInterruptionMonitor(withDescription: "Notification permission") { alert in
            guard alert.buttons["Allow"].exists else { return false }
            alert.buttons["Allow"].tap()
            return true
        }
        defer { removeUIInterruptionMonitor(permissions) }
        start.tap()
        app.tap()
        XCTAssertTrue(app.buttons["Pause"].waitForExistence(timeout: 5))
        XCUIDevice.shared.orientation = .landscapeLeft
        let landscape = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            app.frame.width > app.frame.height
        }, object: app)
        XCTAssertEqual(XCTWaiter.wait(for: [landscape], timeout: 5), .completed)

        let taskTitle = app.staticTexts["focusTaskTitle"]
        XCTAssertTrue(taskTitle.waitForExistence(timeout: 5))
        XCTAssertEqual(taskTitle.label, "Calendar inherited task")
        XCTAssertTrue(taskTitle.isHittable)
        XCTAssertTrue(app.frame.contains(taskTitle.frame))
        app.buttons["Pause"].tap()
        XCTAssertTrue(app.buttons["Resume"].waitForExistence(timeout: 5))
        XCTAssertTrue(taskTitle.isHittable)

        app.buttons["Stop"].tap()
        let confirmation = app.alerts["Stop this focus session?"]
        XCTAssertTrue(confirmation.waitForExistence(timeout: 5))
        confirmation.buttons["Save elapsed time"].tap()
        XCTAssertTrue(app.buttons["Focus again"].waitForExistence(timeout: 5))
        XCTAssertTrue(taskTitle.isHittable)
        app.buttons["Mark task complete"].tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "focusTaskCompleted").firstMatch.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Mark task complete"].exists)
        XCTAssertTrue(taskTitle.isHittable)
    }

    private func tap(_ element: XCUIElement, in app: XCUIApplication,
                     file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(element.waitForExistence(timeout: 5), file: file, line: line)
        for _ in 0..<5 {
            if element.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(element.isHittable, file: file, line: line)
        element.tap()
    }
}
