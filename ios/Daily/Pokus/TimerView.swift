import PokusCore
import PokusNetworking
import SwiftUI

struct PokusTimerView: View {
    @Bindable var model: PokusModel
    var isVisible = true
    @AppStorage("pokus.duration") private var duration = 25
    @State private var stopping = false
    @State private var choosingTask = false
    @State private var taskSave = SaveAction()
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.scenePhase) private var scenePhase
    @ScaledMetric(relativeTo: .largeTitle) private var timerFontSize = 88

    private var selectedTask: FocusTask? {
        model.workspace.tasks.first { $0.id == (model.session?.task ?? model.selectedTaskID) }
    }


    var body: some View {
        GeometryReader { geometry in
            if model.account != nil {
                let landscape = geometry.size.width > geometry.size.height
                let compact = landscape || typeSize.isAccessibilitySize || geometry.size.height < 440
                Group {
                    if landscape {
                        HStack(spacing: 16) {
                            focusContent(compact: true)
                            VStack(spacing: 8) {
                                AccountNotice(model: model, compact: true)
                                secondaryControls(compact: true)
                                timerActions(compact: true, iconsOnly: typeSize.isAccessibilitySize)
                                    .controlSize(.large)
                            }.frame(width: min(240, max(144, geometry.size.width * 0.36)))
                        }
                    } else {
                        VStack(spacing: compact ? 8 : 12) {
                            AccountNotice(model: model, compact: compact)
                            focusContent(compact: compact)
                            secondaryControls(compact: compact)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(.horizontal, landscape ? 16 : 24).padding(.vertical, compact ? 8 : 12)
                .frame(maxWidth: landscape ? .infinity : 480)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    if !landscape {
                        timerActions(compact: compact, iconsOnly: typeSize.isAccessibilitySize && geometry.size.height < 400)
                            .controlSize(.large)
                            .padding(.horizontal, 24).padding(.top, 8).padding(.bottom, compact ? 8 : 16)
                            .frame(maxWidth: 480).frame(maxWidth: .infinity)
                            .background(Color(uiColor: .systemBackground))
                    }
                }
                .disabled(model.focus.isSaving || !model.storageReady)
            } else {
                ScrollView {
                    AccountNotice(model: model).padding(24)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: geometry.size.height)
                }.accessibilityIdentifier("signedOutFocus")
            }
        }
        .background(Color(uiColor: .systemBackground))
        .saveAlert(taskSave)
        .navigationTitle("Focus")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Stop this focus session?", isPresented: $stopping) {
            Button("Continue", role: .cancel) { }
            Button("Save elapsed time") { Task { await model.stop(save: true) } }
            Button("Discard session", role: .destructive) { Task { await model.stop(save: false) } }
        } message: {
            Text(model.session?.task.isEmpty == false
                 ? "Save to credit the elapsed time to this task and your focus history."
                 : "Save to add the elapsed time to your focus history.")
        }
        .sheet(isPresented: $choosingTask) { TimerTaskPicker(model: model) }
        .task(id: "\(model.queryIdentity)-\(model.session?.task ?? model.selectedTaskID)") {
            let id = model.session?.task ?? model.selectedTaskID, scope = model.scope
            guard !id.isEmpty else { model.workspaceState.value.tasks = []; return }
            do {
                let task: FocusTask? = try await model.readAPI().record("tasks", id: id)
                guard model.scope == scope, !Task.isCancelled else { return }
                model.workspaceState.value.tasks = task.map { [$0] } ?? []
            } catch { }
        }
    }

    private func focusContent(compact: Bool) -> some View {
        GeometryReader { geometry in
            let diameter = min(340, geometry.size.width, geometry.size.height)
            Group {
                if let session = model.session, session.mode == .complete {
                    VStack(spacing: 12) {
                        Image(systemName: "checkmark.circle")
                            .font(.system(size: min(56, geometry.size.height / 3))).foregroundStyle(DailyTheme.accent)
                            .accessibilityHidden(true)
                        Text(compact ? "Complete" : "Session complete").font(compact ? .headline : .title2)
                        Text(WorkspaceRules.focused(session.creditedSeconds)).foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                } else {
                    countdown(diameter: diameter, compact: compact)
                        .frame(width: diameter, height: diameter)
                }
            }.frame(width: geometry.size.width, height: geometry.size.height)
        }
    }

    private func secondaryControls(compact: Bool) -> some View {
        VStack(spacing: 8) {
            if model.session == nil {
                durationPresets(compact: compact)
                taskChip(compact: compact)
            } else if let session = model.session {
                if !session.task.isEmpty {
                    Text(selectedTask?.title ?? "Linked task")
                        .font(.subheadline).foregroundStyle(.secondary)
                        .multilineTextAlignment(.center).lineLimit(compact ? 1 : 2)
                        .accessibilityIdentifier("focusTaskTitle")
                }
                if session.mode == .complete, let task = selectedTask {
                    if task.isDone {
                        Group {
                            if compact {
                                Image(systemName: "checkmark.circle").font(.title2)
                            } else {
                                Label("Task complete", systemImage: "checkmark.circle").font(.subheadline)
                            }
                        }
                        .foregroundStyle(.secondary)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("Task complete")
                        .accessibilityIdentifier("focusTaskCompleted")
                    } else {
                        Button {
                            taskSave.performAsync {
                                guard await model.write(collection: .tasks, id: task.id, fields: ["isDone": .bool(true)]) else { throw PokusError.message(model.error ?? "Couldn't complete this task.") }
                            }
                        } label: {
                            Group {
                                if taskSave.isSaving {
                                    if compact { ProgressView() }
                                    else { ProgressView("Completing task") }
                                } else if compact {
                                    Image(systemName: "checkmark")
                                } else { Text("Mark task complete") }
                            }
                            .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                        }
                        .accessibilityLabel(taskSave.isSaving ? "Completing task" : "Mark task complete")
                        .disabled(!model.canEdit || taskSave.isSaving).buttonStyle(.bordered).controlSize(.large)
                    }
                }
            }
            if model.focus.isSaving { ProgressView("Saving session") }
            if model.pendingCount > 0 && !compact {
                Text("\(model.pendingCount) session updates waiting to sync")
                    .font(.footnote).foregroundStyle(.secondary).lineLimit(2)
            }
        }
    }

    /// Quick lengths under the ring; the ring still allows any length.
    @ViewBuilder
    private func durationPresets(compact: Bool) -> some View {
        let presets = HStack(spacing: 8) {
            ForEach(FocusDuration.presets, id: \.self) { minutes in
                Button { duration = minutes } label: {
                    Text("\(minutes)m").monospacedDigit().frame(minWidth: 44, minHeight: 44)
                }
                .buttonStyle(.bordered).buttonBorderShape(.capsule)
                .tint(duration == minutes ? Color.accentColor : Color.secondary)
                .accessibilityLabel("\(minutes) minutes")
                .accessibilityAddTraits(duration == minutes ? .isSelected : [])
                .accessibilityIdentifier("durationPreset-\(minutes)")
            }
        }
        let menu = Menu {
            Picker("Duration", selection: $duration) {
                ForEach(FocusDuration.presets, id: \.self) { Text("\($0) minutes").tag($0) }
                if !FocusDuration.presets.contains(duration) { Text("\(duration) minutes").tag(duration) }
            }
        } label: {
            Label("\(duration) min", systemImage: "clock").frame(minHeight: 44)
        }
        .accessibilityLabel("Duration").accessibilityValue("\(duration) minutes")
        if typeSize.isAccessibilitySize { menu }
        else { ViewThatFits(in: .horizontal) { presets; menu } }
    }

    private func taskChip(compact: Bool) -> some View {
        let hasTask = !model.selectedTaskID.isEmpty
        let title = hasTask ? selectedTask?.title ?? "Selected task" : "Choose a task"
        return HStack(spacing: 4) {
            Button { choosingTask = true } label: {
                Label(title, systemImage: hasTask ? "checklist" : "plus.circle")
                    .lineLimit(compact ? 1 : 2).frame(minHeight: 44)
            }
            .buttonStyle(.bordered).buttonBorderShape(.capsule).tint(hasTask ? Color.accentColor : Color.secondary)
            .accessibilityLabel(title)
            .accessibilityValue(hasTask ? "Linked to the next session" : "")
            .accessibilityHint(hasTask ? "Choose a different task." : "Link the next session to a task.")
            .accessibilityIdentifier("chooseTask")
            if hasTask {
                Button { model.selectedTaskID = "" } label: {
                    Image(systemName: "xmark")
                        .font(.subheadline)
                        .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                }.buttonStyle(.plain).foregroundStyle(.secondary)
                    .accessibilityLabel("Clear selected task")
            }
        }
    }

    @ViewBuilder
    private func countdown(diameter: CGFloat, compact: Bool) -> some View {
        if model.session?.mode == .running && model.session?.isActive == true && isVisible && scenePhase == .active {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                timerDial(remaining: model.session?.remaining(at: context.date) ?? duration * 60, diameter: diameter, compact: compact)
            }
        } else {
            timerDial(remaining: model.session?.remaining(at: .now) ?? duration * 60, diameter: diameter, compact: compact)
        }
    }

    private func timerDial(remaining: Int, diameter: CGFloat, compact: Bool) -> some View {
            let total = (model.session?.durationMinutes ?? duration) * 60
            return FocusDurationDial(minutes: $duration,
                              progress: model.session == nil ? nil : Double(remaining) / Double(max(1, total)),
                              spokenValue: "\(remaining / 60) minutes, \(remaining % 60) seconds\(model.session?.isActive == false ? ", paused" : "")\(compact && model.pendingCount > 0 ? ", \(model.pendingCount) session updates waiting to sync" : "")") {
                VStack(spacing: diameter < 280 ? 8 : 16) {
                    if model.session?.isActive == false && diameter >= 240 && !compact {
                        Text("Paused")
                            .font(.body).foregroundStyle(.secondary)
                    }
                    Text(String(format: "%02d:%02d", remaining / 60, remaining % 60))
                        .font(.system(size: max(44, min(timerFontSize, diameter * 0.28)), weight: .light))
                        .monospacedDigit().lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .frame(maxWidth: .infinity)
                }
            }
    }

    @ViewBuilder
    private func timerActions(compact: Bool, iconsOnly: Bool = false) -> some View {
        if model.session?.mode == .complete {
            Button { Task { await model.reset() } } label: {
                actionLabel(compact ? "Again" : "Focus again", symbol: "arrow.clockwise", iconsOnly: iconsOnly)
            }.buttonStyle(.borderedProminent).accessibilityLabel("Focus again")
        } else if model.session == nil {
            Button { Task { await model.start(minutes: duration) } } label: {
                actionLabel(compact ? "Start" : "Start focus", symbol: "play.fill", iconsOnly: iconsOnly)
            }.buttonStyle(.borderedProminent).accessibilityIdentifier("startFocus").accessibilityLabel("Start focus")
        } else {
            let layout = typeSize.isAccessibilitySize && !iconsOnly ? AnyLayout(VStackLayout(spacing: 8)) : AnyLayout(HStackLayout(spacing: 12))
            layout {
                Button { Task { await model.toggle() } } label: {
                    actionLabel(model.session?.isActive == true ? "Pause" : "Resume", symbol: model.session?.isActive == true ? "pause.fill" : "play.fill", iconsOnly: iconsOnly)
                }.buttonStyle(.borderedProminent).accessibilityLabel(model.session?.isActive == true ? "Pause" : "Resume")
                Button(role: .destructive) { stopping = true } label: {
                    actionLabel("Stop", symbol: "stop.fill", iconsOnly: iconsOnly)
                }.buttonStyle(.plain).accessibilityLabel("Stop")
            }
        }
    }
    @ViewBuilder
    private func actionLabel(_ title: String, symbol: String, iconsOnly: Bool) -> some View {
        Group {
            if iconsOnly { Image(systemName: symbol).font(.system(size: 20)) }
            else { Text(title) }
        }.frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
    }
}
/// Open tasks to link to the next session: due today or overdue first, then the newest.
struct TimerTaskPicker: View {
    @Bindable var model: PokusModel
    @State private var search = ""
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                AccountNotice(model: model)
                if !model.selectedTaskID.isEmpty {
                    Button { model.selectedTaskID = ""; dismiss() } label: {
                        Label("No task", systemImage: "xmark.circle").frame(minHeight: 44)
                    }
                }
                Section {
                    PagedRows(model: model, query: RecordQueries.timerTasks(today: WorkspaceRules.dayKey(.now), search: search),
                              search: search, emptyTitle: search.isEmpty ? "No open tasks" : "No matching tasks", symbol: "checklist",
                              emptyDescription: search.isEmpty ? "Add a task in Library to link it to a session." : "Try another search.") { task in
                        Button { model.selectedTaskID = task.id; dismiss() } label: { row(task) }
                            .accessibilityAddTraits(task.id == model.selectedTaskID ? .isSelected : [])
                            .accessibilityIdentifier("pickTask-\(task.id)")
                    }
                } footer: { Text("Tasks due today or overdue are listed first.") }
            }
            .navigationTitle("Choose a task").navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search open tasks")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
    private func row(_ task: FocusTask) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(task.title).foregroundStyle(.primary).fixedSize(horizontal: false, vertical: true)
                let detail = [task.projectTitle, task.dueDate.flatMap { $0.isEmpty ? nil : LibraryDates.due($0) } ?? ""].filter { !$0.isEmpty }
                if !detail.isEmpty {
                    Text(detail.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            if task.id == model.selectedTaskID {
                Image(systemName: "checkmark").foregroundStyle(Color.accentColor).accessibilityHidden(true)
            }
        }.frame(minHeight: 44).contentShape(Rectangle())
    }
}

struct AccountNotice: View {
    @Bindable var model: PokusModel
    var compact = false
    var body: some View {
        if model.account == nil {
            ContentUnavailableView {
                Label("Your focus, saved", systemImage: "timer")
            } description: {
                Text(model.isOnline
                     ? "Sign in to sync your workspace across devices."
                     : "Connect to the internet to sign in and sync your workspace.")
            } actions: {
                GoogleSignInButton(isConnecting: model.isSigningIn, isEnabled: model.isOnline) { Task { await model.signIn() } }
                    .frame(maxWidth: 340)
            }
        } else if !model.isOnline {
            Label(compact ? "Offline" : offlineText, systemImage: "wifi.slash").font(.footnote)
                .accessibilityLabel(model.replicaStatus.ready
                    ? "Offline. \(offlineText) Your records and timer are saved on this iPhone."
                    : "Offline. Previously opened records and your timer are saved on this iPhone. Connect to refresh or edit.")
        } else if model.authentication?.isValid == false {
            VStack(alignment: .leading, spacing: 12) {
                if !compact { Text(waiting > 0 ? "Sign in again to sync \(changes(waiting))." : "Sign in again to sync.").font(.footnote).foregroundStyle(.secondary) }
                GoogleSignInButton(isConnecting: model.isSigningIn) { Task { await model.signIn() } }
            }
        } else if !compact, !model.replicaStatus.failed.isEmpty {
            Label("\(changes(model.replicaStatus.failed.count)) couldn't sync. Review them in Profile.", systemImage: "exclamationmark.icloud")
                .font(.footnote)
        } else if !compact, let error = model.dataSyncError {
            Label(error, systemImage: "icloud.slash").font(.footnote)
        }
    }
    private var waiting: Int { model.replicaStatus.pendingChanges }
    private func changes(_ count: Int) -> String { "\(count) \(count == 1 ? "change" : "changes")" }
    private var offlineText: String {
        guard model.replicaStatus.ready else { return "Offline. Showing saved records." }
        return waiting > 0 ? "Offline. \(changes(waiting)) will sync when you're connected." : "Offline. Edits are saved and sync later."
    }
}
