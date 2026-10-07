import PokusCore
import SwiftUI

struct CaptureReminderEditor: View {
    let model: PokusModel
    let capture: Capture
    @Environment(\.dismiss) private var dismiss
    @State private var date: Date
    @State private var save = SaveAction()

    init(model: PokusModel, capture: Capture) {
        self.model = model; self.capture = capture
        _date = State(initialValue: capture.reminderAt > Date().timeIntervalSince1970 * 1000
            ? Date(timeIntervalSince1970: capture.reminderAt / 1000) : Date().addingTimeInterval(3600))
    }
    var body: some View {
        NavigationStack {
            Form {
                Section { Text(capture.label); DatePicker("Remind me", selection: $date, in: Date()...) }
                Section {
                    Text("Reminders use this device's timezone. Changes made on the web reach iPhone alerts the next time this app syncs.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }.navigationTitle(capture.reminderAt > 0 ? "Edit reminder" : "Add reminder")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(save.isSaving) }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            save.performAsync { try await model.setCaptureReminder(id: capture.id, date: date) } onSuccess: {
                                Task { await model.requestCaptureReminderAlerts?() }
                                dismiss()
                            }
                        }.disabled(!model.canEdit || save.isSaving)
                    }
                }.saveAlert(save)
        }
    }
}

struct CaptureReminderSection: View {
    let model: PokusModel
    let capture: Capture
    let save: SaveAction
    let edit: () -> Void
    @Environment(\.openURL) private var openURL
    var body: some View {
        Section("Calendar reminder") {
            if capture.reminderAt > 0 {
                LabeledContent(capture.reminderDone ? "Completed" : "Scheduled") {
                    Text(Date(timeIntervalSince1970: capture.reminderAt / 1000), format: .dateTime.month().day().hour().minute())
                }
                Button(capture.reminderDone ? "Reopen reminder" : "Complete reminder", systemImage: capture.reminderDone ? "arrow.uturn.backward.circle" : "checkmark.circle") {
                    save.performAsync { try await model.setCaptureReminderDone(id: capture.id, done: !capture.reminderDone) }
                }.disabled(!model.canEdit || save.isSaving)
                Button("Edit reminder", systemImage: "calendar", action: edit).disabled(!model.canEdit || save.isSaving)
                Button("Remove reminder", systemImage: "calendar.badge.minus", role: .destructive) {
                    save.performAsync { try await model.setCaptureReminder(id: capture.id, date: nil) }
                }.disabled(!model.canEdit || save.isSaving)
            } else {
                Button("Add reminder", systemImage: "calendar.badge.plus", action: edit).disabled(!model.canEdit)
            }
            if let notice = model.captureReminderNotice {
                Text(notice).font(.footnote).foregroundStyle(.secondary)
                if model.captureReminderPermissionDenied {
                    Button("Open notification settings") { if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) } }
                } else {
                    Button("Enable reminder alerts") { Task { await model.requestCaptureReminderAlerts?() } }.disabled(!model.canEdit)
                }
                Button("Refresh reminder alerts") { Task { await model.refreshCaptureReminderAlerts?() } }.disabled(!model.canEdit)
            }
        }
    }
}
