import XCTest

@MainActor final class EditorUXUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testCapturePlainTextEditsCanRestoreTheOriginalNote() {
        let app = launchLibrary()
        app.buttons["libraryCaptures"].tap()
        XCTAssertTrue(app.buttons["Test capture"].waitForExistence(timeout: 5))
        app.buttons["Test capture"].tap()
        app.buttons["Capture actions"].tap()
        app.buttons["Edit capture"].tap()
        XCTAssertTrue(app.navigationBars["Edit capture"].waitForExistence(timeout: 5))

        restoreOriginalText(in: app, editor: "Capture note", action: "Restore original note",
                            alert: "Restore the original note?", original: "Source notes")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.navigationBars["Capture"].waitForExistence(timeout: 5))
        reveal(app.staticTexts["Source notes"], in: app)
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Temporary changes'")).firstMatch.exists)
    }

    func testNotePlainTextEditsCanRestoreTheOriginalBody() {
        let app = launchLibrary()
        app.buttons["libraryNotes"].tap()
        XCTAssertTrue(app.buttons["Test knowledge"].waitForExistence(timeout: 5))
        app.buttons["Test knowledge"].tap()
        app.buttons["Edit note"].tap()
        XCTAssertTrue(app.navigationBars["Edit note"].waitForExistence(timeout: 5))

        restoreOriginalText(in: app, editor: "Note body", action: "Restore original body",
                            alert: "Restore the original body?", original: "Knowledge body")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.navigationBars["Note"].waitForExistence(timeout: 5))
        reveal(app.staticTexts["Knowledge body"], in: app)
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Temporary changes'")).firstMatch.exists)
        XCTAssertTrue(app.buttons["Test capture"].exists)
    }

    private func launchLibrary() -> XCUIApplication {
        XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-pokus"]
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Library"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Library"].tap()
        return app
    }

    private func restoreOriginalText(in app: XCUIApplication, editor label: String, action: String,
                                     alert title: String, original: String) {
        let edit = app.buttons["Edit as plain text"]
        reveal(edit, in: app)
        edit.tap()
        let editor = app.textViews[label]
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        editor.tap()
        editor.typeText(" Temporary changes")
        app.buttons["keyboardDone"].tap()
        let restore = app.buttons[action]
        reveal(restore, in: app)
        restore.tap()
        let alert = app.alerts[title]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        alert.buttons["Keep editing"].tap()
        XCTAssertTrue((editor.value as? String ?? "").contains("Temporary changes"))
        restore.tap()
        alert.buttons["Restore original"].tap()
        XCTAssertTrue(editor.waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts[original].exists)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Restored \(label.lowercased())"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func reveal(_ element: XCUIElement, in app: XCUIApplication,
                        file: StaticString = #filePath, line: UInt = #line) {
        for _ in 0..<10 {
            if element.exists && element.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(element.isHittable, file: file, line: line)
    }
}
