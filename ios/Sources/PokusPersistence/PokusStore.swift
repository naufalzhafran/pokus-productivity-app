import Foundation
import PokusCore

public struct AccountSnapshot: Codable, Sendable {
    public var timer = TimerSnapshot()
    public init() {}
}

/// Server records never enter this timer and outbox store.
public actor PokusStore {
    private let directory: URL
    private let write: @Sendable (Data, URL) throws -> Void
    private var accounts: [String: AccountSnapshot] = [:]
    public init(directory: URL, write: @escaping @Sendable (Data, URL) throws -> Void = { try $0.write(to: $1, options: .atomic) }) throws {
        self.directory = directory; self.write = write
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
    private func url(_ owner: String, component: String? = nil) throws -> URL {
        guard !owner.isEmpty, owner.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }) else {
            throw PokusError.message("Invalid account storage identifier.")
        }
        return directory.appendingPathComponent(owner + (component.map { "." + $0 } ?? "") + ".json")
    }
    public func removeDownloadedCaches() -> [String] {
        do {
            let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            let owners = Set(files.compactMap { file -> String? in
                let parts = file.lastPathComponent.split(separator: ".").map(String.init)
                guard parts.count >= 2, parts[1] == "json" || ["timer", "workspace", "library", "habits"].contains(parts[1]),
                      !parts[0].isEmpty, parts[0].allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }) else { return nil }
                return parts[0]
            })
            return owners.sorted().compactMap { owner in
                do { _ = try read(owner); try clean(owner); return nil }
                catch { return "Couldn't finish storage cleanup for \(owner). Its saved timer was preserved. \(error.localizedDescription)" }
            }
        } catch { return [error.localizedDescription] }
    }
    public func read(_ owner: String) throws -> AccountSnapshot {
        if let saved = accounts[owner] { return saved }
        let timerURL = try url(owner, component: "timer"), legacyURL = try url(owner)
        var saved = AccountSnapshot()
        if FileManager.default.fileExists(atPath: timerURL.path) {
            saved.timer = try JSONDecoder().decode(TimerSnapshot.self, from: Data(contentsOf: timerURL))
        } else if FileManager.default.fileExists(atPath: legacyURL.path) {
            saved.timer = try legacyTimer(legacyURL)
            try write(JSONEncoder().encode(saved.timer), timerURL)
        } else {
            let copies = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
                .filter { $0.lastPathComponent.hasPrefix(legacyURL.lastPathComponent + ".recovery-") || $0.lastPathComponent.hasPrefix(timerURL.lastPathComponent + ".recovery-") }
                .sorted { $0.lastPathComponent > $1.lastPathComponent }
            if !copies.isEmpty {
                var recovered: TimerSnapshot?
                for copy in copies {
                    if copy.lastPathComponent.hasPrefix(timerURL.lastPathComponent) {
                        recovered = try? JSONDecoder().decode(TimerSnapshot.self, from: Data(contentsOf: copy))
                    } else { recovered = try? legacyTimer(copy) }
                    if recovered != nil { break }
                }
                guard let recovered else { throw CocoaError(.fileReadCorruptFile) }
                saved.timer = recovered
                try write(JSONEncoder().encode(saved.timer), timerURL)
            }
        }
        accounts[owner] = saved
        return saved
    }
    private func legacyTimer(_ file: URL) throws -> TimerSnapshot {
        guard let object = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any], let timer = object["timer"] else { throw CocoaError(.fileReadCorruptFile) }
        return try JSONDecoder().decode(TimerSnapshot.self, from: JSONSerialization.data(withJSONObject: timer))
    }
    private func clean(_ owner: String) throws {
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        let legacy = try url(owner).lastPathComponent
        let caches = try ["workspace", "library", "habits"].map { try url(owner, component: $0).lastPathComponent }
        for file in files {
            let name = file.lastPathComponent
            if name == legacy || name.hasPrefix(legacy + ".recovery-") || caches.contains(name) || caches.contains(where: { name.hasPrefix($0 + ".recovery-") }) {
                try FileManager.default.removeItem(at: file)
            }
        }
    }
    private func commit(_ owner: String, _ next: AccountSnapshot) throws -> AccountSnapshot {
        try write(JSONEncoder().encode(next.timer), url(owner, component: "timer"))
        accounts[owner] = next
        return next
    }
    public func transition(_ owner: String, session: FocusSession?) throws -> AccountSnapshot {
        var next = try read(owner); next.timer.transition(session)
        return try commit(owner, next)
    }
    public func acknowledge(_ owner: String, operation: SessionOperation, authoritative: FocusSession) throws -> AccountSnapshot {
        var next = try read(owner); next.timer.acknowledge(operation, authoritative: authoritative)
        return try commit(owner, next)
    }
    public func restore(_ owner: String, session: FocusSession) throws -> AccountSnapshot {
        var next = try read(owner)
        if next.timer.current == nil && next.timer.operations.isEmpty {
            next.timer.current = session; next.timer.revision += 1
            return try commit(owner, next)
        }
        return next
    }
}
