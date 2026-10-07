import XCTest

@MainActor final class PokusUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
    }
    override func tearDown() async throws {
        await MainActor.run {
            let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
        }
        try await super.tearDown()
    }
    func testCalendarMonthNavigationAndUnscheduledDateAssignment() {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-pokus", "-ui-testing-calendar"]
        app.launch()
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(app.buttons["libraryCaptures"].waitForExistence(timeout: 10))
        tapAfterScrolling(app.buttons["libraryCalendar"], in: app)
        XCTAssertTrue(app.navigationBars["Calendar"].waitForExistence(timeout: 10))
        let calendar = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); calendar.name = "Calendar month"; calendar.lifetime = .keepAlways; add(calendar)
        app.buttons["Next month"].tap()
        let futureDay = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendarDay-'")).element(boundBy: 10)
        futureDay.tap()
        let futureCheck = app.buttons["check-Calendar check-in"]
        for _ in 0..<5 where !futureCheck.exists { app.collectionViews.firstMatch.swipeUp() }
        XCTAssertTrue(futureCheck.waitForExistence(timeout: 5))
        XCTAssertFalse(futureCheck.isEnabled)
        app.buttons["calendarToday"].tap()
        app.buttons["Calendar options"].tap()
        app.buttons["Unscheduled"].tap()
        XCTAssertTrue(app.navigationBars["Unscheduled"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Set date"].firstMatch.waitForExistence(timeout: 5))
        app.buttons["Set date"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Edit project"].waitForExistence(timeout: 5))
        app.buttons["Optional details"].tap()
        app.switches["Due date"].coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
        XCTAssertEqual(app.switches["Due date"].value as? String, "1")
        let dated = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); dated.name = "Project date before save"; dated.lifetime = .keepAlways; add(dated)
        app.buttons["Save"].tap()
        XCTAssertTrue(app.staticTexts["All projects have a date"].waitForExistence(timeout: 5))
        app.navigationBars.buttons["BackButton"].tap()
        let inherited = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'From project'")).firstMatch
        for _ in 0..<5 where !inherited.exists { app.collectionViews.firstMatch.swipeUp() }
        XCTAssertTrue(inherited.waitForExistence(timeout: 5))
        let check = app.buttons["check-Calendar check-in"]
        tapCalendarControl(check, in: app)
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Completed (2)'")).firstMatch.waitForExistence(timeout: 5))
        tapCalendarControl(app.buttons["Add one to Calendar pages"], in: app)
        XCTAssertTrue(app.staticTexts["3 of 5 pages"].waitForExistence(timeout: 5))
        let agenda = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); agenda.name = "Calendar agenda"; agenda.lifetime = .keepAlways; add(agenda)
        app.tabBars.buttons["Today"].tap()
        XCTAssertTrue(app.navigationBars["Today"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["calendarToday"].exists)
        let todayEntry = app.buttons["entry-Calendar pages"]
        XCTAssertTrue(todayEntry.waitForExistence(timeout: 5))
        XCTAssertEqual(todayEntry.value as? String, "3 of 5 pages")
        let today = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); today.name = "Today agenda"; today.lifetime = .keepAlways; add(today)
        app.buttons["Today options"].tap()
        app.buttons["Habits"].tap()
        XCTAssertTrue(app.navigationBars["Habits"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tabBars.buttons["Library"].isSelected)
    }

    func testCaptureReminderCompletionAndRemoval() {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-pokus"]
        app.launch()
        app.tabBars.buttons["Library"].tap()
        app.buttons["libraryCaptures"].tap()
        XCTAssertTrue(app.buttons["Test capture"].waitForExistence(timeout: 5))
        app.buttons["Test capture"].tap()
        let add = app.buttons["Add reminder"]
        tapAfterScrolling(add, in: app)
        XCTAssertTrue(app.navigationBars["Add reminder"].waitForExistence(timeout: 5))
        app.buttons["Save"].tap()
        XCTAssertTrue(app.buttons["Complete reminder"].waitForExistence(timeout: 5))
        app.buttons["Complete reminder"].tap()
        XCTAssertTrue(app.buttons["Reopen reminder"].waitForExistence(timeout: 5))
        app.buttons["Reopen reminder"].tap()
        XCTAssertTrue(app.buttons["Complete reminder"].waitForExistence(timeout: 5))
        app.buttons["Remove reminder"].tap()
        XCTAssertTrue(add.waitForExistence(timeout: 5))
    }
    func testCachedLibraryAndCaptureSurviveOfflineRelaunch() {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-pokus"]
        app.launch()
        app.tabBars.buttons["Library"].tap()
        app.buttons["libraryCaptures"].tap()
        XCTAssertTrue(app.buttons["Test capture"].waitForExistence(timeout: 5))
        app.buttons["Test capture"].tap()
        XCTAssertTrue(app.staticTexts["Source notes"].waitForExistence(timeout: 5))
        app.terminate()
        app.launchArguments = ["-ui-testing", "-ui-testing-pokus", "-ui-testing-keep-cache", "-ui-testing-offline-library"]
        app.launch()
        app.tabBars.buttons["Library"].tap()
        app.buttons["libraryCaptures"].tap()
        XCTAssertTrue(app.buttons["Test capture"].waitForExistence(timeout: 2))
        app.buttons["Test capture"].tap()
        XCTAssertTrue(app.staticTexts["Source notes"].waitForExistence(timeout: 2))
    }
    func testReopeningLoadedCaptureDoesNotRepeatSlowRead() {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-pokus", "-ui-testing-delay-library"]
        app.launch()
        app.tabBars.buttons["Library"].tap()
        app.buttons["libraryCaptures"].tap()
        XCTAssertTrue(app.buttons["Test capture"].waitForExistence(timeout: 15))
        app.buttons["Test capture"].tap()
        XCTAssertTrue(app.staticTexts["Source notes"].waitForExistence(timeout: 15))
        app.navigationBars.buttons["BackButton"].tap()
        app.buttons["Test capture"].tap()
        XCTAssertTrue(app.staticTexts["Source notes"].waitForExistence(timeout: 2),
                      "Reopening the same capture should reuse its loaded detail instead of waiting for another ten-second read.")
    }
    func testLibraryCaptureAndKnowledgeEditorsAndReview() {
        let app = XCUIApplication(); app.launchArguments = ["-ui-testing", "-ui-testing-pokus"]; app.launch()
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(app.navigationBars["Library"].waitForExistence(timeout: 10))
        app.buttons["libraryCaptures"].tap()
        XCTAssertTrue(app.buttons["Test capture"].waitForExistence(timeout: 5))
        app.buttons["Test capture"].tap()
        app.buttons["Capture actions"].tap()
        app.buttons["Edit capture"].tap()
        XCTAssertTrue(app.navigationBars["Edit capture"].waitForExistence(timeout: 5))
        let title = app.textFields["Title (optional)"]
        title.tap(); title.clearAndType("Updated capture")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.staticTexts["Updated capture"].waitForExistence(timeout: 5))
        app.navigationBars.buttons["BackButton"].tap()
        app.navigationBars.buttons["BackButton"].tap()
        app.buttons["libraryNotes"].tap()
        XCTAssertTrue(app.buttons["Test knowledge"].waitForExistence(timeout: 5))
        app.buttons["Test knowledge"].tap()
        app.swipeUp()
        app.buttons["Edit note"].tap()
        XCTAssertTrue(app.navigationBars["Edit note"].waitForExistence(timeout: 5))
        app.buttons["Cancel"].tap()
        app.navigationBars.buttons["BackButton"].tap()
        app.navigationBars.buttons["BackButton"].tap()
        openLibraryReview(in: app)
        app.buttons["Reveal note"].tap()
        XCTAssertTrue(app.staticTexts["Knowledge body"].waitForExistence(timeout: 5))
        app.buttons["Remembered"].tap()
        XCTAssertTrue(app.staticTexts["Review complete"].waitForExistence(timeout: 5))
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "Native system colors and review"; attachment.lifetime = .keepAlways; add(attachment)
    }
    func testProjectsInLibraryAndCenterCapturePage() {
        let app = XCUIApplication(); app.launchArguments = ["-ui-testing", "-ui-testing-pokus"]; app.launch()
        XCTAssertTrue(app.buttons["startFocus"].waitForExistence(timeout: 10))
        let tabs = app.tabBars.buttons
        XCTAssertEqual(tabs.count, 5)
        XCTAssertEqual(tabs.element(boundBy: 2).label, "Capture")
        XCTAssertFalse(tabs["Projects"].exists)
        tabs["Library"].tap()
        app.buttons["Projects"].tap()
        XCTAssertTrue(app.navigationBars["Projects"].waitForExistence(timeout: 5))
        app.navigationBars.buttons["BackButton"].tap()
        tabs["Capture"].tap()
        XCTAssertTrue(app.navigationBars["New capture"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.navigationBars["New capture"].buttons["Cancel"].exists)
        // An empty new capture can't be saved.
        XCTAssertFalse(app.buttons["Save"].isEnabled)
        let captureText = app.textViews["captureText"]
        XCTAssertTrue(captureText.exists)
        XCTAssertFalse(app.textFields["Title (optional)"].exists)
        XCTAssertFalse(app.textFields["Link"].exists)
        captureText.tap(); captureText.typeText("Capture from the bottom bar")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.navigationBars["Library"].waitForExistence(timeout: 5))
        app.buttons["libraryCaptures"].tap()
        XCTAssertTrue(app.buttons["Capture from the bottom bar"].waitForExistence(timeout: 5))
        tabs["Capture"].tap()
        XCTAssertTrue(app.navigationBars["New capture"].waitForExistence(timeout: 5))
        XCTAssertTrue(captureText.exists)
        XCTAssertEqual(captureText.value as? String ?? "", "")
        captureText.tap()
        captureText.typeText("Unsaved capture\nAnother thought")
        tabs["Library"].tap()
        XCTAssertTrue(app.navigationBars["Captures"].waitForExistence(timeout: 5))
        tabs["Capture"].tap()
        XCTAssertTrue(app.navigationBars["New capture"].waitForExistence(timeout: 5))
        XCTAssertTrue(captureText.exists)
        XCTAssertEqual(captureText.value as? String, "Unsaved capture\nAnother thought")
        tabs["Profile"].tap()
        XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 5))
    }
    func testLibrarySearchOpensRecordsAndRetainsQueryOnReturn() {
        let app = launchConfirmationApp()
        app.tabBars.buttons["Library"].tap()
        let field = app.searchFields["Search your library"]
        XCTAssertTrue(app.navigationBars["Library"].waitForExistence(timeout: 10))
        if !field.isHittable { app.swipeDown() }
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap(); field.typeText("Test")
        let capture = app.buttons["libraryResult-capture:testcapture0001"]
        XCTAssertTrue(capture.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["libraryResult-note:testknowledge01"].exists)
        XCTAssertTrue(app.buttons["libraryResult-project:testproject0001"].exists)
        capture.tap()
        XCTAssertTrue(app.staticTexts["Source notes"].waitForExistence(timeout: 5))
        app.navigationBars.buttons["BackButton"].tap()
        XCTAssertEqual(field.value as? String, "Test")
        XCTAssertTrue(capture.waitForExistence(timeout: 5))
    }
    func testLibrarySearchFindsAnOffPageNoteAndPreservesItsSource() {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-pokus", "-ui-testing-many-records"]
        app.launch()
        app.tabBars.buttons["Library"].tap()
        let field = app.searchFields["Search your library"]
        XCTAssertTrue(app.navigationBars["Library"].waitForExistence(timeout: 10))
        if !field.isHittable { app.swipeDown() }
        field.tap(); field.typeText("Paged note 01")
        let result = app.buttons["libraryResult-note:pagednote000001"]
        XCTAssertTrue(result.waitForExistence(timeout: 10)); result.tap()
        XCTAssertTrue(app.staticTexts["Page boundary fixture"].waitForExistence(timeout: 5))
        app.navigationBars.buttons["BackButton"].tap()
        XCTAssertEqual(field.value as? String, "Paged note 01")
        XCTAssertTrue(result.waitForExistence(timeout: 5))
    }
    func testBookCaptureCanBeCreatedBeforeFirstSave() {
        let app = launchConfirmationApp()
        app.tabBars.buttons["Capture"].tap()
        app.buttons["captureType"].tap()
        app.buttons["Book"].tap()
        let title = app.textFields["Book title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.tap(); title.typeText("A book to read")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.buttons["startFocus"].waitForExistence(timeout: 5))
        app.tabBars.buttons["Library"].tap()
        app.buttons["libraryCaptures"].tap()
        let book = app.buttons["A book to read"]
        XCTAssertTrue(book.waitForExistence(timeout: 5))
        book.tap()
        XCTAssertTrue(app.staticTexts["Inbox"].waitForExistence(timeout: 5))
    }
    func testCaptureCreatesLinkedNoteWithoutProcessingSource() {
        let app = launchConfirmationApp()
        app.tabBars.buttons["Library"].tap()
        app.buttons["libraryCaptures"].tap()
        app.buttons["Test capture"].tap()
        app.buttons["Create note"].tap()
        let body = app.textViews["Note body"]
        XCTAssertTrue(body.waitForExistence(timeout: 5))
        body.tap(); body.typeText("What I learned from this source")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.staticTexts["Note saved. This capture remains available to process."].waitForExistence(timeout: 5))
        let note = app.buttons["Test capture"]
        tapAfterScrolling(note, in: app)
        XCTAssertTrue(app.staticTexts["What I learned from this source"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Test capture"].exists)
        app.navigationBars.buttons["BackButton"].tap()
        XCTAssertTrue(app.buttons["Mark processed"].waitForExistence(timeout: 5))
    }
    func testNoteReviewTogglePreservesBodyAndSources() {
        let app = launchConfirmationApp()
        app.tabBars.buttons["Library"].tap()
        app.buttons["libraryNotes"].tap()
        app.buttons["Test knowledge"].tap()
        app.buttons["Edit note"].tap()
        let review = app.switches["includeNoteInReview"]
        for _ in 0..<6 { if review.exists && review.isHittable { break }; app.swipeUp() }
        review.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        app.buttons["Save"].tap()
        for _ in 0..<4 { if app.staticTexts["Not included in review"].exists { break }; app.swipeUp() }
        XCTAssertTrue(app.staticTexts["Not included in review"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Knowledge body"].exists)
        XCTAssertTrue(app.buttons["Test capture"].exists)
        app.buttons["Edit note"].tap()
        for _ in 0..<6 { if review.exists && review.isHittable { break }; app.swipeUp() }
        review.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        app.buttons["Save"].tap()
        for _ in 0..<4 { if app.staticTexts["Included in review"].exists { break }; app.swipeUp() }
        XCTAssertTrue(app.staticTexts["Included in review"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Knowledge body"].exists)
    }
    func testReviewFailureRetainsRevealAndRetryCompletesOnce() {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-pokus", "-ui-testing-fail-write"]
        app.launch()
        app.tabBars.buttons["Library"].tap()
        openLibraryReview(in: app)
        let reveal = app.buttons["revealReviewNote"]
        XCTAssertTrue(reveal.waitForExistence(timeout: 10)); reveal.tap()
        app.buttons["Remembered"].tap()
        let error = app.alerts["Couldn't save your change"]
        XCTAssertTrue(error.waitForExistence(timeout: 5))
        error.buttons["Cancel"].tap()
        XCTAssertTrue(app.staticTexts["Knowledge body"].exists)
        XCTAssertTrue(app.staticTexts["0 of 1 reviewed"].exists)
        app.buttons["Remembered"].tap()
        XCTAssertTrue(app.staticTexts["Review complete"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["You reviewed 1 note in this session."].exists)
    }
    func testProjectTaskCompletionAndFocusAreSeparateActions() {
        let app = launchConfirmationApp()
        app.tabBars.buttons["Library"].tap()
        app.buttons["Projects"].tap()
        app.buttons["Test project"].tap()
        let projectTitle = app.staticTexts["projectTitle"]
        XCTAssertTrue(projectTitle.waitForExistence(timeout: 5))
        XCTAssertEqual(projectTitle.label, "Test project")
        let statusFilter = app.segmentedControls["taskStatusFilter"]
        XCTAssertTrue(statusFilter.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["No open tasks"].waitForExistence(timeout: 5))
        app.buttons["New task"].firstMatch.tap()
        let title = app.textFields["Title"]
        title.tap(); title.typeText("An actionable task")
        app.buttons["Save"].tap()
        let task = app.buttons["An actionable task"]
        XCTAssertTrue(task.waitForExistence(timeout: 5))
        app.buttons["projectTaskSearch"].tap()
        let search = app.textFields["projectTaskSearchField"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap(); search.typeText("No matching task\n")
        XCTAssertTrue(app.staticTexts["No matching tasks"].waitForExistence(timeout: 5))
        app.buttons["Clear search and filters"].tap()
        XCTAssertTrue(task.waitForExistence(timeout: 5))
        app.buttons["projectTaskSearch"].tap()
        XCTAssertFalse(search.exists)
        let complete = app.buttons.matching(NSPredicate(format: "label == 'Complete An actionable task'")).firstMatch
        XCTAssertTrue(complete.exists); complete.tap()
        XCTAssertTrue(app.staticTexts["1 of 1 tasks complete"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["No open tasks"].waitForExistence(timeout: 5))
        statusFilter.buttons["Completed"].tap()
        XCTAssertTrue(task.waitForExistence(timeout: 5))
        statusFilter.buttons["Open"].tap()
        XCTAssertTrue(app.staticTexts["No open tasks"].waitForExistence(timeout: 5))
        XCTAssertFalse(task.exists)
        statusFilter.buttons["Completed"].tap()
        XCTAssertTrue(task.waitForExistence(timeout: 5)); task.tap()
        XCTAssertTrue(app.navigationBars["Task"].waitForExistence(timeout: 5))
        app.buttons["Reopen task"].tap()
        app.buttons["Focus on this task"].tap()
        XCTAssertTrue(app.buttons["startFocus"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["An actionable task"].exists)
    }
    func testCaptureFiltersResetAndCategoryDeletionIsConfirmed() {
        let app = launchConfirmationApp()
        app.tabBars.buttons["Library"].tap()
        app.buttons["libraryCaptures"].tap()
        app.segmentedControls["captureStage"].buttons["Inbox"].tap()
        XCTAssertTrue(app.staticTexts["No matching captures"].waitForExistence(timeout: 5))
        app.buttons["Clear search and filters"].tap()
        XCTAssertTrue(app.buttons["Test capture"].waitForExistence(timeout: 5))
        app.navigationBars.buttons["BackButton"].tap()
        tapAfterScrolling(app.buttons["Categories"], in: app)
        app.buttons["New category"].firstMatch.tap()
        let name = app.textFields["Name"]
        name.tap(); name.typeText("Reading")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.buttons["Reading"].waitForExistence(timeout: 5))
        app.buttons["Delete Reading"].tap()
        cancelCenteredConfirmation("Delete this category?", action: "Delete category", in: app)
        XCTAssertTrue(app.buttons["Reading"].exists)
        app.buttons["Delete Reading"].tap()
        app.alerts.buttons["Delete category"].tap()
        XCTAssertTrue(app.staticTexts["No categories yet"].waitForExistence(timeout: 5))
    }
    func testProjectCaptureCreatesNoteWithOriginAndKeepsFilingStage() {
        let app = launchConfirmationApp()
        app.tabBars.buttons["Library"].tap()
        app.buttons["libraryProjects"].tap()
        app.buttons["Test project"].tap()
        tapAfterScrolling(app.buttons["projectCaptures"], in: app)
        app.buttons["Test capture"].tap()
        app.buttons["Create note"].tap()
        let body = app.textViews["Note body"]
        XCTAssertTrue(body.waitForExistence(timeout: 5)); body.tap(); body.typeText("A project resource")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.staticTexts["Note saved. This capture remains available to process."].waitForExistence(timeout: 5))
        tapAfterScrolling(app.buttons["Test capture"], in: app)
        tapAfterScrolling(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Test project'")).firstMatch, in: app)
        XCTAssertTrue(app.navigationBars["Project"].waitForExistence(timeout: 5))
    }
    func testCaptureFilingAndProcessingRemainSeparate() {
        let app = launchConfirmationApp()
        app.tabBars.buttons["Library"].tap(); app.buttons["libraryCaptures"].tap()
        app.buttons["Test capture"].tap()
        tapAfterScrolling(app.buttons["File in projects"], in: app)
        let project = app.buttons["filingProject-testproject0001"]
        XCTAssertTrue(project.waitForExistence(timeout: 5))
        XCTAssertEqual(project.value as? String, "Filed")
        project.tap()
        XCTAssertTrue(app.staticTexts["Removed from Test project"].waitForExistence(timeout: 5))
        app.buttons["Done"].tap()
        // The existing source note still puts this capture in progress.
        XCTAssertTrue(app.staticTexts["In progress"].waitForExistence(timeout: 5))
        app.buttons["Mark processed"].tap()
        XCTAssertTrue(app.staticTexts["Processed"].waitForExistence(timeout: 5))
        app.buttons["Mark unprocessed"].tap()
        XCTAssertTrue(app.staticTexts["In progress"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Test knowledge"].exists)
    }
    func testLibraryAccessibleLabelsAndLongNoteEditor() throws {
        let app = launchConfirmationApp()
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(app.buttons["libraryNotes"].waitForExistence(timeout: 5))
        try app.performAccessibilityAudit(for: [.sufficientElementDescription, .trait])
        app.buttons["libraryNotes"].tap()
        app.buttons["New note"].firstMatch.tap()
        let title = app.textFields["Title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5)); title.tap(); title.typeText("A note with a longer body")
        let body = app.textViews["Note body"]
        body.tap(); body.typeText(String(repeating: "A useful idea can be revisited and connected to a project. ", count: 8))
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Long note editor with keyboard"; attachment.lifetime = .keepAlways; add(attachment)
        XCTAssertTrue(app.buttons["Save"].isHittable)
        app.buttons["Cancel"].tap()
        XCTAssertTrue(app.buttons["Keep editing"].waitForExistence(timeout: 5)); app.buttons["Keep editing"].tap()
        XCTAssertTrue((body.value as? String ?? "").contains("A useful idea"))
        app.buttons["Save"].tap()
        let saved = app.buttons["A note with a longer body"]
        XCTAssertTrue(saved.waitForExistence(timeout: 5)); saved.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'A useful idea'")).firstMatch.waitForExistence(timeout: 5))
    }
    func testLibraryAtLargestTextSizeInBothAppearances() {
        checkLibraryAtLargestTextSize(landscape: false)
    }
    func testLibraryLandscapeAtLargestTextSizeInBothAppearances() {
        checkLibraryAtLargestTextSize(landscape: true)
    }
    private func checkLibraryAtLargestTextSize(landscape: Bool) {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-pokus", "-ui-testing-accessibility"]
        defer { XCUIDevice.shared.orientation = .portrait }
        for appearance in ["Light", "Dark"] {
            XCUIDevice.shared.orientation = .portrait
            app.launch()
            app.tabBars.buttons["Profile"].tap()
            let picker = app.descendants(matching: .any).matching(identifier: "appearancePicker").firstMatch
            for _ in 0..<8 { if picker.exists && picker.isHittable { break }; app.swipeUp() }
            picker.tap(); app.buttons[appearance].tap()
            app.tabBars.buttons["Library"].tap()
            if landscape { setOrientation(.landscapeLeft, in: app) }
            let captures = app.buttons["libraryCaptures"]
            for _ in 0..<12 {
                if captures.exists {
                    let center = captures.frame.midY
                    let top = app.navigationBars.firstMatch.frame.maxY
                    let bottom = app.tabBars.firstMatch.frame.minY
                    if center > top + 12 && center < bottom - 12 { break }
                    if center <= top + 12 { app.swipeDown(velocity: .slow) }
                    else { app.swipeUp(velocity: .slow) }
                } else { app.swipeUp(velocity: .slow) }
            }
            XCTAssertTrue(captures.waitForExistence(timeout: 5))
            XCTAssertGreaterThanOrEqual(captures.frame.height, 44)
            XCTAssertLessThanOrEqual(captures.frame.maxX, app.frame.maxX)
            let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            attachment.name = "Library \(appearance) AX5 \(landscape ? "landscape" : "portrait")"; attachment.lifetime = .keepAlways; add(attachment)
            captures.tap()
            XCTAssertTrue(app.navigationBars["Captures"].waitForExistence(timeout: 5))
            app.navigationBars.buttons["BackButton"].tap()
            if !landscape {
                openLibraryReview(in: app)
                XCTAssertTrue(app.navigationBars["Review"].waitForExistence(timeout: 5))
                let reveal = app.buttons["revealReviewNote"]
                XCTAssertTrue(reveal.waitForExistence(timeout: 10)); reveal.tap()
                for button in [app.buttons["Remembered"], app.buttons["Review sooner"]] {
                    XCTAssertTrue(button.isHittable)
                    XCTAssertGreaterThanOrEqual(button.frame.height, 44)
                    XCTAssertLessThanOrEqual(button.frame.maxX, app.frame.maxX)
                    XCTAssertLessThanOrEqual(button.frame.maxY, app.tabBars.firstMatch.frame.minY)
                }
                let reviewShot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
                reviewShot.name = "Review \(appearance) AX5"; reviewShot.lifetime = .keepAlways; add(reviewShot)
            }
            if appearance == "Light" { app.terminate() }
        }
    }
    func testAccountHabitDraftSurvivesFailureAndEditingOmitsFixedFields() {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-pokus", "-ui-testing-fail-write"]
        app.launch()
        app.tabBars.buttons["Library"].tap()
        app.buttons["libraryHabits"].tap()
        XCTAssertTrue(app.buttons["createFirstHabit"].waitForExistence(timeout: 10))
        app.buttons["createFirstHabit"].tap()
        XCTAssertTrue(app.segmentedControls["habitType"].exists)
        let name = app.textFields["habitName"]
        name.tap(); name.typeText("Read")
        app.segmentedControls.buttons["Number"].tap()
        let target = app.textFields["habitTarget"]
        target.tap(); target.typeText("20")
        let unit = app.textFields["habitUnit"]
        unit.tap(); unit.typeText("pages")
        app.buttons["saveHabit"].tap()
        let alert = app.alerts["Couldn't save your change"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        alert.buttons["Cancel"].tap()
        XCTAssertEqual(name.value as? String, "Read")
        XCTAssertEqual(target.value as? String, "20")
        XCTAssertEqual(unit.value as? String, "pages")
        app.buttons["saveHabit"].tap()
        XCTAssertTrue(app.buttons["entry-Read"].waitForExistence(timeout: 5))
        app.buttons["Read, view progress"].tap()
        app.buttons["Habit options"].tap()
        app.buttons["Edit habit"].tap()
        XCTAssertTrue(app.navigationBars["Edit habit"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Track with"].exists)
        XCTAssertFalse(app.segmentedControls["habitType"].exists)
        XCTAssertFalse(app.textFields["habitUnit"].exists)
        XCTAssertTrue(app.staticTexts["pages"].exists)
        XCTAssertFalse(app.buttons["saveHabit"].isEnabled)
        target.tap(); target.clearAndType("0")
        XCTAssertTrue(app.staticTexts["Enter a daily target greater than zero."].exists)
        XCTAssertFalse(app.buttons["saveHabit"].isEnabled)
        target.clearAndType("20")
        XCTAssertFalse(app.buttons["saveHabit"].isEnabled)
        name.tap(); name.clearAndType("Read books")
        app.buttons["saveHabit"].tap()
        XCTAssertTrue(app.navigationBars["Read books"].waitForExistence(timeout: 5))
        app.buttons["Habit options"].tap()
        app.buttons["Edit habit"].tap()
        XCTAssertTrue(app.navigationBars["Edit habit"].waitForExistence(timeout: 5))
        XCTAssertEqual(name.value as? String, "Read books")
        XCTAssertEqual(target.value as? String, "20")
        XCTAssertFalse(app.buttons["saveHabit"].isEnabled)
    }

    func testSignedOutShellGuardsHabits() {
        let app = XCUIApplication(); app.launchArguments = ["-ui-testing"]; app.launch()
        XCTAssertTrue(app.navigationBars["Pocus"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Continue with Google"].exists)
        app.tabBars.buttons["Today"].tap()
        XCTAssertTrue(app.buttons["Continue with Google"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["addHabit"].exists)
        app.tabBars.buttons["Capture"].tap()
        XCTAssertTrue(app.navigationBars["New capture"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Continue with Google"].exists)
        XCTAssertFalse(app.buttons["Save"].exists)
        app.tabBars.buttons["Profile"].tap()
        XCTAssertFalse(app.buttons["Habit reminders"].isEnabled)
    }
    func testLocalTimerPauseResumeAndDiscardAcrossTabs() {
        let app = XCUIApplication(); app.launchArguments = ["-ui-testing", "-ui-testing-pokus"]; app.launch()
        let start = app.buttons["startFocus"]
        XCTAssertTrue(start.waitForExistence(timeout: 10))
        start.tap()
        let permissions = addUIInterruptionMonitor(withDescription: "Notification permission") { alert in
            if alert.buttons["Allow"].exists { alert.buttons["Allow"].tap(); return true }; return false
        }
        defer { removeUIInterruptionMonitor(permissions) }
        app.tap()
        let pause = app.buttons["Pause"]
        XCTAssertTrue(pause.waitForExistence(timeout: 5)); pause.tap()
        XCTAssertTrue(app.buttons["Resume"].waitForExistence(timeout: 5))
        app.tabBars.buttons["Today"].tap(); app.tabBars.buttons["Pocus"].tap()
        XCTAssertTrue(app.buttons["Resume"].exists); app.buttons["Resume"].tap()
        XCTAssertTrue(app.buttons["Pause"].waitForExistence(timeout: 5))
        app.buttons["Stop"].tap()
        let alert = app.alerts["Stop this focus session?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        XCTAssertLessThan(abs(alert.frame.midX - app.frame.midX), 8)
        XCTAssertLessThan(abs(alert.frame.midY - app.frame.midY), 80)
        alert.buttons["Continue"].tap()
        XCTAssertTrue(app.buttons["Pause"].exists)
        app.buttons["Stop"].tap(); alert.buttons["Discard session"].tap()
        XCTAssertTrue(start.waitForExistence(timeout: 5))
    }

    func testCircularDurationSelection() {
        let app = XCUIApplication(); app.launchArguments = ["-ui-testing", "-ui-testing-pokus"]; app.launch()
        let dial = app.descendants(matching: .any).matching(identifier: "focusDurationDial").firstMatch
        XCTAssertTrue(dial.waitForExistence(timeout: 10))
        let right = dial.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5))
        let bottom = dial.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.93))
        right.press(forDuration: 0.1, thenDragTo: bottom)
        XCTAssertEqual(dial.value as? String, "30 minutes")
        app.buttons["startFocus"].tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "focusProgressDial").firstMatch.waitForExistence(timeout: 5))
        XCTAssertFalse(dial.exists)
        app.buttons["Stop"].tap()
        app.alerts.buttons["Discard session"].tap()
    }

    func testFocusScreenFitsWithoutScrolling() {
        let app = XCUIApplication(); app.launchArguments = ["-ui-testing", "-ui-testing-pokus"]; app.launch()
        defer { XCUIDevice.shared.orientation = .portrait }
        let dial = app.descendants(matching: .any).matching(identifier: "focusDurationDial").firstMatch
        XCTAssertTrue(dial.waitForExistence(timeout: 10))
        for orientation in [UIDeviceOrientation.portrait, .landscapeLeft] {
            XCUIDevice.shared.orientation = orientation
            XCTAssertTrue(app.buttons["startFocus"].waitForExistence(timeout: 5))
            XCTAssertEqual(app.scrollViews.count, 0)
            let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            attachment.name = "Focus \(orientation.rawValue)"; attachment.lifetime = .keepAlways; add(attachment)
            for element in [dial, app.buttons["startFocus"]] {
                XCTAssertTrue(element.isHittable)
                XCTAssertTrue(app.frame.contains(element.frame))
                XCTAssertLessThanOrEqual(element.frame.maxY, app.tabBars.firstMatch.frame.minY)
            }
            let before = dial.frame
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.7))
                .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.3)))
            XCTAssertEqual(dial.frame, before)
        }
    }

    func testDirtyProjectAndFailedSaveKeepTheDraft() {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-pokus", "-ui-testing-delayed-save", "-ui-testing-fail-write"]
        app.launch()
        app.tabBars.buttons["Library"].tap()
        app.buttons["Projects"].tap()
        app.buttons["New project"].tap()
        let title = app.textFields["Title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.tap(); title.typeText("Draft to preserve")
        app.buttons["Cancel"].tap()
        app.buttons["Keep editing"].tap()
        XCTAssertEqual(title.value as? String, "Draft to preserve")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.buttons["Saving…"].waitForExistence(timeout: 5))
        XCTAssertFalse(title.isEnabled)
        XCTAssertFalse(app.buttons["Cancel"].isEnabled)
        XCTAssertTrue(app.buttons["Save"].waitForExistence(timeout: 10))
        XCTAssertTrue(title.isEnabled)
        XCTAssertEqual(title.value as? String, "Draft to preserve")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Draft to preserve'")).firstMatch.waitForExistence(timeout: 10))
        XCTAssertFalse(app.navigationBars["New project"].exists)
    }

    func testReviewDoesNotClaimNothingDueBeforeLoading() {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-pokus", "-ui-testing-delay-library"]
        app.launch()
        app.tabBars.buttons["Library"].tap()
        openLibraryReview(in: app)
        XCTAssertTrue(app.staticTexts["Loading reviews"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Nothing due"].exists)
        XCTAssertTrue(app.buttons["Reveal note"].waitForExistence(timeout: 35))
    }

    func testFocusScreenFitsAtLargestAccessibilitySize() {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-pokus", "-ui-testing-accessibility"]
        app.launch()
        defer { XCUIDevice.shared.orientation = .portrait }
        let dial = app.descendants(matching: .any).matching(identifier: "focusDurationDial").firstMatch
        XCTAssertTrue(dial.waitForExistence(timeout: 10))
        for orientation in [UIDeviceOrientation.portrait, .landscapeLeft] {
            XCUIDevice.shared.orientation = orientation
            let start = app.buttons["startFocus"]
            XCTAssertTrue(start.waitForExistence(timeout: 10))
            XCTAssertEqual(app.scrollViews.count, 0)
            for element in [dial, start] {
                XCTAssertTrue(element.isHittable)
                XCTAssertGreaterThanOrEqual(element.frame.height, 44)
                XCTAssertTrue(app.frame.contains(element.frame))
            }
            let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            attachment.name = "AX5 focus \(orientation.rawValue)"; attachment.lifetime = .keepAlways; add(attachment)
            start.tap()
            XCTAssertTrue(app.buttons["Pause"].waitForExistence(timeout: 5))
            XCTAssertTrue(app.buttons["Stop"].isHittable)
            app.buttons["Pause"].tap()
            XCTAssertTrue(app.buttons["Resume"].waitForExistence(timeout: 5))
            app.buttons["Stop"].tap()
            app.alerts.buttons["Discard session"].tap()
        }
    }

    func testFocusFitsInBothAppearances() {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-pokus", "-ui-testing-accessibility"]
        app.launch()
        defer { XCUIDevice.shared.orientation = .portrait }
        for appearance in ["Light", "Dark"] {
            XCUIDevice.shared.orientation = .portrait
            app.tabBars.buttons["Profile"].tap()
            let picker = app.descendants(matching: .any).matching(identifier: "appearancePicker").firstMatch
            for _ in 0..<6 {
                if picker.exists && picker.isHittable { break }
                app.swipeUp()
            }
            XCTAssertTrue(picker.waitForExistence(timeout: 5))
            picker.tap()
            app.buttons[appearance].tap()
            app.tabBars.buttons["Pocus"].tap()
            for orientation in [UIDeviceOrientation.portrait, .landscapeLeft] {
                XCUIDevice.shared.orientation = orientation
                let start = app.buttons["startFocus"]
                XCTAssertTrue(start.waitForExistence(timeout: 5))
                XCTAssertTrue(start.isHittable)
                XCTAssertTrue(app.frame.contains(start.frame))
                XCTAssertEqual(app.scrollViews.count, 0)
                XCTAssertEqual(app.frame.width > app.frame.height, orientation == .landscapeLeft)
                let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
                attachment.name = "\(appearance) AX5 focus \(orientation.rawValue)"
                attachment.lifetime = .keepAlways; add(attachment)
            }
        }
    }

    func testTaskDeleteConfirmationIsCenteredAndCancelPreservesTask() {
        let app = launchConfirmationApp()
        app.tabBars.buttons["Library"].tap()
        app.buttons["Projects"].tap()
        let project = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Test project'")).firstMatch
        XCTAssertTrue(project.waitForExistence(timeout: 5))
        project.tap()
        app.buttons["New task"].firstMatch.tap()
        let title = app.textFields["Title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.tap()
        title.typeText("Keep this task")
        app.buttons["Save"].tap()
        let task = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Keep this task'")).firstMatch
        XCTAssertTrue(task.waitForExistence(timeout: 5))
        task.tap()
        tapAfterScrolling(app.buttons["Delete task"], in: app)
        cancelCenteredConfirmation("Delete this task?", action: "Delete task", in: app)
        XCTAssertTrue(app.navigationBars["Task"].exists)
        let savedTitle = app.staticTexts["Keep this task"]
        XCTAssertTrue(savedTitle.exists)
        app.navigationBars.buttons["BackButton"].tap()
        XCTAssertTrue(task.waitForExistence(timeout: 5))
        task.tap()
        XCTAssertTrue(savedTitle.waitForExistence(timeout: 5))
    }

    func testProjectDeleteConfirmationIsCenteredAndCancelPreservesProject() {
        let app = launchConfirmationApp()
        app.tabBars.buttons["Library"].tap()
        app.buttons["Projects"].tap()
        let project = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Test project'")).firstMatch
        XCTAssertTrue(project.waitForExistence(timeout: 5))
        project.tap()
        if !app.buttons["Project actions"].waitForExistence(timeout: 5) {
            app.navigationBars.buttons["OverflowBarButtonItem"].tap()
        }
        app.buttons["Project actions"].tap()
        app.buttons["Delete project"].tap()
        cancelCenteredConfirmation("Delete this project?", action: "Delete project", in: app)
        XCTAssertTrue(app.navigationBars["Project"].exists)
        app.navigationBars.buttons["BackButton"].tap()
        XCTAssertTrue(project.waitForExistence(timeout: 5))
        project.tap()
        XCTAssertTrue(app.navigationBars["Project"].waitForExistence(timeout: 5))
    }

    func testCaptureDeleteConfirmationIsCenteredAndCancelPreservesCapture() {
        let app = launchConfirmationApp()
        app.tabBars.buttons["Library"].tap()
        app.buttons["libraryCaptures"].tap()
        let capture = app.buttons["Test capture"]
        XCTAssertTrue(capture.waitForExistence(timeout: 5))
        capture.tap()
        app.buttons["Capture actions"].tap()
        tapAfterScrolling(app.buttons["Delete capture"], in: app)
        cancelCenteredConfirmation("Delete this capture?", action: "Delete capture", in: app)
        XCTAssertTrue(app.navigationBars["Capture"].exists)
        app.navigationBars.buttons["BackButton"].tap()
        XCTAssertTrue(capture.waitForExistence(timeout: 5))
        capture.tap()
        XCTAssertTrue(app.staticTexts["Test capture"].waitForExistence(timeout: 5))
    }

    func testKnowledgeDeleteConfirmationIsCenteredAndCancelPreservesKnowledge() {
        let app = launchConfirmationApp()
        app.tabBars.buttons["Library"].tap()
        app.buttons["libraryNotes"].tap()
        let knowledge = app.buttons["Test knowledge"]
        XCTAssertTrue(knowledge.waitForExistence(timeout: 5))
        knowledge.tap()
        app.buttons["Note actions"].tap()
        app.buttons["Delete note"].tap()
        cancelCenteredConfirmation("Delete this note?", action: "Delete note", in: app)
        XCTAssertTrue(app.navigationBars["Note"].exists)
        app.navigationBars.buttons["BackButton"].tap()
        XCTAssertTrue(knowledge.waitForExistence(timeout: 5))
        knowledge.tap()
        XCTAssertTrue(app.staticTexts["Knowledge body"].waitForExistence(timeout: 5))
    }

    func testHabitDeleteConfirmationIsCenteredAndCancelPreservesHistory() {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-local-habits", "-ui-testing-history"]
        XCUIDevice.shared.orientation = .portrait
        app.launch()
        app.tabBars.buttons["Library"].tap()
        app.buttons["libraryHabits"].tap()
        XCTAssertTrue(app.navigationBars["Habits"].waitForExistence(timeout: 10))
        app.segmentedControls.buttons["Progress"].tap()
        let habit = app.buttons["detail-Read a little"]
        tapAfterScrolling(habit, in: app)
        XCTAssertTrue(app.navigationBars["Read a little"].waitForExistence(timeout: 5))
        let history = app.staticTexts.matching(NSPredicate(format: "label MATCHES '[0-9]+ days? completed'")).firstMatch
        XCTAssertTrue(history.exists)
        let completedDays = history.label
        app.buttons["Habit options"].tap()
        app.buttons["Delete habit"].tap()
        cancelCenteredConfirmation("Delete this habit and all its history?", action: "Delete habit and history", in: app)
        XCTAssertTrue(app.navigationBars["Read a little"].exists)
        XCTAssertEqual(history.label, completedDays)
        app.navigationBars.buttons["BackButton"].tap()
        tapAfterScrolling(habit, in: app)
        XCTAssertEqual(history.label, completedDays)
    }

    func testSignOutConfirmationIsCenteredAndCancelPreservesAccount() {
        let app = launchConfirmationApp()
        app.tabBars.buttons["Profile"].tap()
        XCTAssertTrue(app.staticTexts["Test account"].waitForExistence(timeout: 5))
        app.buttons["Sign out"].tap()
        cancelCenteredConfirmation("Sign out of Pokus?", action: "Sign out", in: app)
        XCTAssertTrue(app.staticTexts["Test account"].exists)
        XCTAssertTrue(app.buttons["Sign out"].isEnabled)
        app.tabBars.buttons["Library"].tap()
        app.buttons["Projects"].tap()
        XCTAssertTrue(app.buttons["New project"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["New project"].isEnabled)
        XCTAssertFalse(app.buttons["Continue with Google"].exists)
    }

    private func setOrientation(_ orientation: UIDeviceOrientation, in app: XCUIApplication) {
        XCUIDevice.shared.orientation = orientation
        let landscape = orientation == .landscapeLeft || orientation == .landscapeRight
        let settled = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            (app.frame.width > app.frame.height) == landscape
        }, object: app)
        XCTAssertEqual(XCTWaiter.wait(for: [settled], timeout: 5), .completed)
    }

    private func openLibraryReview(in app: XCUIApplication) {
        let review = app.buttons["libraryReview"]
        for _ in 0..<8 { if review.exists && review.isHittable { break }; app.swipeDown() }
        XCTAssertTrue(review.waitForExistence(timeout: 5)); review.tap()
        if !app.navigationBars["Review"].waitForExistence(timeout: 2), review.exists { review.tap() }
    }

    private func launchConfirmationApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-pokus"]
        XCUIDevice.shared.orientation = .portrait
        app.launch()
        XCTAssertTrue(app.buttons["startFocus"].waitForExistence(timeout: 10))
        return app
    }

    private func tapAfterScrolling(_ element: XCUIElement, in app: XCUIApplication,
                                   file: StaticString = #filePath, line: UInt = #line) {
        for _ in 0..<6 {
            if element.exists && element.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(element.isHittable, file: file, line: line)
        element.tap()
    }

    private func tapCalendarControl(_ element: XCUIElement, in app: XCUIApplication,
                                    file: StaticString = #filePath, line: UInt = #line) {
        let list = app.collectionViews["calendarAgenda"]
        XCTAssertTrue(list.exists, file: file, line: line)
        for _ in 0..<5 {
            if element.exists && element.isHittable { break }
            list.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
                .press(forDuration: 0.1, thenDragTo: list.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)))
        }
        if !element.isHittable {
            let tree = XCTAttachment(string: app.debugDescription); tree.name = "Calendar accessibility hierarchy"; tree.lifetime = .keepAlways; add(tree)
        }
        XCTAssertTrue(element.isHittable, file: file, line: line)
        element.tap()
    }

    private func cancelCenteredConfirmation(_ title: String, action: String, in app: XCUIApplication,
                                            file: StaticString = #filePath, line: UInt = #line) {
        let alert = app.alerts[title]
        XCTAssertTrue(alert.waitForExistence(timeout: 5), file: file, line: line)
        XCTAssertLessThan(abs(alert.frame.midX - app.frame.midX), 8, file: file, line: line)
        XCTAssertLessThan(abs(alert.frame.midY - app.frame.midY), 80, file: file, line: line)
        XCTAssertTrue(alert.buttons[action].isHittable, file: file, line: line)
        XCTAssertTrue(alert.buttons["Cancel"].isHittable, file: file, line: line)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = title
        attachment.lifetime = .keepAlways
        add(attachment)
        alert.buttons["Cancel"].tap()
        XCTAssertTrue(alert.waitForNonExistence(timeout: 5), file: file, line: line)
    }
}

private extension XCUIElement {
    func clearAndType(_ value: String) {
        let previous = self.value as? String ?? ""
        typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: previous.count) + value)
    }
}
