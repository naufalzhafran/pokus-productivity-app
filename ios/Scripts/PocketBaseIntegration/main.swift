import Foundation
import DailyCore
import PokusCore
import PokusNetworking

func check(_ condition: Bool, _ message: String) throws {
    if !condition { throw PokusError.message("Integration check failed: \(message)") }
}
let endpoint = CommandLine.arguments.dropFirst().first ?? "http://127.0.0.1:8099"
guard let url = URL(string: endpoint), ["127.0.0.1", "localhost"].contains(url.host ?? "") else {
    fatalError("Integration tests require an isolated local PocketBase server.")
}
var admin = PocketBaseClient(baseURL: url)
let adminData = try await admin.request("api/collections/_superusers/auth-with-password", method: "POST", body: ["identity": .string("pokus-test@example.com"), "password": .string("Pokus-local-test-2026!")])
admin.token = try JSONDecoder().decode(Authentication.self, from: adminData).token
let email = "native-\(UUID().uuidString)@example.com"
let password = "Pokus-test-user-2026!"
let userData = try await admin.request("api/collections/users/records", method: "POST", body: ["email": .string(email), "password": .string(password), "passwordConfirm": .string(password)])
let owner = try JSONDecoder().decode(Account.self, from: userData).id
var client = PocketBaseClient(baseURL: url)
let authentication = try await client.request("api/collections/users/auth-with-password", method: "POST", body: ["identity": .string(email), "password": .string(password)])
client.token = try JSONDecoder().decode(Authentication.self, from: authentication).token
func makeTask() async throws -> String {
    let id = FocusSession.makeID()
    try await client.mutate("tasks", body: ["id": .string(id), "owner": .string(owner), "title": .string("Native integration task"), "focusedSeconds": .number(100), "priority": .string("none")])
    return id
}
func completed(task: String) -> FocusSession {
    SessionEngine().finish(FocusSession(task: task, durationMinutes: 25, now: Date().addingTimeInterval(-2000)), save: true)
}
func operation(_ session: FocusSession) -> SessionOperation {
    SessionOperation(revision: 1, session: session)
}
let task = try await makeTask()
let session = completed(task: task)
_ = try await client.send(operation(session), owner: owner)
_ = try await client.send(operation(session), owner: owner)
let credited: FocusTask? = try await client.record("tasks", id: task)
try check(credited?.focusedSeconds == 1600, "duplicate completion credits once")
let lostClient = PocketBaseClient(baseURL: url, token: client.token, transport: { request in
    let (data, response) = try await URLSession.shared.data(for: request)
    let http = response as! HTTPURLResponse
    if request.url?.path == "/api/batch", (200..<300).contains(http.statusCode) { throw URLError(.networkConnectionLost) }
    return (data, http)
})
let lostTask = try await makeTask()
let lost = completed(task: lostTask)
_ = try await lostClient.send(operation(lost), owner: owner)
let recovered: FocusTask? = try await client.record("tasks", id: lostTask)
try check(recovered?.focusedSeconds == 1600, "lost response reconciles committed batch")
let removedTask = try await makeTask()
try await client.delete("tasks", id: removedTask)
let withoutTask = try await client.send(operation(completed(task: removedTask)), owner: owner)
try check(withoutTask.task.isEmpty, "deleted task keeps session history without credit")
let discard = SessionEngine().finish(FocusSession(durationMinutes: 25, now: .now), save: false)
_ = try await client.send(operation(discard), owner: owner)
var oldRunning = discard; oldRunning.mode = .running; oldRunning.isActive = true
let authoritative = try await client.send(operation(oldRunning), owner: owner)
try check(authoritative.mode == .discarded, "terminal session cannot be resurrected")
let workspace = try await client.workspace()
try check(workspace.history.contains { $0.id == session.id }, "workspace and history decoding")
let cursor = workspace.history.compactMap(\.updated).max()
try check(cursor != nil, "session history includes server update timestamps")
let lateSession = SessionEngine(now: { Date().addingTimeInterval(-86400) }).finish(
    FocusSession(durationMinutes: 25, now: Date().addingTimeInterval(-90000)), save: true)
_ = try await client.send(operation(lateSession), owner: owner)
let incremental = try await client.workspace(historySince: cursor)
try check(incremental.history.contains { $0.id == lateSession.id }, "incremental refresh includes late offline completion")
let lostCreateClient = PocketBaseClient(baseURL: url, token: client.token, transport: { request in
    let (data, response) = try await URLSession.shared.data(for: request)
    let http = response as! HTTPURLResponse
    if request.httpMethod == "POST", (200..<300).contains(http.statusCode) { throw URLError(.networkConnectionLost) }
    return (data, http)
})
let retryProjectID = FocusSession.makeID()
for _ in 0..<2 {
    let result = try await lostCreateClient.save(.projects, id: nil, creationID: retryProjectID,
                                               fields: ["title": .string("Retry-safe project")], owner: owner)
    guard case .project(let project) = result else { throw PokusError.message("Expected created project") }
    try check(project.id == retryProjectID, "lost create response reconciles the original record")
}
let retryCaptureID = FocusSession.makeID()
for _ in 0..<2 {
    let capture = try await lostCreateClient.createCapture(id: retryCaptureID,
        fields: ["kind": .string("note"), "note": .string("<p>Retry-safe capture</p>")], projectID: retryProjectID, owner: owner)
    try check(capture.id == retryCaptureID, "lost capture batch response reconciles the original record")
}
let linkedRetryProject: Project? = try await client.record("projects", id: retryProjectID)
try check(linkedRetryProject?.captures == [retryCaptureID], "capture retry files exactly one relation")
let captureID = FocusSession.makeID()
let projectID = FocusSession.makeID()
let noteID = FocusSession.makeID()
try await client.mutate("captures", body: ["id": .string(captureID), "owner": .string(owner), "kind": .string("book"), "title": .string("Native source"), "author": .string("Test author"), "note": .string("<p><strong>Keep formatting</strong></p>"), "isProcessed": .bool(false)])
try await client.mutate("projects", body: ["id": .string(projectID), "owner": .string(owner), "title": .string("Library integration"), "status": .string("active"), "captures": .array([.string(captureID)])])
try await client.mutate("knowledge", body: ["id": .string(noteID), "owner": .string(owner), "title": .string("Source idea"), "summary": .string("Summary"), "body": .string("<p><em>Keep body</em></p>"), "project": .string(projectID), "linkedProjects": .array([]), "sources": .array([.string(captureID)]), "locator": .string("Page 12"), "status": .string("evergreen"), "reviewStep": .number(0), "nextReviewAt": .number(1000)])
let staged = try await RecordReader(api: client, query: RecordQueries.captures(stage: "in_progress")).next()
try check(staged.items.contains { $0.id == captureID }, "capture stages use server back-relations")
let inbox = try await RecordReader(api: client, query: RecordQueries.captures(stage: "inbox")).next()
try check(!inbox.items.contains { $0.id == captureID }, "filed sources are excluded from Inbox")
for index in 0..<60 {
    try await client.mutate("tasks", body: ["id": .string(FocusSession.makeID()), "owner": .string(owner), "title": .string("Paged task \(index)"),
        "project": .string(projectID), "priority": .string(index % 2 == 0 ? "urgent" : "low"), "isDone": .bool(false),
        "description": .string(index >= 30 ? "<p>Caf&#233; &amp; Unicode</p>" : "Other")])
}
let taskReader = RecordReader(api: client, query: RecordQueries.tasks(project: projectID))
let firstTasks = try await taskReader.next(); await taskReader.accept()
let secondTasks = try await taskReader.next(); await taskReader.accept()
let lastTasks = try await taskReader.next()
try check(firstTasks.items.count == 25 && secondTasks.items.count == 25 && lastTasks.items.count == 10 && !lastTasks.hasMore, "real server paging boundaries")
try check(firstTasks.items.allSatisfy { $0.priority == .urgent && $0.projectTitle == "Library integration" }, "stable priority segments and projected relation labels")
let searchTasks = try await RecordReader(api: client, query: RecordQueries.tasks(project: projectID, search: "café & unicode")).next()
try check(searchTasks.items.count == 25, "sparse HTML/Unicode search crosses pages")
try check(try await client.projectSummary(projectID).total == 60, "project summaries include unloaded tasks")
let library = try await client.library()
try check(library.captures.contains { $0.id == captureID && $0.kind == .book }, "capture decoding")
try check(library.knowledge.contains { $0.id == noteID && $0.isDue() }, "review queue decoding")
try await client.mutate("captures", id: captureID, body: ["title": .string("Renamed source"), "isProcessed": .bool(true)])
let capture: Capture? = try await client.record("captures", id: captureID)
try check(capture?.note == "<p><strong>Keep formatting</strong></p>", "capture metadata edits preserve HTML")
let next = LibraryRules.review(step: 0, remembered: true)
try await client.mutate("knowledge", id: noteID, body: ["reviewStep": .number(Double(next.step)), "nextReviewAt": .number(next.next)])
let reviewed: Knowledge? = try await client.record("knowledge", id: noteID)
try check(reviewed?.reviewStep == 1 && reviewed?.isDue() == false, "review rescheduling")
try check(reviewed?.body == "<p><em>Keep body</em></p>", "review preserves rich body")
try await client.mutate("projects", id: projectID, body: ["captures-": .array([.string(captureID)])])
let unfiled: Project? = try await client.record("projects", id: projectID)
try check(unfiled?.captures?.isEmpty == true, "unfiling preserves capture")
try await client.delete("captures", id: captureID)
let withoutSource: Knowledge? = try await client.record("knowledge", id: noteID)
try check(withoutSource?.sources.isEmpty == true && withoutSource?.body == reviewed?.body, "deleting source preserves knowledge")
try await client.delete("projects", id: projectID)
let withoutProject: Knowledge? = try await client.record("knowledge", id: noteID)
try check(withoutProject?.project.isEmpty == true, "deleting project preserves knowledge")
try await client.delete("knowledge", id: noteID)
let habitID = FocusSession.makeID()
let day = "2026-01-01", nextDay = "2026-01-02"
try await client.habitBatch([
    ("POST", "habits", nil, ["id": .string(habitID), "owner": .string(owner), "name": .string("Read"), "kind": .string("number"), "unit": .string("pages"), "startDay": .string(day)]),
    ("POST", "habit_targets", nil, ["id": .string(HabitWire.dailyID("habit_targets", habit: habitID, day: day)), "owner": .string(owner), "habit": .string(habitID), "day": .string(day), "target": .number(10)])
])
let entryID = try await client.habitDailyID("habit_entries", habit: habitID, day: day)
let entryFields: [String: JSONValue] = ["id": .string(entryID), "owner": .string(owner), "habit": .string(habitID), "day": .string(day), "value": .number(10)]
try await client.habitBatch([("PUT", "habit_entries", nil, entryFields)])
try await client.habitBatch([("PUT", "habit_entries", nil, entryFields)])
let targetID = try await client.habitDailyID("habit_targets", habit: habitID, day: nextDay)
try await client.habitBatch([
    ("PATCH", "habits", habitID, ["name": .string("Read books")]),
    ("PUT", "habit_targets", nil, ["id": .string(targetID), "owner": .string(owner), "habit": .string(habitID), "day": .string(nextDay), "target": .number(20)])
])
let habits = try await client.habits()
let selectedDay = try await client.habitDay(DayKey(rawValue: day)!)
try check(selectedDay.completed == [habitID], "compact habit day index uses historical targets")
let yearly = try await client.habitActivity(year: 2026, today: DayKey(rawValue: nextDay)!, habit: habitID)
try check(yearly.individual?.target(on: DayKey(rawValue: nextDay)!) == 20, "activity includes target changes without entries")
let streaks = try await client.habitStatistics(through: DayKey(rawValue: nextDay)!)
try check(streaks.overall.current == 1 && streaks.overall.completedDays == 1, "streaming streak retains unfinished-today rule")
try check(habits.entries.count == 1 && habits.targets.count == 2, "daily upsert is idempotent and historical targets survive")
try check(try habits.histories().first?.name == "Read books", "native habit history decoding")
let anonymous = PocketBaseClient(baseURL: url)
try check(try await anonymous.habits().habits.isEmpty, "anonymous habit reads reveal nothing")
do { try await anonymous.mutate("habits", id: habitID, body: ["name": .string("Forbidden")]); throw PokusError.message("anonymous habit mutation was accepted") }
catch is APIError {}
let otherEmail = "native-other-\(UUID().uuidString)@example.com"
let otherData = try await admin.request("api/collections/users/records", method: "POST", body: ["email": .string(otherEmail), "password": .string(password), "passwordConfirm": .string(password)])
let otherOwner = try JSONDecoder().decode(Account.self, from: otherData).id
var otherClient = PocketBaseClient(baseURL: url)
let otherAuth = try await otherClient.request("api/collections/users/auth-with-password", method: "POST", body: ["identity": .string(otherEmail), "password": .string(password)])
otherClient.token = try JSONDecoder().decode(Authentication.self, from: otherAuth).token
try check(try await otherClient.habits().habits.isEmpty, "another account cannot read habits")
do { try await otherClient.mutate("habits", id: habitID, body: ["name": .string("Forbidden")]); throw PokusError.message("cross-account habit mutation was accepted") }
catch is APIError {}
try await client.delete("habits", id: habitID)
let deletedHabits = try await client.habits()
try check(deletedHabits.habits.isEmpty && deletedHabits.entries.isEmpty && deletedHabits.targets.isEmpty, "habit deletion cascades to entries and targets")
// The on-device replica against real PocketBase filters, batches, cascades, and timestamps.
let replicaDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("pokus-replica-\(UUID().uuidString)")
let replica = RecordReplica(directory: replicaDirectory, owner: owner)
try await replica.pull(client, reconcile: true)
let offline = client.routing(through: replica, history: nil, online: false)
let replicaProject = FocusSession.makeID(), replicaTask = FocusSession.makeID()
_ = try await offline.save(.projects, id: nil, creationID: replicaProject, fields: ["title": .string("Offline project"), "status": .string("active"), "isDone": .bool(false)], owner: owner)
_ = try await offline.save(.tasks, id: nil, creationID: replicaTask, fields: ["title": .string("Offline task"), "project": .string(replicaProject),
    "priority": .string("high"), "isDone": .bool(false), "focusedSeconds": .number(0)], owner: owner)
let offlineTasks = try await RecordReader(api: offline, query: RecordQueries.tasks(project: replicaProject)).next()
try check(offlineTasks.items.map(\.projectTitle) == ["Offline project"], "offline edits read back with relation labels")
try await replica.push(client)
let syncedTask: FocusTask? = try await client.record("tasks", id: replicaTask)
try check(syncedTask?.project == replicaProject, "queued creates sync in order")
try await client.mutate("tasks", id: replicaTask, body: ["title": .string("Renamed on the web")])
try await replica.pull(client)
let renamedTask: FocusTask? = try await offline.record("tasks", id: replicaTask)
try check(renamedTask?.title == "Renamed on the web", "delta pull applies remote edits")
try await client.delete("tasks", id: replicaTask)
try await replica.pull(client, reconcile: true)
let removedRemotely: FocusTask? = try await offline.record("tasks", id: replicaTask)
try check(removedRemotely == nil, "reconcile removes records deleted elsewhere")
let replicaHabit = FocusSession.makeID(), today = DayKey()
try await offline.habitBatch([
    ("POST", "habits", nil, ["id": .string(replicaHabit), "owner": .string(owner), "name": .string("Offline habit"), "kind": .string("number"), "unit": .string("pages"), "startDay": .string(today.rawValue)]),
    ("POST", "habit_targets", nil, ["id": .string(HabitWire.dailyID("habit_targets", habit: replicaHabit, day: today.rawValue)), "owner": .string(owner), "habit": .string(replicaHabit), "day": .string(today.rawValue), "target": .number(3)])
])
let replicaEntry = try await offline.habitDailyID("habit_entries", habit: replicaHabit, day: today.rawValue)
try await offline.habitBatch([("PUT", "habit_entries", nil, ["id": .string(replicaEntry), "owner": .string(owner), "habit": .string(replicaHabit), "day": .string(today.rawValue), "value": .number(3)])])
try await replica.push(client)
try check(try await client.habitDay(today).completed.contains(replicaHabit), "offline habit batches sync as upserts")
try await replica.pull(client)
let serverStreaks = try await client.habitStatistics(through: today)
try check(await replica.habitStatistics(through: today)?.overall == serverStreaks.overall, "device streaks match the server")
let sharedNote = FocusSession.makeID()
try await client.mutate("knowledge", body: ["id": .string(sharedNote), "owner": .string(owner), "title": .string("Shared note"), "summary": .string(""),
    "body": .string("<p>Original</p>"), "linkedProjects": .array([]), "sources": .array([]), "status": .string("draft")])
try await replica.pull(client)
_ = try await offline.save(.knowledge, id: sharedNote, creationID: nil, fields: ["body": .string("<p>Phone</p>")], owner: owner)
try await client.mutate("knowledge", id: sharedNote, body: ["body": .string("<p>Web</p>")])
try await replica.push(client)
let keptNote: Knowledge? = try await client.record("knowledge", id: sharedNote)
try check(keptNote?.body == "<p>Web</p>", "text edited elsewhere is kept")
let copies: [Knowledge] = try await client.list("knowledge", filter: "title = 'Shared note (conflicted copy)'")
try check(copies.first?.body == "<p>Phone</p>" && copies.first?.status == .draft, "this device's text is saved as a draft copy")
try? FileManager.default.removeItem(at: replicaDirectory)
try await admin.delete("users", id: otherOwner)
try await admin.delete("users", id: owner)
print("PASS: native sessions, workspace, library, habit history/upserts, authenticated habit isolation, deletion compatibility, and the offline replica.")
