import Foundation
import Testing
@testable import PokusCore
@testable import PokusNetworking

private actor MockServer {
    var requests: [URLRequest] = []
    var committed: FocusSession?
    let loseBatchResponse: Bool
    let taskDeleted: Bool
    init(loseBatchResponse: Bool = false, taskDeleted: Bool = false) {
        self.loseBatchResponse = loseBatchResponse; self.taskDeleted = taskDeleted
    }
    func respond(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        let path = request.url!.path
        var status = 200; var data = Data("{}".utf8)
        if path.contains("pomodoro_sessions/records/") {
            if let committed { data = try JSONEncoder().encode(committed) } else { status = 404 }
        } else if path.contains("tasks/records/") {
            if taskDeleted { status = 404 }
            else { data = Data(#"{"id":"task00000000000","title":"Task","isDone":false,"focusedSeconds":0,"project":"","created":"2026-10-02"}"#.utf8) }
        } else if path == "/api/batch" {
            let body = try JSONDecoder().decode([String: JSONValue].self, from: request.httpBody!)
            guard case .array(let batch) = body["requests"], case .object(let first) = batch[0], let fields = first["body"] else { throw URLError(.badServerResponse) }
            committed = try JSONDecoder().decode(FocusSession.self, from: JSONEncoder().encode(fields))
            if loseBatchResponse { throw URLError(.networkConnectionLost) }
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
}
struct NetworkingTests {
    @Test func batchWireShapeAndDuplicateCompletion() async throws {
        let server = MockServer()
        let client = PocketBaseClient(token: "testtoken", transport: { try await server.respond($0) })
        let session = SessionEngine(now: { Date(timeIntervalSince1970: 2000) }).finish(FocusSession(task: "task00000000000", durationMinutes: 1, now: Date(timeIntervalSince1970: 1000)), save: true)
        let operation = SessionOperation(revision: 1, session: session)
        _ = try await client.send(operation, owner: "owner")
        _ = try await client.send(operation, owner: "owner")
        let requests = await server.requests
        let batches = requests.filter { $0.url!.path == "/api/batch" }
        #expect(batches.count == 1)
        #expect(batches[0].value(forHTTPHeaderField: "Authorization") == "testtoken")
        let body = try JSONSerialization.jsonObject(with: batches[0].httpBody!) as! [String: Any]
        let entries = body["requests"] as! [[String: Any]]
        #expect(entries.count == 3); #expect(entries[0]["method"] as? String == "PUT")
        let fields = entries[0]["body"] as! [String: Any]
        #expect(fields["lastTick"] as? Double == 2000000)
        #expect(fields["owner"] as? String == "owner")
        #expect((entries[2]["body"] as! [String: Any])["focusedSeconds+"] as? Int == 60)
    }
    @Test func lostCommittedResponseIsAcknowledgedWithoutSecondCredit() async throws {
        let server = MockServer(loseBatchResponse: true)
        let client = PocketBaseClient(transport: { try await server.respond($0) })
        let session = SessionEngine().finish(FocusSession(durationMinutes: 1, now: .now), save: true)
        let result = try await client.send(SessionOperation(revision: 1, session: session), owner: "owner")
        #expect(result.mode == .complete)
        let requests = await server.requests
        #expect(requests.filter { $0.url!.path == "/api/batch" }.count == 1)
    }
    @Test func deletedTaskGetsNoCredit() async throws {
        let server = MockServer(taskDeleted: true)
        let client = PocketBaseClient(transport: { try await server.respond($0) })
        let session = SessionEngine().finish(FocusSession(task: "task00000000000", durationMinutes: 1, now: .now), save: true)
        let result = try await client.send(SessionOperation(revision: 1, session: session), owner: "owner")
        #expect(result.task == "")
        let requests = await server.requests
        let body = try JSONSerialization.jsonObject(with: requests.last!.httpBody!) as! [String: Any]
        let entries = body["requests"] as! [[String: Any]]
        #expect(entries.count == 2)
        #expect((entries[1]["body"] as! [String: Any])["creditedSeconds"] as? Int == 0)
    }
    @Test func httpErrorIsActionable() async {
        let client = PocketBaseClient(transport: { request in
            (Data(), HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!)
        })
        await #expect(throws: APIError.self) { _ = try await client.request("api/test") }
    }
}
