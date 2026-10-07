import SwiftUI

struct SettingsView: View {
    @Bindable var reminders: ReminderManager
    @Environment(\.openURL) private var openURL

    var body: some View {
        Form {
            Section {
                Toggle("Daily reminder", isOn: Binding(
                    get: { reminders.enabled },
                    set: { enabled in Task { await reminders.setEnabled(enabled) } }
                ))
                .disabled(reminders.isUpdating || reminders.permissionDenied)
                .accessibilityIdentifier("dailyReminder")
                if reminders.enabled {
                    DatePicker("Time", selection: Binding(
                        get: { reminders.selectedTime },
                        set: { date in Task { await reminders.setTime(date) } }
                    ), displayedComponents: .hourAndMinute)
                    .disabled(reminders.isUpdating)
                    .accessibilityIdentifier("habitReminderTime")
                }
                if reminders.isUpdating { ProgressView("Updating reminder") }

                if reminders.permissionDenied {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Notifications are turned off for Pokus. Enable them in Settings, then turn on your reminder here.")
                            .font(.footnote).foregroundStyle(.secondary)
                        Button("Open notification settings") {
                            if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
                        }
                        .font(.subheadline)
                        .frame(minHeight: 44)
                    }
                }
                if let error = reminders.errorMessage {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }
            } header: {
                Text("Schedule")
            } footer: {
                Text("One reminder at your chosen local time, every day, even if you've already completed your habits.")
            }
            Section {
                Label("On this iPhone", systemImage: "iphone")
            } footer: {
                Text("This reminder works offline. Set reminders separately on each device. Signing out pauses reminders until you sign in again.")
            }
        }
        .navigationTitle("Habit reminders")
        .navigationBarTitleDisplayMode(.inline)
    }
}
