import PokusCore
import SwiftUI

struct CaptureReminderEditor: View {
    let model: PokusModel
    let capture: Capture
    @Environment(\.dismiss) private var dismiss
    @State private var date: Date
    @State private var save = SaveAction()
    @State private var closeRequested = false
    @State private var initialDate: Date

    init(model: PokusModel, capture: Capture) {
        self.model = model; self.capture = capture
        let selectedDate = capture.reminderAt > Date().timeIntervalSince1970 * 1000
            ? Date(timeIntervalSince1970: capture.reminderAt / 1000) : Date().addingTimeInterval(3600)
        _initialDate = State(initialValue: selectedDate)
        _date = State(initialValue: selectedDate)
    }
    var body: some View {
        NavigationStack {
            Form {
                Section { Text(capture.label).font(.headline) }
                Section {
                    DatePicker("Date", selection: $date, in: Calendar.current.startOfDay(for: .now)..., displayedComponents: .date)
                        .accessibilityIdentifier("captureReminderDate")
                    DatePicker("Time", selection: $date, displayedComponents: .hourAndMinute)
                        .accessibilityIdentifier("captureReminderTime")
                    if date <= .now { EditorError(message: "Choose a future date and time.") }
                } header: {
                    Text("Remind me")
                } footer: {
                    Text("Reminders use this device's timezone. Changes made on the web reach iPhone alerts the next time this app syncs.")
                }
            }.disabled(save.isSaving)
                .navigationTitle(capture.reminderAt > 0 ? "Edit reminder" : "Add reminder")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { closeRequested = true }.disabled(save.isSaving) }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(save.isSaving ? "Saving…" : "Save") {
                            let submittedDate = date
                            save.performAsync { try await model.setCaptureReminder(id: capture.id, date: submittedDate) } onSuccess: {
                                Task { await model.requestCaptureReminderAlerts?() }
                                dismiss()
                            }
                        }.disabled(!model.canEdit || save.isSaving || date <= .now)
                    }
                }.saveAlert(save)
                .protectDraft(isDirty: date != initialDate, isSaving: save.isSaving, closeRequested: $closeRequested) { dismiss() }
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
