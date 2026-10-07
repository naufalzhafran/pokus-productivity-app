import Foundation

public enum SessionMode: String, Codable, Sendable { case running, complete, discarded }
public struct FocusSession: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var task: String
    public var durationMinutes: Int
    public var mode: SessionMode
    public var remainingSeconds: Int
    public var isActive: Bool
    /// PocketBase and the web client use milliseconds since the Unix epoch.
    public var lastTick: Double
    public var updated: String?
    public init(id: String = Self.makeID(), task: String = "", durationMinutes: Int, now: Date) {
        self.id = id; self.task = task; self.durationMinutes = min(60, max(1, durationMinutes))
        mode = .running; remainingSeconds = self.durationMinutes * 60; isActive = true
        lastTick = floor(now.timeIntervalSince1970 * 1000)
    }
    public static func makeID() -> String {
        let alphabet = Array("abcdefghijklmnopqrstuvwxyz0123456789")
        return String((0..<15).map { _ in alphabet.randomElement()! })
    }
    public func remaining(at now: Date) -> Int {
        guard mode == .running, isActive else { return max(0, remainingSeconds) }
        let elapsed = max(0, Int(floor(now.timeIntervalSince1970 - lastTick / 1000)))
        return max(0, remainingSeconds - elapsed)
    }
    public var creditedSeconds: Int { max(0, durationMinutes * 60 - remainingSeconds) }
    public var deadline: Date { Date(timeIntervalSince1970: lastTick / 1000 + Double(remainingSeconds)) }
}
public struct SessionOperation: Codable, Equatable, Sendable {
    public var revision: Int
    public var session: FocusSession
    public init(revision: Int, session: FocusSession) { self.revision = revision; self.session = session }
}
public struct TimerSnapshot: Codable, Equatable, Sendable {
    public var current: FocusSession?
    public var revision = 0
    public var operations: [SessionOperation] = []
    public var terminalIDs: Set<String> = []
    public init() {}
    public mutating func transition(_ next: FocusSession?) {
        if let next, next.mode == .running, terminalIDs.contains(next.id) { return }
        revision += 1
        if let next {
            operations.removeAll { $0.session.id == next.id }
            operations.append(SessionOperation(revision: revision, session: next))
            if next.mode != .running { terminalIDs.insert(next.id) }
        }
        current = next?.mode == .discarded ? nil : next
    }
    public mutating func acknowledge(_ operation: SessionOperation, authoritative: FocusSession) {
        revision += 1
        let terminal = authoritative.mode != .running
        operations.removeAll { $0.session.id == operation.session.id && (terminal || $0.revision == operation.revision) }
        if current?.id == authoritative.id && terminal {
            current = authoritative.mode == .discarded ? nil : authoritative
        }
        if terminal { terminalIDs.insert(authoritative.id) }
    }
}
public struct SessionEngine {
    public var now: () -> Date
    public init(now: @escaping () -> Date = { .now }) { self.now = now }
    public func toggle(_ session: FocusSession) -> FocusSession {
        guard session.mode == .running else { return session }
        var next = session
        next.remainingSeconds = session.remaining(at: now())
        next.isActive.toggle(); next.lastTick = floor(now().timeIntervalSince1970 * 1000)
        if next.remainingSeconds == 0 { next.mode = .complete; next.isActive = false }
        return next
    }
    public func finish(_ session: FocusSession, save: Bool) -> FocusSession {
        var next = session
        next.remainingSeconds = session.remaining(at: now()); next.isActive = false
        next.mode = save ? .complete : .discarded; next.lastTick = floor(now().timeIntervalSince1970 * 1000)
        return next
    }
}
