import XCTest

@MainActor final class ProfileUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testProfileDestinationsAndDataMaintenance() {
        let app = launchProfile(replica: true)
        capture("Profile", in: app)

        tap(app.buttons["Session history"], in: app, list: "profileList")
        XCTAssertTrue(app.navigationBars["Focus history"].waitForExistence(timeout: 5))
        app.navigationBars.buttons["BackButton"].tap()

        tap(app.buttons["Habit reminders"], in: app, list: "profileList")
        XCTAssertTrue(app.navigationBars["Habit reminders"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.switches["dailyReminder"].exists)
        app.navigationBars.buttons["BackButton"].tap()

        reveal(app.buttons["Sign out"], in: app, list: "profileList")
        for title in ["Sync now", "Free up space", "Re-download data", "Discard change"] {
            XCTAssertFalse(app.buttons[title].exists, "\(title) belongs in Data & sync")
        }
        tap(app.buttons["profileDataSync"], in: app, list: "profileList")
        XCTAssertTrue(app.navigationBars["Data & sync"].waitForExistence(timeout: 5))
        XCTAssertTrue(list("profileDataSyncList", in: app).waitForExistence(timeout: 5))
        reveal(app.buttons["Sync now"], in: app, list: "profileDataSyncList")
        capture("Data & sync", in: app)

        reveal(app.buttons["Free up space"], in: app, list: "profileDataSyncList")
        XCTAssertTrue(app.buttons["Free up space"].isEnabled)
        tap(app.buttons["Re-download data"], in: app, list: "profileDataSyncList")
        let alert = app.alerts["Re-download your data?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        XCTAssertTrue(alert.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'kept'")).firstMatch.exists)
        alert.buttons["Cancel"].tap()
        XCTAssertTrue(alert.waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.navigationBars["Data & sync"].exists)
    }

    func testSignOutExplainsSavedChangesAndCancelKeepsAccount() {
        let app = launchProfile()
        tap(app.buttons["Sign out"], in: app, list: "profileList")
        let alert = app.alerts["Sign out of Pokus?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        let safetyMessage = alert.staticTexts.matching(NSPredicate(
            format: "label CONTAINS[c] 'changes' AND label CONTAINS[c] 'saved'"
        )).firstMatch
        XCTAssertTrue(safetyMessage.exists)
        alert.buttons["Cancel"].tap()
        XCTAssertTrue(alert.waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Sign out"].isEnabled)

        tap(app.buttons["Session history"], in: app, list: "profileList")
        XCTAssertTrue(app.navigationBars["Focus history"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Continue with Google"].exists)
    }

    func testSignedOutProfileKeepsPreferencesAndGuardsAccountFeatures() {
        let app = launchProfile(signedIn: false)
        XCTAssertTrue(app.buttons["Continue with Google"].waitForExistence(timeout: 5))
        reveal(app.buttons["Habit reminders"], in: app, list: "profileList")
        XCTAssertFalse(app.buttons["Habit reminders"].isEnabled)
        XCTAssertFalse(app.buttons["Session history"].exists)
        XCTAssertFalse(app.buttons["profileDataSync"].exists)
        XCTAssertFalse(app.buttons["Sign out"].exists)

        selectAppearance("Dark", in: app)
        reveal(app.buttons["Open notification settings"], in: app, list: "profileList")
        XCTAssertTrue(app.buttons["Open notification settings"].isEnabled)
        capture("Signed-out profile", in: app)
    }

    func testProfileControlsRemainReachableAtLargestTextSizeInBothAppearances() {
        let app = launchProfile(accessibilityText: true)
        for appearance in ["Light", "Dark"] {
            selectAppearance(appearance, in: app)
            for control in [app.buttons["Session history"], app.buttons["Habit reminders"],
                            app.buttons["Open notification settings"], app.buttons["profileDataSync"],
                            app.buttons["Sign out"]] {
                reveal(control, in: app, list: "profileList")
                XCTAssertGreaterThanOrEqual(control.frame.height, 44)
                XCTAssertGreaterThanOrEqual(control.frame.width, 44)
                XCTAssertGreaterThanOrEqual(control.frame.minX, app.frame.minX)
                XCTAssertLessThanOrEqual(control.frame.maxX, app.frame.maxX)
            }
            reveal(app.buttons["Session history"], in: app, list: "profileList")
            capture("\(appearance) Profile at AX5", in: app)
            tap(app.buttons["profileDataSync"], in: app, list: "profileList")
            XCTAssertTrue(app.navigationBars["Data & sync"].waitForExistence(timeout: 5))
            reveal(app.buttons["Sync now"], in: app, list: "profileDataSyncList")
            capture("\(appearance) Data & sync at AX5", in: app)
            app.navigationBars.buttons["BackButton"].tap()
        }
        selectAppearance("System", in: app)
    }

    private func launchProfile(signedIn: Bool = true, replica: Bool = false,
                               accessibilityText: Bool = false) -> XCUIApplication {
        XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        if signedIn { app.launchArguments.append("-ui-testing-pokus") }
        if replica { app.launchArguments.append("-ui-testing-replica") }
        if accessibilityText { app.launchArguments.append("-ui-testing-accessibility") }
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Profile"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Profile"].tap()
        XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 5))
        XCTAssertTrue(list("profileList", in: app).waitForExistence(timeout: 5))
        if signedIn {
            XCTAssertTrue(app.staticTexts["Test account"].waitForExistence(timeout: 10))
        }
        return app
    }

    private func selectAppearance(_ appearance: String, in app: XCUIApplication) {
        let picker = app.descendants(matching: .any).matching(identifier: "appearancePicker").firstMatch
        tap(picker, in: app, list: "profileList")
        let option = app.buttons[appearance]
        XCTAssertTrue(option.waitForExistence(timeout: 5))
        option.tap()
        let selected = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            (picker.value as? String) == appearance || picker.label.contains(appearance)
        }, object: picker)
        XCTAssertEqual(XCTWaiter.wait(for: [selected], timeout: 5), .completed)
    }

    private func list(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }

    private func tap(_ element: XCUIElement, in app: XCUIApplication, list identifier: String,
                     file: StaticString = #filePath, line: UInt = #line) {
        reveal(element, in: app, list: identifier, file: file, line: line)
        element.tap()
    }

    private func reveal(_ element: XCUIElement, in app: XCUIApplication, list identifier: String,
                        file: StaticString = #filePath, line: UInt = #line) {
        let scrollView = list(identifier, in: app)
        XCTAssertTrue(scrollView.waitForExistence(timeout: 5), file: file, line: line)
        for attempt in 0..<16 {
            if element.exists && element.isHittable { break }
            let top = max(scrollView.frame.minY, app.navigationBars.firstMatch.frame.maxY)
            let bottom = min(scrollView.frame.maxY, app.tabBars.firstMatch.frame.minY)
            let towardLater: Bool
            if element.exists && !element.frame.isEmpty {
                towardLater = element.frame.minY >= top && element.frame.midY > (top + bottom) / 2
            } else {
                towardLater = attempt < 8
            }
            scrollView.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: towardLater ? 0.7 : 0.3))
                .press(forDuration: 0.1, thenDragTo: scrollView.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: towardLater ? 0.3 : 0.7)))
        }
        XCTAssertTrue(element.isHittable, file: file, line: line)
    }

    private func capture(_ title: String, in app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = title
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
