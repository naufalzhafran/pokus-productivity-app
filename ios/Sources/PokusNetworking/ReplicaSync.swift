import DailyCore
import Foundation
import PokusCore

private struct BatchResponse: Decodable { let status: Int; let body: JSONValue? }

/// Thresholds for deciding whether a habit entry completes its day.
private struct HabitRules {
    let habits: [String: (kind: String, start: String)]
    let targets: [String: [(day: String, target: Double)]]
    init(_ tables: RecordTables) {
        var habits: [String: (kind: String, start: String)] = [:]
        for (id, row) in tables["habits"] ?? [:] {
            guard case .string(let kind)? = row["kind"], case .string(let start)? = row["startDay"] else { continue }
            habits[id] = (kind, start)
        }
        var targets: [String: [(day: String, target: Double)]] = [:]
        for row in (tables["habit_targets"] ?? [:]).values {
            guard case .string(let habit)? = row["habit"], case .string(let day)? = row["day"], case .number(let target)? = row["target"],
                  target.isFinite, target > 0 else { continue }
            targets[habit, default: []].append((day, target))
        }
        self.habits = habits
        self.targets = targets.mapValues { $0.sorted { $0.day < $1.day } }
    }
    func completes(habit: String, day: String, value: Double) -> Bool {
        guard let rule = habits[habit], day >= rule.start, value.isFinite, value >= 0 else { return false }
        if rule.kind == "check" { return value >= 1 }
        guard let target = targets[habit]?.last(where: { $0.day <= day })?.target else { return false }
        return value >= target
    }
}

extension RecordReplica {
    enum ReplayFailure: Error { case permanent(String), gone }

    // MARK: Push

    /// Sends queued changes in order. A change PocketBase rejects is set aside with its reason;
    /// a connection or sign-in problem stops the pass so later changes keep their order.
    @discardableResult
    public func push(_ client: PocketBaseClient) async throws -> Bool {
        loadIfNeeded()
        defer { flush() }
        var attempted: Set<String> = [], changed = false
        while let entry = outbox.first(where: { $0.failure == nil && !attempted.contains($0.id) }) {
            attempted.insert(entry.id)
            do {
                acknowledge(entry.id, try await send(entry, client))
            } catch ReplayFailure.permanent(let message) {
                if let index = outbox.firstIndex(where: { $0.id == entry.id }) { outbox[index].failure = message; try? saveOutbox() }
            } catch ReplayFailure.gone {
                outbox.removeAll { $0.id == entry.id }; try? saveOutbox()
                for request in entry.requests { Self.delete(request.collection, id: request.id, from: &rows, trimmed: &trimmed) }
                dirtyCollections.formUnion(RecordSchema.replicated)
                notice = "A change to an item that was deleted on another device was discarded."
                self.changed()
            }
            changed = true
        }
        return changed
    }

    private func classify(_ error: Error) -> Error {
        guard let failure = error as? APIError, (400..<500).contains(failure.status), ![401, 408, 429].contains(failure.status) else { return error }
        return ReplayFailure.permanent(failure.localizedDescription)
    }

    private func object(_ data: Data) throws -> [String: JSONValue] {
        guard case .object(let object) = try JSONDecoder().decode(JSONValue.self, from: data) else { throw URLError(.cannotParseResponse) }
        return object
    }

    private func existing(_ collection: String, _ id: String, _ client: PocketBaseClient) async throws -> [String: JSONValue]? {
        do { return try object(await client.request("api/collections/\(collection)/records/\(id)")) }
        catch let error as APIError where error.status == 404 { return nil }
    }

    private func send(_ entry: OutboxEntry, _ client: PocketBaseClient) async throws -> [(OutboxRequest, [String: JSONValue]?)] {
        if entry.batch { return try await sendBatch(entry, client) }
        var request = entry.requests[0]
        let path = "api/collections/\(request.collection)/records"
        switch request.method {
        case "POST":
            var body = request.body; body["id"] = .string(request.id)
            do { return [(request, try object(await client.request(path, method: "POST", body: body)))] }
            catch {
                // A committed create may have lost its response; the stable ID proves it.
                if let row = try await existing(request.collection, request.id, client) { return [(request, row)] }
                throw classify(error)
            }
        case "DELETE":
            do { _ = try await client.request(path + "/" + request.id, method: "DELETE"); return [(request, nil)] }
            catch let error as APIError where error.status == 404 { return [(request, nil)] }
            catch { throw classify(error) }
        default:
            if request.collection == "knowledge", let base = entry.bodyBase?[request.id] {
                request = try await resolveBodyConflict(request, base: base, entryID: entry.id, client)
            }
            if request.body.isEmpty { return [(request, try await existing(request.collection, request.id, client))] }
            do { return [(request, try object(await client.request(path + "/" + request.id, method: "PATCH", body: request.body)))] }
            catch let error as APIError where error.status == 404 { throw ReplayFailure.gone }
            catch { throw classify(error) }
        }
    }

    private func sendBatch(_ entry: OutboxEntry, _ client: PocketBaseClient) async throws -> [(OutboxRequest, [String: JSONValue]?)] {
        let payload: [JSONValue] = entry.requests.map { request in
            let creates = request.method == "POST" || request.method == "PUT"
            var body = request.body
            if creates { body["id"] = .string(request.id) }
            return .object(["method": .string(request.method), "body": .object(body),
                            "url": .string("/api/collections/\(request.collection)/records" + (creates ? "" : "/\(request.id)"))])
        }
        do {
            let data = try await client.request("api/batch", method: "POST", body: ["requests": .array(payload)])
            let responses = try JSONDecoder().decode([BatchResponse].self, from: data)
            return zip(entry.requests, responses).map { request, response in
                if case .object(let row)? = response.body { return (request, row) } else { return (request, nil) }
            }
        } catch {
            // A batch commits as a whole, so one created record proves a lost response.
            if let create = entry.requests.first(where: { $0.method == "POST" }),
               try await existing(create.collection, create.id, client) != nil {
                var applied: [(OutboxRequest, [String: JSONValue]?)] = []
                for request in entry.requests {
                    applied.append((request, request.method == "DELETE" ? nil : try await existing(request.collection, request.id, client)))
                }
                return applied
            }
            throw classify(error)
        }
    }

    /// Keeps a note's text that changed on another device and saves this device's text as a draft copy.
    private func resolveBodyConflict(_ request: OutboxRequest, base: String, entryID: String, _ client: PocketBaseClient) async throws -> OutboxRequest {
        guard let server = try await existing("knowledge", request.id, client) else { throw ReplayFailure.gone }
        let remote = Self.digest(server["body"])
        guard remote != base, remote != Self.digest(request.body["body"]) else { return request }
        let local = view().tables["knowledge"]?[request.id] ?? server
        var copy = local.filter { ["summary", "project", "linkedProjects", "sources", "locator", "category"].contains($0.key) }
        let title: String; if case .string(let value)? = local["title"] { title = value } else { title = "Note" }
        let copyID = String(Self.digest(.string("conflict:" + entryID)).prefix(15))
        copy["id"] = .string(copyID); copy["owner"] = .string(owner)
        copy["title"] = .string(String((title + " (conflicted copy)").prefix(300)))
        copy["body"] = request.body["body"] ?? .string("")
        copy["status"] = .string("draft"); copy["reviewStep"] = .number(0); copy["nextReviewAt"] = .number(0)
        let created: [String: JSONValue]
        do { created = try object(await client.request("api/collections/knowledge/records", method: "POST", body: copy)) }
        catch {
            guard let saved = try await existing("knowledge", copyID, client) else { throw classify(error) }
            created = saved
        }
        restore("knowledge", created)
        notice = "“\(title)” was also edited on another device. Your text was saved as a separate draft note."
        var remaining = request
        remaining.body["body"] = nil
        return remaining
    }

    private func acknowledge(_ entryID: String, _ applied: [(OutboxRequest, [String: JSONValue]?)]) {
        outbox.removeAll { $0.id == entryID }
        try? saveOutbox()
        for (request, row) in applied {
            if request.method == "DELETE" {
                Self.delete(request.collection, id: request.id, from: &rows, trimmed: &trimmed)
                dirtyCollections.formUnion(RecordSchema.replicated)
            } else if let row {
                restore(request.collection, row)
                if request.collection == "habit_entries", case .string(let day)? = row["day"],
                   let start = state.habits?.windowStart, day < start { state.habits?.dirty = true }
            }
        }
        changed()
    }

    // MARK: Pull

    /// Downloads records changed since the last pull, removes records deleted elsewhere,
    /// and applies the retention rules. Returns whether anything visible changed.
    @discardableResult
    public func pull(_ client: PocketBaseClient, reconcile requested: Bool = false) async throws -> Bool {
        loadIfNeeded()
        let date = now(), seconds = date.timeIntervalSince1970
        let sessionStart = ((seconds - 90 * 86_400) * 1000).rounded(.down)
        let habitStart = String(format: "%04d-01-01", DayKey(date: date).year - 1)
        var changed = !state.initialized
        changed = advanceHabitWindow(to: habitStart) || changed
        state.sessionWindowStart = sessionStart
        func window(_ collection: String) -> String {
            switch collection {
            case "pomodoro_sessions": return "mode = 'running' || lastTick >= \(Int(sessionStart))"
            case "habit_entries": return "day >= \(RecordFilters.literal(habitStart))"
            default: return ""
            }
        }
        for collection in RecordSchema.replicated {
            let cursor = state.cursors[collection] ?? ""
            var latest = cursor, after: (updated: String, id: String)?
            while true {
                let keyset = after.map { "updated > \(RecordFilters.literal($0.updated)) || (updated = \(RecordFilters.literal($0.updated)) && id > \(RecordFilters.literal($0.id)))" }
                    ?? (cursor.isEmpty ? "" : "updated >= \(RecordFilters.literal(cursor))")
                let page: RecordPage<[String: JSONValue]> = try await client.listPage(collection, perPage: 500,
                    filter: RecordFilters.and([keyset, window(collection)]), sort: "updated,id")
                for item in page.items {
                    guard case .string(let id)? = item["id"] else { continue }
                    var row = item
                    for key in ["expand", "collectionId", "collectionName"] { row[key] = nil }
                    let updated: String; if case .string(let value)? = row["updated"] { updated = value } else { updated = "" }
                    if updated > latest { latest = updated }
                    after = (updated, id)
                    // Rows at the cursor arrive again; unchanged ones (ignoring trimmed text) are skipped.
                    var current = rows[collection]?[id]
                    for field in trimmed[collection]?[id] ?? [] { current?[field] = row[field] }
                    if current == row { continue }
                    changed = true
                    if collection == "pomodoro_sessions" { credit(row, id: id, updated: updated) }
                    restore(collection, row)
                }
                if page.items.count < 500 { break }
            }
            if collection == "habit_entries", !cursor.isEmpty, state.habits != nil {
                let older: RecordPage<RecordID> = try await client.listPage("habit_entries", perPage: 1,
                    filter: RecordFilters.and(["updated >= \(RecordFilters.literal(cursor))", "day < \(RecordFilters.literal(habitStart))"]), fields: "id")
                if older.totalItems > 0 { state.habits?.dirty = true }
            }
            rows[collection] = rows[collection] ?? [:]
            state.cursors[collection] = latest
            dirtyCollections.insert(collection)
        }
        if requested || state.lastReconcile.map({ seconds - $0 > 6 * 3600 }) ?? true {
            for collection in RecordSchema.replicated {
                var ids = Set<String>(), after = ""
                while true {
                    let page: RecordPage<RecordID> = try await client.listPage(collection, perPage: 1000,
                        filter: RecordFilters.and([after.isEmpty ? "" : "id > \(RecordFilters.literal(after))", window(collection)]), sort: "id", fields: "id")
                    ids.formUnion(page.items.map(\.id))
                    after = page.items.last?.id ?? after
                    if page.items.count < 1000 { break }
                }
                let removed = (rows[collection] ?? [:]).keys.filter { !ids.contains($0) }
                guard !removed.isEmpty else { continue }
                for id in removed { rows[collection]?[id] = nil; trimmed[collection]?[id] = nil }
                if collection == "habits" { state.habits?.dirty = true }
                dirtyCollections.insert(collection); changed = true; self.changed()
            }
            state.lastReconcile = seconds
        }
        changed = evictOutsideWindows(sessionStart: sessionStart, habitStart: habitStart) || changed
        if state.focus == nil { state.focus = try await focusSummary(client) }
        if state.habits == nil || state.habits?.dirty == true { state.habits = try await habitBaseline(client, windowStart: habitStart) }
        state.habitWindowStart = habitStart
        retain()
        state.initialized = true; state.lastPull = seconds; stateDirty = true
        flush()
        return changed
    }

    private func evictOutsideWindows(sessionStart: Double, habitStart: String) -> Bool {
        let pending = Set(outbox.flatMap { $0.requests.map(\.id) })
        var evicted = false
        for (id, row) in rows["pomodoro_sessions"] ?? [:] where !pending.contains(id) {
            guard row["mode"] != .string("running"), case .number(let tick)? = row["lastTick"], tick < sessionStart else { continue }
            rows["pomodoro_sessions"]?[id] = nil; evicted = true
        }
        for (id, row) in rows["habit_entries"] ?? [:] where !pending.contains(id) {
            guard case .string(let day)? = row["day"], day < habitStart else { continue }
            rows["habit_entries"]?[id] = nil; evicted = true
        }
        if evicted { dirtyCollections.formUnion(["pomodoro_sessions", "habit_entries"]); changed() }
        return evicted
    }

    /// Before entries leave the device each new year, their streaks are folded into the baseline.
    private func advanceHabitWindow(to start: String) -> Bool {
        guard let previous = state.habitWindowStart, start > previous else { return false }
        if var baseline = state.habits, !baseline.dirty, baseline.windowStart == previous {
            let rules = HabitRules(rows)
            let entries = habitEntries(rows).filter { $0.day >= previous && $0.day < start }
            for entry in entries where rules.completes(habit: entry.habit, day: entry.day, value: entry.value) {
                guard let day = DayKey(rawValue: entry.day) else { continue }
                baseline.byHabit[entry.habit, default: StreakAccumulator()].append(day); baseline.overall.append(day)
            }
            baseline.windowStart = start
            state.habits = baseline
        }
        state.habitWindowStart = start; stateDirty = true
        return true
    }

    private func habitEntries(_ tables: RecordTables) -> [(id: String, habit: String, day: String, value: Double)] {
        (tables["habit_entries"] ?? [:]).values.compactMap { row in
            guard case .string(let id)? = row["id"], case .string(let habit)? = row["habit"], case .string(let day)? = row["day"],
                  case .number(let value)? = row["value"] else { return nil }
            return (id, habit, day, value)
        }.sorted { ($0.day, $0.habit, $0.id) < ($1.day, $1.habit, $1.id) }
    }

    // MARK: Totals

    private static func credit(_ row: [String: JSONValue]) -> Int {
        guard case .number(let minutes)? = row["durationMinutes"], case .number(let remaining)? = row["remainingSeconds"] else { return 0 }
        return max(0, Int(minutes) * 60 - Int(remaining))
    }

    private func credit(_ row: [String: JSONValue], id: String, updated: String) {
        guard var focus = state.focus, row["mode"] == .string("complete") else { return }
        if updated < focus.cursor || (updated == focus.cursor && focus.atCursor.contains(id)) { return }
        if let index = state.countedSessions.firstIndex(of: id) { state.countedSessions.remove(at: index) }
        else { focus.total += Self.credit(row) }
        if updated > focus.cursor { focus.cursor = updated; focus.atCursor = [id] } else { focus.atCursor.append(id) }
        state.focus = focus; stateDirty = true
    }

    private func focusSummary(_ client: PocketBaseClient) async throws -> FocusSummary {
        var summary = FocusSummary(total: 0, cursor: "", atCursor: [])
        var after: (updated: String, id: String)?
        while true {
            let keyset = after.map { "updated > \(RecordFilters.literal($0.updated)) || (updated = \(RecordFilters.literal($0.updated)) && id > \(RecordFilters.literal($0.id)))" } ?? ""
            let page: RecordPage<[String: JSONValue]> = try await client.listPage("pomodoro_sessions", perPage: 500,
                filter: RecordFilters.and(["mode = 'complete'", keyset]), sort: "updated,id", fields: "id,durationMinutes,remainingSeconds,updated,mode")
            for row in page.items {
                guard case .string(let id)? = row["id"] else { continue }
                let updated: String; if case .string(let value)? = row["updated"] { updated = value } else { updated = "" }
                summary.total += Self.credit(row)
                if updated > summary.cursor { summary.cursor = updated; summary.atCursor = [id] } else { summary.atCursor.append(id) }
                after = (updated, id)
            }
            if page.items.count < 500 { break }
        }
        state.countedSessions = []
        return summary
    }

    private func habitBaseline(_ client: PocketBaseClient, windowStart: String) async throws -> HabitBaseline {
        let rules = HabitRules(rows)
        var baseline = HabitBaseline(windowStart: windowStart, byHabit: [:], overall: StreakAccumulator())
        var stream = PageStream<HabitEntryRecord>(api: client, collection: "habit_entries",
            filter: "day < \(RecordFilters.literal(windowStart))", sort: "day,habit,id", fields: "id,habit,day,value")
        while let entry = try await stream.next() {
            guard rules.completes(habit: entry.habit, day: entry.day, value: entry.value), let day = DayKey(rawValue: entry.day) else { continue }
            baseline.byHabit[entry.habit, default: StreakAccumulator()].append(day); baseline.overall.append(day)
        }
        return baseline
    }

    /// Lifetime focus: the downloaded total plus local completions PocketBase hasn't counted yet.
    public func focusTotal(pending: [FocusSession]) -> Int? {
        loadIfNeeded()
        guard state.initialized, let focus = state.focus else { return nil }
        let counted = Set(state.countedSessions)
        return focus.total + pending.filter { $0.mode == .complete && !counted.contains($0.id) && rows["pomodoro_sessions"]?[$0.id] == nil }
            .reduce(0) { $0 + $1.creditedSeconds }
    }

    /// Records a timer completion PocketBase just accepted so totals include it before the next pull.
    public func recordCompletedSession(_ session: FocusSession) {
        loadIfNeeded()
        guard session.mode == .complete, state.initialized else { return }
        let alreadyCounted = rows["pomodoro_sessions"]?[session.id]?["mode"] == .string("complete")
        rows["pomodoro_sessions", default: [:]][session.id] = ["id": .string(session.id), "task": .string(session.task),
            "durationMinutes": .number(Double(session.durationMinutes)), "mode": .string("complete"),
            "remainingSeconds": .number(Double(session.remainingSeconds)), "isActive": .bool(false), "lastTick": .number(session.lastTick),
            "owner": .string(owner), "updated": .string(RecordSchema.timestamp(now())), "created": .string(RecordSchema.timestamp(now()))]
        if var focus = state.focus, !alreadyCounted, !state.countedSessions.contains(session.id), !focus.atCursor.contains(session.id) {
            focus.total += session.creditedSeconds
            state.focus = focus
            state.countedSessions = Array((state.countedSessions + [session.id]).suffix(200))
        }
        dirtyCollections.insert("pomodoro_sessions"); stateDirty = true
        changed()
    }

    /// Lifetime streaks from the saved baseline plus the entries kept on this device.
    public func habitStatistics(through today: DayKey, habit: String? = nil) -> HabitStatistics? {
        loadIfNeeded()
        guard state.initialized, let baseline = state.habits else { return nil }
        let tables = view().tables, rules = HabitRules(tables)
        let habits = Set((tables["habits"] ?? [:]).keys.filter { habit == nil || $0 == habit })
        var runs = baseline.byHabit.filter { habits.contains($0.key) }
        var overall = habit.map { baseline.byHabit[$0] ?? StreakAccumulator() } ?? baseline.overall
        for entry in habitEntries(tables) where (habit == nil || entry.habit == habit) && entry.day >= baseline.windowStart && entry.day <= today.rawValue {
            guard habits.contains(entry.habit), rules.completes(habit: entry.habit, day: entry.day, value: entry.value),
                  let day = DayKey(rawValue: entry.day) else { continue }
            runs[entry.habit, default: StreakAccumulator()].append(day); overall.append(day)
        }
        return HabitStatistics(overall: overall.result(today), byID: Dictionary(habits.map {
            (HabitWire.identity($0), (runs[$0] ?? StreakAccumulator()).result(today))
        }, uniquingKeysWith: { _, last in last }))
    }

    // MARK: Retention

    /// Frees large text on older records while keeping every list complete.
    public func freeUpSpace() {
        loadIfNeeded()
        retain(tight: true)
        flush()
    }

    func retain(tight: Bool = false) {
        let date = now(), seconds = date.timeIntervalSince1970, day = 86_400.0
        let pending = Set(outbox.flatMap { $0.requests.map(\.id) })
        let doneCutoff = RecordSchema.timestamp(tight ? date : date.addingTimeInterval(-30 * day))
        let noteCutoff = RecordSchema.timestamp(date.addingTimeInterval((tight ? -7 : -90) * day))
        let accessCutoff = seconds - 30 * day, reviewHorizon = (seconds + 7 * day) * 1000
        let active = Set((rows["projects"] ?? [:]).filter { $0.value["isDone"] != .bool(true) }.keys)
        let filed = Set(active.flatMap { RecordSchema.ids(rows["projects"]?[$0]?["captures"]) })
        func cold(_ collection: String, _ id: String, _ row: [String: JSONValue]) -> Bool {
            let updated: String; if case .string(let value)? = row["updated"] { updated = value } else { updated = "" }
            switch collection {
            case "projects", "tasks": return row["isDone"] == .bool(true) && updated < doneCutoff
            case "captures":
                let reminder: Bool; if case .number(let at)? = row["reminderAt"], at > 0, row["reminderDone"] != .bool(true) { reminder = true } else { reminder = false }
                return row["isProcessed"] == .bool(true) && updated < doneCutoff && !reminder && !filed.contains(id)
            case "knowledge":
                let due: Bool; if row["status"] == .string("evergreen"), case .number(let next)? = row["nextReviewAt"], next > 0, next <= reviewHorizon { due = true } else { due = false }
                let linked = !active.isDisjoint(with: RecordSchema.ids(row["project"]) + RecordSchema.ids(row["linkedProjects"]))
                return updated < noteCutoff && !due && !linked
            default: return false
            }
        }
        var warm: [(collection: String, id: String, accessed: Double)] = []
        for (collection, fields) in RecordSchema.heavyFields {
            for (id, row) in rows[collection] ?? [:] where !pending.contains(id) && cold(collection, id, row) {
                if (trimmed[collection]?[id] ?? []).isSuperset(of: fields) { continue }
                if !tight, let accessed = state.accessed[collection + "/" + id], accessed > accessCutoff { warm.append((collection, id, accessed)); continue }
                trim(collection, id, fields)
            }
        }
        // Recently opened older records stay whole, most recent first, up to a limit.
        for item in warm.sorted(by: { $0.accessed > $1.accessed }).dropFirst(tight ? 0 : 200) {
            trim(item.collection, item.id, RecordSchema.heavyFields[item.collection] ?? [])
        }
        state.accessed = state.accessed.filter { $0.value > accessCutoff }
        stateDirty = true
    }

    private func trim(_ collection: String, _ id: String, _ fields: Set<String>) {
        guard var row = rows[collection]?[id] else { return }
        var marks = trimmed[collection]?[id] ?? []
        for field in fields where !marks.contains(field) {
            if collection == "captures", field == "note", case .string(let note)? = row[field] {
                row[field] = .string(String(WorkspaceRules.plainText(note).prefix(160)))
            } else { row[field] = .string("") }
            marks.insert(field)
        }
        rows[collection]?[id] = row
        trimmed[collection, default: [:]][id] = marks
        dirtyCollections.insert(collection)
        changed()
    }
}
