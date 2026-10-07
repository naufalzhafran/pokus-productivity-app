import PokusCore
import PokusNetworking
import SwiftUI

struct PokusProfileView: View {
    @Bindable var model: PokusModel
    @Bindable var reminders: ReminderManager
    @AppStorage("pokus.appearance") private var appearance = "system"
    @State private var signingOut = false
    @State private var redownloading = false
    @State private var discarding: FailedChange?
    @State private var total = ReadState<Int>()
    @State private var totalRetry = 0
    private var canManageHabits: Bool {
        let args = ProcessInfo.processInfo.arguments
        return model.account != nil || args.contains("-preview-data") || (args.contains("-ui-testing") && args.contains("-ui-testing-local-habits"))
    }
    var body: some View {
        List {
            Section("Account") {
                AccountNotice(model: model)
                if let account = model.account {
                    Text(account.name ?? account.email ?? "Pokus account").font(.headline)
                    if let email = account.email { Text(email).foregroundStyle(.secondary) }
                    Button("Sign out", role: .destructive) { signingOut = true }.disabled(model.isSaving || model.isSigningIn)
                }
            }
            if model.account != nil {
                Section("Focus") {
                    if let value = total.value { Text(WorkspaceRules.focused(value)) }
                    else if let error = total.error { ReadError(message: error) { totalRetry += 1 } }
                    else { ProgressView("Loading focus total") }
                    NavigationLink("Session history") { FocusHistoryView(model: model) }
                }
                Section("Sync") {
                    if model.isSyncing || model.isSyncingData { ProgressView("Syncing") }
                    else if let synced = model.replicaStatus.lastSynced {
                        TimelineView(.periodic(from: .now, by: 60)) { _ in
                            Text("Synced \(synced, format: .relative(presentation: .named))")
                        }
                    }
                    Text(model.pendingCount == 0 ? "All session updates synced" : "\(model.pendingCount) session updates saved on this iPhone")
                    if model.replicaStatus.pendingChanges > 0 {
                        Text("\(model.replicaStatus.pendingChanges) \(model.replicaStatus.pendingChanges == 1 ? "change" : "changes") waiting to sync")
                    }
                    if let error = model.syncError { Text(error).font(.footnote).foregroundStyle(.secondary) }
                    if let error = model.dataSyncError { Text(error).font(.footnote).foregroundStyle(.secondary) }
                    Button("Sync now") { Task { await model.refresh() } }.disabled(model.isSyncing || model.isSyncingData || !model.isOnline)
                    Text("Operate an active timer on one device at a time.").font(.footnote).foregroundStyle(.secondary)
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
                        Button("Try again") { Task { await model.retryFailedChanges() } }.disabled(model.isSyncingData || !model.isOnline).frame(minHeight: 44)
                    } header: { Text("Couldn't sync") } footer: {
                        Text("PocketBase didn't accept these changes. They still show on this iPhone until you try again or discard them.")
                    }
                }
                if model.replicaStatus.ready {
                    Section {
                        LabeledContent("Saved on this iPhone", value: ByteCountFormatter.string(fromByteCount: Int64(model.replicaStatus.storedBytes), countStyle: .file))
                        Button("Free up space") { Task { await model.freeUpSpace() } }.frame(minHeight: 44)
                        Button("Re-download data") { redownloading = true }.disabled(model.isSyncingData || !model.isOnline).frame(minHeight: 44)
                    } header: { Text("Storage") } footer: {
                        Text("Free up space keeps every list but removes the full text of finished and older items; it loads again when you open them online. Changes waiting to sync are never removed.")
                    }
                }
            }
            Section("Preferences") {
                Picker("Appearance", selection: $appearance) { Text("System").tag("system"); Text("Light").tag("light"); Text("Dark").tag("dark") }
                    .accessibilityIdentifier("appearancePicker")
                NavigationLink("Habit reminders") { SettingsView(reminders: reminders) }.disabled(!canManageHabits)
                Button("Open notification settings") {
                    if let url = URL(string: UIApplication.openNotificationSettingsURLString) { UIApplication.shared.open(url) }
                }
            }
            Section {
                Text("Your projects, tasks, captures, notes, and habits are saved on this iPhone, so you can browse and edit them offline. Changes sync when you're connected. Focus sessions older than 90 days, habit entries before last year, and the full text of older finished items load when connected. Signing out removes downloaded copies; your timer and changes that haven't synced stay saved.")
                    .font(.footnote).foregroundStyle(.secondary)
                Text("Pokus · 1.0").font(.footnote)
            }
        }
        .navigationTitle("Profile")
        .refreshable { await model.refresh() }
        .alert("Sign out of Pokus?", isPresented: $signingOut) {
            Button("Cancel", role: .cancel) { }
            Button("Sign out", role: .destructive) { Task { await model.signOut() } }
        } message: { Text("Pending sessions remain saved for this account. Sign in again to access its records.") }
        .alert("Re-download your data?", isPresented: $redownloading) {
            Button("Cancel", role: .cancel) { }
            Button("Re-download") { Task { await model.redownload() } }
        } message: { Text("Changes waiting to sync are sent first and kept. Everything else downloads again from PocketBase.") }
        .alert("Discard this change?", isPresented: Binding(get: { discarding != nil }, set: { if !$0 { discarding = nil } }), presenting: discarding) { change in
            Button("Cancel", role: .cancel) { }
            Button("Discard", role: .destructive) { Task { await model.discardChange(change.id) } }
        } message: { change in Text("“\(change.summary)” will be removed from this iPhone. This can't be undone.") }
        .onChange(of: model.scope) { _, _ in total.clear() }
        .task(id: "\(model.queryIdentity)-\(model.focus.timer.revision)-\(totalRetry)") {
            let pending = model.displayedHistory
            await total.load { try await model.focusTotal(pending: pending) }
        }
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
