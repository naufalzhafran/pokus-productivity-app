import Foundation
import PokusCore

public enum WorkspaceCollection: String, Sendable {
    case projects, tasks, categories, captures, knowledge
}

public enum WorkspaceRecord: Sendable {
    case project(Project), task(FocusTask), category(FocusCategory), capture(Capture), knowledge(Knowledge)

    static func decode(_ data: Data, collection: WorkspaceCollection) throws -> Self {
        let decoder = JSONDecoder()
        switch collection {
        case .projects: return .project(try decoder.decode(Project.self, from: data))
        case .tasks: return .task(try decoder.decode(FocusTask.self, from: data))
        case .categories: return .category(try decoder.decode(FocusCategory.self, from: data))
        case .captures: return .capture(try decoder.decode(Capture.self, from: data))
        case .knowledge: return .knowledge(try decoder.decode(Knowledge.self, from: data))
        }
    }
}

extension PocketBaseClient {
    public func save(_ collection: WorkspaceCollection, id: String?, creationID: String?,
                     fields: [String: JSONValue], owner: String) async throws -> WorkspaceRecord {
        var body = fields
        if id == nil {
            guard let creationID else { throw PokusError.message("This submission has no identifier.") }
            body["id"] = .string(creationID)
            body["owner"] = .string(owner)
        }
        do {
            let data = try await request("api/collections/\(collection.rawValue)/records" + (id.map { "/\($0)" } ?? ""),
                                         method: id == nil ? "POST" : "PATCH", body: body)
            return try WorkspaceRecord.decode(data, collection: collection)
        } catch {
            // A committed POST may have lost its response. The draft keeps this ID on retry.
            if id == nil, let creationID,
               let data = try? await request("api/collections/\(collection.rawValue)/records/\(creationID)") {
                return try WorkspaceRecord.decode(data, collection: collection)
            }
            throw error
        }
    }

    public func createCapture(id: String, fields: [String: JSONValue], projectID: String?, owner: String) async throws -> Capture {
        guard let projectID, !projectID.isEmpty else {
            let record = try await save(.captures, id: nil, creationID: id, fields: fields, owner: owner)
            guard case .capture(let capture) = record else { throw URLError(.cannotParseResponse) }
            return capture
        }
        var body = fields
        body["id"] = .string(id); body["owner"] = .string(owner)
        do {
            _ = try await request("api/batch", method: "POST", body: ["requests": .array([
                .object(["method": .string("POST"), "url": .string("/api/collections/captures/records"), "body": .object(body)]),
                .object(["method": .string("PATCH"), "url": .string("/api/collections/projects/records/\(projectID)"), "body": .object(["captures+": .array([.string(id)])])])
            ])])
        } catch {
            if let existing: Capture = try? await record("captures", id: id) { return existing }
            throw error
        }
        guard let capture: Capture = try await record("captures", id: id) else { throw URLError(.cannotParseResponse) }
        return capture
    }
}
