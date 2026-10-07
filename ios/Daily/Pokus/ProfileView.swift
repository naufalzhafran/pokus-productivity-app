import PokusCore
import PokusNetworking
import SwiftUI

struct PokusProfileView: View {
    @Bindable var model: PokusModel
    @Bindable var reminders: ReminderManager
    @Environment(\.openURL) private var openURL
    @AppStorage("pokus.appearance") private var appearance = "system"
    @State private var signingOut = false
    @State private var total = ReadState<Int>()
    @State private var totalRetry = 0
    private var canManageHabits: Bool {
        let args = ProcessInfo.processInfo.arguments
        return model.account != nil || args.contains("-preview-data") || (args.contains("-ui-testing") && args.contains("-ui-testing-local-habits"))
    }
    var body: some View {
        List {
            Section {
                if let account = model.account {
                    VStack(alignment: .leading, spacing: 4) {
                        let name = account.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                        let email = account.email?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                        Text(name.isEmpty ? (email.isEmpty ? "Pokus account" : email) : name)
                            .font(.title3.weight(.semibold))
                        if !email.isEmpty, !name.isEmpty, name != email {
                            Text(email).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 6)
                    .accessibilityElement(children: .combine)
                    if model.authentication?.isValid == false {
                        AccountNotice(model: model)
                    }
                } else {
                    AccountNotice(model: model)
                }
            }
            if model.account != nil {
                Section("Focus") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Total focus time").font(.subheadline).foregroundStyle(.secondary)
                        if let value = total.value {
                            Text(WorkspaceRules.focused(value))
                                .font(.system(.title2, design: .rounded, weight: .semibold))
                        } else if let error = total.error {
                            ReadError(message: error) { totalRetry += 1 }
                        } else {
                            ProgressView("Loading focus total")
                        }
                    }
                    .padding(.vertical, 4)
                    NavigationLink("Session history") { FocusHistoryView(model: model) }
                }
            }
            Section("Preferences") {
                Picker("Appearance", selection: $appearance) {
                    Text("System").tag("system")
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }
                .accessibilityIdentifier("appearancePicker")
                NavigationLink("Habit reminders") { SettingsView(reminders: reminders) }
                    .disabled(!canManageHabits)
                Button("Open notification settings") {
                    if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
                }
                .frame(minHeight: 44)
            }
            if model.account != nil {
                Section {
                    NavigationLink {
                        ProfileDataSyncView(model: model)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Data & sync")
                            ProfileSyncStatus(model: model)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                    .accessibilityIdentifier("profileDataSync")
                }
                Section {
                    Button("Sign out", role: .destructive) { signingOut = true }
                        .disabled(model.isSaving || model.isSigningIn)
                        .frame(minHeight: 44)
                } footer: {
                    appVersion
                }
            } else {
                Section { } footer: { appVersion }
            }
        }
        .listStyle(.insetGrouped)
        .accessibilityIdentifier("profileList")
        .navigationTitle("Profile")
        .refreshable { await model.refresh() }
        .alert("Sign out of Pokus?", isPresented: $signingOut) {
            Button("Cancel", role: .cancel) { }
            Button("Sign out", role: .destructive) { Task { await model.signOut() } }
        } message: {
            Text("Downloaded copies will be removed from this iPhone. Your timer and changes that haven't synced stay saved for this account. Sign in again to access them.")
        }
        .onChange(of: model.scope) { _, _ in total.clear() }
        .task(id: "\(model.queryIdentity)-\(model.focus.timer.revision)-\(totalRetry)") {
            guard model.account != nil else { total.clear(); return }
            let pending = model.displayedHistory
            await total.load { try await model.focusTotal(pending: pending) }
        }
    }

    private var appVersion: some View {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        return Text(version.map { "Pokus · \($0)" } ?? "Pokus")
            .frame(maxWidth: .infinity)
            .padding(.top, 8)
    }
}

private struct ProfileSyncStatus: View {
    let model: PokusModel

    var body: some View {
        if model.authentication?.isValid == false {
            Label("Sign in again to sync", systemImage: "person.crop.circle.badge.exclamationmark")
        } else if !model.replicaStatus.failed.isEmpty {
            Label("Changes need attention", systemImage: "exclamationmark.icloud")
        } else if !model.isOnline {
            Label(model.replicaStatus.ready ? "Offline · Changes stay on this iPhone" : "Offline · Showing saved records", systemImage: "wifi.slash")
        } else if model.syncError != nil || model.dataSyncError != nil {
            Label("Couldn't sync", systemImage: "exclamationmark.icloud")
        } else if model.isLoading || model.isSyncing || model.isSyncingData {
            Label("Syncing…", systemImage: "arrow.triangle.2.circlepath")
        } else if model.pendingCount > 0 || model.replicaStatus.pendingChanges > 0 {
            Label("Changes waiting to sync", systemImage: "arrow.triangle.2.circlepath")
        } else if model.replicaStatus.ready {
            Label("No changes waiting to sync", systemImage: "checkmark.icloud")
        } else {
            Label("Preparing offline data", systemImage: "icloud.and.arrow.down")
        }
    }
}

private struct ProfileDataSyncView: View {
    @Bindable var model: PokusModel
    @State private var redownloading = false
    @State private var discarding: FailedChange?
    @State private var freeingSpace = false

    private var isSyncing: Bool { model.isLoading || model.isSyncing || model.isSyncingData }

    var body: some View {
        List {
            if model.account != nil {
                Section {
                    if model.authentication?.isValid == false { AccountNotice(model: model) }
                    if isSyncing { ProgressView("Syncing") }
                    else { ProfileSyncStatus(model: model) }
                    if let synced = model.replicaStatus.lastSynced {
                        TimelineView(.periodic(from: .now, by: 60)) { _ in
                            Text("Last synced \(synced, format: .relative(presentation: .named))")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    if model.pendingCount > 0 {
                        Text("\(model.pendingCount) session updates saved on this iPhone")
                    }
                    if model.replicaStatus.pendingChanges > 0 {
                        Text("\(model.replicaStatus.pendingChanges) \(model.replicaStatus.pendingChanges == 1 ? "change" : "changes") waiting to sync")
                    }
                    if let error = model.syncError { Text(error).font(.footnote).foregroundStyle(.secondary) }
                    if let error = model.dataSyncError { Text(error).font(.footnote).foregroundStyle(.secondary) }
                    Button("Sync now") { Task { await model.refresh() } }
                        .disabled(isSyncing || !model.isOnline || model.authentication?.isValid != true)
                        .frame(minHeight: 44)
                } header: { Text("Sync") } footer: {
                    Text("Changes sync automatically when you're connected. Use an active timer on one device at a time.")
                }
                if !model.replicaStatus.failed.isEmpty {
                    Section {
                        ForEach(model.replicaStatus.failed) { change in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(change.summary)
                                Text(change.message).font(.footnote).foregroundStyle(.secondary)
                                Button("Discard change", role: .destructive) { discarding = change }.frame(minHeight: 44)
                            }.accessibilityElement(children: .contain)
                        }
                        Button("Try again") { Task { await model.retryFailedChanges() } }
                            .disabled(isSyncing || !model.isOnline || model.authentication?.isValid != true)
                            .frame(minHeight: 44)
                    } header: { Text("Couldn't sync") } footer: {
                        Text("These changes couldn't be uploaded. They stay on this iPhone until you try again or discard them.")
                    }
                }
                if model.replicaStatus.ready {
                    Section {
                        LabeledContent("Saved on this iPhone", value: ByteCountFormatter.string(fromByteCount: Int64(model.replicaStatus.storedBytes), countStyle: .file))
                        Button {
                            freeingSpace = true
                            Task {
                                await model.freeUpSpace()
                                freeingSpace = false
                            }
                        } label: {
                            if freeingSpace { ProgressView("Freeing up space") }
                            else { Text("Free up space") }
                        }
                        .disabled(freeingSpace || isSyncing)
                        .frame(minHeight: 44)
                        Button("Re-download data") { redownloading = true }
                            .disabled(freeingSpace || isSyncing || !model.isOnline || model.authentication?.isValid != true)
                            .frame(minHeight: 44)
                    } header: { Text("Storage") } footer: {
                        Text("Free up space keeps every list but removes the full text of finished and older items; it loads again when you open them online. Changes waiting to sync are never removed.")
                    }
                }
                Section("Offline access") {
                    Text("Your workspace stays on this iPhone so you can browse and edit offline.")
                    Text("Older history and the full text of older finished items load when you're connected.")
                        .foregroundStyle(.secondary)
                    DisclosureGroup("What stays on this iPhone?") {
                        Text("Projects, tasks, captures, notes, and habits are saved after the first sync. Focus sessions older than 90 days, habit entries before last year, and the full text of older finished items load online.")
                        Text("Signing out removes downloaded copies. Your timer and changes that haven't synced stay saved for this account.")
                    }
                }
            } else {
                AccountNotice(model: model)
            }
        }
        .listStyle(.insetGrouped)
        .accessibilityIdentifier("profileDataSyncList")
        .navigationTitle("Data & sync")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.refresh() }
        .alert("Re-download your data?", isPresented: $redownloading) {
            Button("Cancel", role: .cancel) { }
            Button("Re-download") { Task { await model.redownload() } }
        } message: { Text("Changes waiting to sync are sent first and kept. Everything else downloads again. You'll need an internet connection.") }
        .alert("Discard this change?", isPresented: Binding(get: { discarding != nil }, set: { if !$0 { discarding = nil } }), presenting: discarding) { change in
            Button("Cancel", role: .cancel) { }
            Button("Discard", role: .destructive) { Task { await model.discardChange(change.id) } }
        } message: { change in Text("“\(change.summary)” will be removed from this iPhone. This can't be undone.") }
    }
}

private struct FocusHistoryView: View {
    let model: PokusModel
    var body: some View {
        List {
            let local = model.displayedHistory
            if !local.isEmpty {
                Section("Recent sessions on this iPhone") {
                    ForEach(local) { SessionHistoryRow(model: model, session: $0) }
                }
            }
            Section("Saved sessions") {
                PagedRows(model: model, query: RecordQueries.history(), emptyTitle: "No sessions yet", symbol: "timer", excluding: Set(local.map(\.id))) {
                    SessionHistoryRow(model: model, session: $0)
                }
            }
        }.navigationTitle("Focus history").refreshable { await model.refresh() }
    }
}
private struct SessionHistoryRow: View {
    let model: PokusModel
    let session: FocusSession
    @State private var task = ReadState<String>()
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(session.task.isEmpty ? "Open focus session" : task.value ?? "Saved task")
            Text(WorkspaceRules.focused(session.creditedSeconds)).font(.callout)
            Text(Date(timeIntervalSince1970: session.lastTick / 1000), format: .dateTime.month().day().hour().minute()).font(.caption).foregroundStyle(.secondary)
        }.task(id: "\(model.queryIdentity)-\(session.task)") {
            guard !session.task.isEmpty else { return }
            await task.load {
                let record: FocusTask? = try await model.readAPI().record("tasks", id: session.task)
                return record?.title ?? "Deleted task"
            }
        }
    }
}
