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
                DatePicker("Time", selection: Binding(
                    get: { reminders.selectedTime },
                    set: { date in Task { await reminders.setTime(date) } }
                ), displayedComponents: .hourAndMinute)
                .disabled(reminders.isUpdating)

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
                Text("A gentle nudge")
            } footer: {
                Text("One reminder at your chosen local time, every day. It works offline and arrives even if you've already completed your habits.")
            }

            Section {
                Label("Saved on this iPhone", systemImage: "iphone")
                Label("Works entirely offline", systemImage: "wifi.slash")
            } header: {
                Text("Your habits, your space")
            } footer: {
                Text("Habit history stays on this iPhone and is independent of your Pokus account.")
            }

            Section {
                HStack {
                    Text("Pokus").font(.system(.headline, design: .rounded))
                    Spacer()
                    Text("1.0").foregroundStyle(.secondary)
                }
            } footer: {
                Text("A little, every day.")
            }
        }
        .navigationTitle("Habit reminders")
    }
}
