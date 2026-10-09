import DailyCore
import Foundation
import Testing
@testable import PokusCore

struct SharedInboxTests {
    private func temporaryInbox() -> SharedCaptureInbox {
        SharedCaptureInbox(directory: FileManager.default.temporaryDirectory
            .appendingPathComponent("SharedInboxTests-\(UUID().uuidString)", isDirectory: true))
    }

    @Test func sharedItemsAreReadOldestFirstAndRemovedIndividually() throws {
        let inbox = temporaryInbox()
        defer { try? FileManager.default.removeItem(at: inbox.directory) }
        #expect(inbox.pending().isEmpty)
        try inbox.add(SharedCapture(id: "second", text: "Later", created: Date(timeIntervalSince1970: 20)))
        try inbox.add(SharedCapture(id: "first", text: "https://example.com", created: Date(timeIntervalSince1970: 10)))
        try inbox.add(SharedCapture(id: "blank", text: "   "))
        #expect(inbox.pending().map(\.id) == ["first", "second"])
        inbox.remove("first")
        #expect(inbox.pending().map(\.id) == ["second"])
        // Adding the same item again replaces it rather than duplicating it.
        try inbox.add(SharedCapture(id: "second", text: "Edited", created: Date(timeIntervalSince1970: 20)))
        #expect(inbox.pending().map(\.text) == ["Edited"])
    }

    @Test func unsafeIDsStayInsideTheInbox() throws {
        let inbox = temporaryInbox()
        defer { try? FileManager.default.removeItem(at: inbox.directory) }
        try inbox.add(SharedCapture(id: "../escape", text: "Text"))
        let files = try FileManager.default.contentsOfDirectory(atPath: inbox.directory.path)
        #expect(files == ["escape.json"])
    }

    @Test func sharedTextCombinesTitleAndLink() {
        let url = URL(string: "https://example.com/article")!
        #expect(SharedCapture.text(url: url, text: nil) == "https://example.com/article")
        #expect(SharedCapture.text(url: url, text: "https://example.com/article") == "https://example.com/article")
        #expect(SharedCapture.text(url: url, text: "A good read") == "A good read\nhttps://example.com/article")
        #expect(SharedCapture.text(url: nil, text: "  A thought  ") == "A thought")
        let parsed = LibraryRules.parseCaptureText(SharedCapture.text(url: url, text: "A good read"))
        #expect(parsed.url == url)
    }

    @Test func widgetSnapshotResetsAtMidnightAndRoundTrips() throws {
        let today = DayKey(rawValue: "2026-10-09")!
        let snapshot = FocusWidgetSnapshot(day: today, todaySeconds: 1500, deadline: Date(timeIntervalSince1970: 2_000))
        #expect(snapshot.todaySeconds(on: today) == 1500)
        #expect(snapshot.todaySeconds(on: today.adding(days: 1)) == 0)
        #expect(snapshot.isRunning(at: Date(timeIntervalSince1970: 1_000)))
        #expect(!snapshot.isRunning(at: Date(timeIntervalSince1970: 3_000)))
        let defaults = UserDefaults(suiteName: "SharedInboxTests-\(UUID().uuidString)")!
        snapshot.write(to: defaults)
        #expect(FocusWidgetSnapshot.read(from: defaults) == snapshot)
    }
}
