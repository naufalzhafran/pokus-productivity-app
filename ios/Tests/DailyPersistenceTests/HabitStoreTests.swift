import DailyCore
import Foundation
import SwiftData
import XCTest
@testable import DailyPersistence

final class HabitStoreTests: XCTestCase {
    private let today = DayKey(rawValue: "2026-09-15")!

    @MainActor
    func testEditsUpsertAndPersistAcrossContexts() throws {
        let container = try HabitStore.makeContainer(inMemory: true)
        let store = try HabitStore(container: container)
        try store.create(name: "Water", kind: .number, unit: "glasses", target: 8, today: today)
        let id = try XCTUnwrap(store.histories.first?.id)
        try store.setValue(3, for: id, on: today, today: today)
        try store.setValue(8.5, for: id, on: today, today: today)
        let reloaded = try HabitStore(container: container)
        XCTAssertEqual(reloaded.history(id: id)?.value(on: today), 8.5)
        XCTAssertTrue(try XCTUnwrap(reloaded.history(id: id)).isComplete(on: today))
        XCTAssertEqual(try ModelContext(container).fetchCount(FetchDescriptor<DailyEntry>()), 1)
    }

    @MainActor
    func testDiskRelaunchPreservesEntriesAndTargets() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("test.store")
        let id: UUID = try {
            let store = try HabitStore(container: HabitStore.makeContainer(url: url))
            try store.create(name: "Read", kind: .number, unit: "pages", target: 20, today: today)
            let id = try XCTUnwrap(store.histories.first?.id)
            try store.setValue(22, for: id, on: today, today: today)
            return id
        }()
        let reopened = try HabitStore(container: HabitStore.makeContainer(url: url))
        XCTAssertEqual(reopened.history(id: id)?.value(on: today), 22)
        XCTAssertEqual(reopened.history(id: id)?.target(on: today), 20)
    }

    @MainActor
    func testTargetRevisionUpsertAndBackfilledEntry() throws {
        let container = try HabitStore.makeContainer(inMemory: true)
        let store = try HabitStore(container: container)
        let yesterday = today.adding(days: -1)
        try store.create(name: "Read", kind: .number, target: 5, today: yesterday)
        let id = try XCTUnwrap(store.histories.first?.id)
        try store.edit(id: id, name: "Read books", target: 10, today: today)
        try store.edit(id: id, name: "Read books", target: 15, today: today)
        try store.setValue(5, for: id, on: yesterday, today: today)
        let history = try XCTUnwrap(store.history(id: id))
        XCTAssertTrue(history.isComplete(on: yesterday))
        XCTAssertEqual(history.target(on: today), 15)
        XCTAssertEqual(try ModelContext(container).fetchCount(FetchDescriptor<TargetRevision>()), 2)
    }

    @MainActor
    func testValidationAndDeleteRemoveAllRelatedData() throws {
        let container = try HabitStore.makeContainer(inMemory: true)
        let store = try HabitStore(container: container)
        XCTAssertThrowsError(try store.create(name: " ", kind: .check))
        XCTAssertThrowsError(try store.create(name: "Read", kind: .number, target: 0))
        try store.create(name: "Read", kind: .number, target: 20, today: today)
        let id = try XCTUnwrap(store.histories.first?.id)
        XCTAssertThrowsError(try store.setValue(-1, for: id, on: today, today: today))
        XCTAssertThrowsError(try store.setValue(.infinity, for: id, on: today, today: today))
        XCTAssertThrowsError(try store.setValue(2, for: id, on: today.adding(days: 1), today: today))
        XCTAssertThrowsError(try store.setValue(2, for: id, on: today.adding(days: -1), today: today))
        try store.setValue(20, for: id, on: today, today: today)
        try store.delete(id: id)
        let context = ModelContext(container)
        XCTAssertTrue(store.histories.isEmpty)
        XCTAssertEqual(try context.fetchCount(FetchDescriptor<Habit>()), 0)
        XCTAssertEqual(try context.fetchCount(FetchDescriptor<DailyEntry>()), 0)
        XCTAssertEqual(try context.fetchCount(FetchDescriptor<TargetRevision>()), 0)
    }

    @MainActor
    func testFailedSaveRollsBackAndRetryDoesNotDuplicate() throws {
        enum Failure: Error { case diskFull }
        var shouldFail = true
        let container = try HabitStore.makeContainer(inMemory: true)
        let store = try HabitStore(container: container, saveChanges: { context in
            if shouldFail { throw Failure.diskFull }
            try context.save()
        })
        XCTAssertThrowsError(try store.create(name: "Walk", kind: .check, today: today))
        XCTAssertTrue(store.histories.isEmpty)
        XCTAssertEqual(try ModelContext(container).fetchCount(FetchDescriptor<Habit>()), 0)
        shouldFail = false
        try store.create(name: "Walk", kind: .check, today: today)
        XCTAssertEqual(store.histories.count, 1)
        let id = try XCTUnwrap(store.histories.first?.id)
        shouldFail = true
        XCTAssertThrowsError(try store.setValue(1, for: id, on: today, today: today))
        XCTAssertEqual(store.history(id: id)?.value(on: today), 0)
        shouldFail = false
        try store.setValue(1, for: id, on: today, today: today)
        XCTAssertEqual(store.history(id: id)?.value(on: today), 1)
        XCTAssertEqual(try ModelContext(container).fetchCount(FetchDescriptor<DailyEntry>()), 1)
    }
}
