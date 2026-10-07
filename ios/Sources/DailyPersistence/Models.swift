import Foundation
import SwiftData

@Model
public final class Habit {
    @Attribute(.unique) public var id: UUID
    public var name: String
    public var kindRaw: String
    public var unit: String
    public var startDayRaw: String
    public var createdAt: Date

    public init(id: UUID = UUID(), name: String, kindRaw: String, unit: String,
                startDayRaw: String, createdAt: Date = .now) {
        self.id = id
        self.name = name
        self.kindRaw = kindRaw
        self.unit = unit
        self.startDayRaw = startDayRaw
        self.createdAt = createdAt
    }
}

@Model
public final class DailyEntry {
    @Attribute(.unique) public var key: String
    public var habitID: UUID
    public var dayRaw: String
    public var value: Double

    public init(habitID: UUID, dayRaw: String, value: Double) {
        self.key = "\(habitID.uuidString):\(dayRaw)"
        self.habitID = habitID
        self.dayRaw = dayRaw
        self.value = value
    }
}

@Model
public final class TargetRevision {
    @Attribute(.unique) public var key: String
    public var habitID: UUID
    public var dayRaw: String
    public var target: Double

    public init(habitID: UUID, dayRaw: String, target: Double) {
        self.key = "\(habitID.uuidString):\(dayRaw)"
        self.habitID = habitID
        self.dayRaw = dayRaw
        self.target = target
    }
}

