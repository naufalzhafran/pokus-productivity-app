import Foundation
import PokusCore
import PokusNetworking

/// Editors submit domain values; wire field names and validation live at this boundary.
extension PokusModel {
    func saveProject(original: Project?, creationID: String, title: String, description: String,
                     status: ProjectStatus, dueDate: Date?, captureID: String?) async throws -> Bool {
        let clean = try WorkspaceRules.validateTitle(title, maximum: 120)
        var fields: [String: JSONValue] = ["title": .string(clean), "status": .string(status.rawValue),
            "dueDate": .string(dueDate.map(WorkspaceRules.dayKey) ?? "")]
        if original == nil {
            fields["description"] = .string(WorkspaceRules.paragraphHTML(description))
            fields["isDone"] = .bool(false)
            if let captureID { fields["captures"] = .array([.string(captureID)]) }
        }
        return await write(collection: .projects, id: original?.id, creationID: creationID, fields: fields)
    }

    func saveTask(original: FocusTask?, creationID: String, title: String, description: String,
                  projectID: String, priority: Priority, category: String, dueDate: Date? = nil) async throws -> Bool {
        let clean = try WorkspaceRules.validateTitle(title, maximum: 160, original: original?.title)
        var fields: [String: JSONValue] = ["title": .string(clean), "project": .string(projectID),
            "priority": .string(priority.rawValue), "category": .string(category),
            "dueDate": .string(dueDate.map(WorkspaceRules.dayKey) ?? "")]
        if original == nil {
            fields["description"] = .string(WorkspaceRules.paragraphHTML(description))
            fields["isDone"] = .bool(false); fields["focusedSeconds"] = .number(0)
        }
        return await write(collection: .tasks, id: original?.id, creationID: creationID, fields: fields)
    }

    func setCaptureProcessed(_ capture: Capture, processed: Bool) async throws {
        guard await write(collection: .captures, id: capture.id, fields: ["isProcessed": .bool(processed)]) else {
            throw PokusError.message(error ?? "Couldn't update this capture.")
        }
    }

    func deleteCapture(id: String) async throws {
        guard await write(collection: .captures, id: id, fields: [:], delete: true) else {
            throw PokusError.message(error ?? "Couldn't delete this capture.")
        }
    }

    func setCaptureReminder(id: String, date: Date?) async throws {
        let timestamp = date.map { ($0.timeIntervalSince1970 * 1000).rounded() } ?? 0
        if date != nil, !timestamp.isFinite || timestamp <= Date().timeIntervalSince1970 * 1000 || timestamp > 253402300799000 {
            throw PokusError.message("Choose a future date and time.")
        }
        guard await write(collection: .captures, id: id, fields: ["reminderAt": .number(timestamp), "reminderDone": .bool(false)]) else {
            throw PokusError.message(error ?? "Couldn't save this reminder.")
        }
    }

    func setCaptureReminderDone(id: String, done: Bool) async throws {
        guard await write(collection: .captures, id: id, fields: ["reminderDone": .bool(done)]) else {
            throw PokusError.message(error ?? "Couldn't update this reminder.")
        }
    }

    func saveCategory(original: FocusCategory?, creationID: String, name: String, color: String) async throws -> Bool {
        let clean = try WorkspaceRules.validateTitle(name, maximum: 40)
        return await write(collection: .categories, id: original?.id, creationID: creationID,
                           fields: ["name": .string(clean), "color": .string(color)])
    }

    func saveKnowledge(original: Knowledge?, creationID: String, title: String, summary: String,
                       locator: String, origin: String, category: String, status: KnowledgeStatus,
                       linkedProjects: Set<String>, sources: Set<String>, replacementBody: String?) async throws -> Bool {
        let clean = try WorkspaceRules.validateTitle(title, maximum: 300)
        guard summary.count <= 1000, locator.count <= 120 else {
            throw PokusError.message("Use up to 1,000 characters for the summary and 120 for the location.")
        }
        var fields: [String: JSONValue] = ["title": .string(clean),
            "summary": .string(summary.trimmingCharacters(in: .whitespacesAndNewlines)),
            "locator": .string(locator.trimmingCharacters(in: .whitespacesAndNewlines)),
            "project": .string(origin), "category": .string(category), "status": .string(status.rawValue)]
        let references = linkedProjects.subtracting([origin])
        for (field, selected, previous) in [("linkedProjects", references, Set(original?.linkedProjects ?? [])),
                                            ("sources", sources, Set(original?.sources ?? []))] {
            if original == nil { fields[field] = .array(selected.sorted().map(JSONValue.string)) }
            else {
                let added = selected.subtracting(previous), removed = previous.subtracting(selected)
                if !added.isEmpty { fields[field + "+"] = .array(added.sorted().map(JSONValue.string)) }
                if !removed.isEmpty { fields[field + "-"] = .array(removed.sorted().map(JSONValue.string)) }
            }
        }
        if let replacementBody { fields["body"] = .string(WorkspaceRules.paragraphHTML(replacementBody)) }
        if status == .draft { fields["reviewStep"] = .number(0); fields["nextReviewAt"] = .number(0) }
        else if original?.status != .evergreen || original?.nextReviewAt == 0 {
            fields["reviewStep"] = .number(0); fields["nextReviewAt"] = .number(LibraryRules.firstReview())
        }
        return await write(collection: .knowledge, id: original?.id, creationID: creationID, fields: fields)
    }

    func saveCapture(original: Capture?, creationID: String, projectID: String?, kind: CaptureKind,
                     title: String, url: String, author: String, replacementNote: String?) async throws -> Bool {
        let link = url.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = link.isEmpty ? "" : LibraryRules.captureURL(link)?.absoluteString ?? ""
        let note = replacementNote ?? WorkspaceRules.plainText(original?.note ?? "")
        guard link.isEmpty || !normalized.isEmpty else { throw PokusError.message("Enter a valid http or https link.") }
        guard [.note, .book].contains(kind) || !normalized.isEmpty else { throw PokusError.message("Add a link for this capture type.") }
        guard kind != .book || !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw PokusError.message("Enter the book's title.") }
        guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !normalized.isEmpty else {
            throw PokusError.message("Write a note or add a link.")
        }
        guard title.count <= 300, normalized.count <= 2048, note.count <= 10000, author.count <= 200 else {
            throw PokusError.message("Use up to 300 characters for the title, 2,048 for the link, 10,000 for the note, and 200 for the author.")
        }
        var fields: [String: JSONValue] = ["kind": .string(kind.rawValue),
            "title": .string(title.trimmingCharacters(in: .whitespacesAndNewlines)),
            "url": .string(normalized), "author": .string(kind == .book ? author : "")]
        if let replacementNote { fields["note"] = .string(WorkspaceRules.paragraphHTML(replacementNote)) }
        if original == nil { fields["isProcessed"] = .bool(false) }
        return await saveCapture(fields: fields, original: original, creationID: creationID, projectID: projectID)
    }
}
