import PokusCore
import PokusNetworking
import SwiftUI

struct PokusTimerView: View {
    @Bindable var model: PokusModel
    var isVisible = true
    @AppStorage("pokus.duration") private var duration = 25
    @State private var stopping = false
    @State private var choosingTask = false
    @State private var adjustingDuration = false
    @State private var taskSearch = ""
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
                AccountNotice(model: model).padding(24)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Color(uiColor: .systemBackground))
        .saveAlert(taskSave)
        .navigationTitle("Pocus")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Stop this focus session?", isPresented: $stopping) {
            Button("Continue", role: .cancel) { }
            if model.session?.task.isEmpty == false { Button("Save elapsed time") { Task { await model.stop(save: true) } } }
            Button("Discard session", role: .destructive) { Task { await model.stop(save: false) } }
        } message: {
            Text(model.session?.task.isEmpty == false
                 ? "Elapsed time is credited only when you save it."
                 : "This session will be discarded without saving elapsed time.")
        }
        .sheet(isPresented: $adjustingDuration) {
            durationSettings
        }
        .sheet(isPresented: $choosingTask) {
            NavigationStack {
                List {
                    Button { model.selectedTaskID = ""; choosingTask = false } label: {
                        HStack {
                            Text("No task").foregroundStyle(.primary)
                            Spacer()
                            if model.selectedTaskID.isEmpty { Image(systemName: "checkmark") }
                        }.frame(minHeight: 44).contentShape(Rectangle())
                    }.accessibilityAddTraits(model.selectedTaskID.isEmpty ? .isSelected : [])
                    PagedRows(model: model, query: RecordQueries.tasks(sort: "newest", search: taskSearch, timer: true), search: taskSearch, emptyTitle: "No matching tasks", symbol: "checklist") { task in
                        Button { model.workspaceState.value.tasks = [task]; model.selectedTaskID = task.id; choosingTask = false } label: {
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(task.title).foregroundStyle(.primary)
                                    Text(task.projectTitle.isEmpty ? "No project" : task.projectTitle).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                if model.selectedTaskID == task.id { Image(systemName: "checkmark") }
                            }.frame(minHeight: 44).contentShape(Rectangle())
                        }.accessibilityAddTraits(model.selectedTaskID == task.id ? .isSelected : [])
                    }
                }.id(taskSearch).navigationTitle("Choose a task").searchable(text: $taskSearch, prompt: "Search tasks and projects")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { choosingTask = false } } }
            }
        }
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
                        Text(compact ? "Complete" : "Session complete").font(compact ? .headline : .title2)
                        Text(WorkspaceRules.focused(session.creditedSeconds)).foregroundStyle(.secondary)
                    }
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
                let layout = compact ? AnyLayout(HStackLayout(spacing: 16)) : AnyLayout(VStackLayout(spacing: 8))
                layout {
                Button { adjustingDuration = true } label: {
                    if compact {
                        Image(systemName: "clock").font(.system(size: 20)).frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                    } else {
                    HStack(spacing: 6) {
                        Text("Adjust duration")
                        Image(systemName: "chevron.down").font(.caption.weight(.medium))
                    }.font(.subheadline).foregroundStyle(.secondary)
                        .frame(minHeight: 44).contentShape(Rectangle())
                    }
                }.buttonStyle(.plain).accessibilityIdentifier("adjustFocusDuration")
                    .accessibilityLabel("Adjust duration").accessibilityValue("\(duration) minutes")
                Button { taskSearch = ""; choosingTask = true } label: {
                    if compact {
                        Image(systemName: selectedTask == nil ? "plus" : "list.bullet")
                            .font(.system(size: 20)).frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                    } else {
                    HStack(spacing: 8) {
                        Image(systemName: selectedTask == nil ? "plus" : "list.bullet").font(.subheadline)
                        Text(selectedTask?.title ?? "Add a task (optional)")
                            .lineLimit(1).truncationMode(.tail)
                    }.font(.subheadline).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
                    }
                }.buttonStyle(.plain).accessibilityIdentifier("chooseFocusTask")
                    .accessibilityLabel("Choose a focus task").accessibilityValue(selectedTask?.title ?? "No task")
                }
            } else if model.session?.mode == .complete {
                if let task = selectedTask, !task.isDone {
                    Button {
                        taskSave.performAsync {
                            guard await model.write(collection: .tasks, id: task.id, fields: ["isDone": .bool(true)]) else { throw PokusError.message(model.error ?? "Couldn't complete this task.") }
                        }
                    } label: {
                        if compact {
                            Image(systemName: "checkmark").frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                        } else { Text("Mark task complete").frame(minHeight: 44) }
                    }.accessibilityLabel("Mark task complete")
                        .disabled(!model.canEdit || taskSave.isSaving).buttonStyle(.bordered).controlSize(.large)
                }
            } else if let task = selectedTask, !compact {
                Text(task.title).font(.body).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center).lineLimit(2)
            }
            if model.focus.isSaving { ProgressView("Saving session") }
            if model.pendingCount > 0 && !compact {
                Text("\(model.pendingCount) session updates waiting to sync")
                    .font(.footnote).foregroundStyle(.secondary).lineLimit(2)
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
                              spokenValue: "\(remaining / 60) minutes, \(remaining % 60) seconds\(model.session?.isActive == false ? ", paused" : "")\(compact && model.session != nil ? selectedTask.map { ", task: \($0.title)" } ?? "" : "")\(compact && model.pendingCount > 0 ? ", \(model.pendingCount) session updates waiting to sync" : "")") {
                VStack(spacing: diameter < 280 ? 8 : 16) {
                    if diameter >= 240 && !compact {
                        Text(model.session?.isActive == false ? "Paused" : "Focus")
                            .font(.body).foregroundStyle(.secondary)
                    }
                    Text(String(format: "%02d:%02d", remaining / 60, remaining % 60))
                        .font(.system(size: max(44, min(timerFontSize, diameter * 0.28)), weight: .light))
                        .monospacedDigit().lineLimit(1)
                        .frame(maxWidth: .infinity)
                    if model.session == nil && diameter >= 240 && !compact {
                        Text("Drag the ring to set time")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
    }

    private var durationSettings: some View {
        NavigationStack {
            Form {
                Section("Minutes") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: typeSize.isAccessibilitySize ? 2 : 4), spacing: 8) {
                        ForEach([15, 25, 45, 60], id: \.self) { preset in
                            Button { duration = preset } label: {
                                Text("\(preset)")
                                    .font(.body.weight(duration == preset ? .semibold : .regular))
                                    .foregroundStyle(.primary)
                                    .frame(maxWidth: .infinity, minHeight: 44)
                                    .background(duration == preset ? Color.primary.opacity(0.08) : .clear, in: RoundedRectangle(cornerRadius: 10))
                                    .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(duration == preset ? Color.primary : .clear, lineWidth: 1) }
                                    .contentShape(Rectangle())
                            }.buttonStyle(.plain)
                                .accessibilityLabel("\(preset) minutes")
                                .accessibilityAddTraits(duration == preset ? .isSelected : [])
                        }
                    }
                    Stepper(value: $duration, in: 1...60) {
                        Text("\(duration) \(duration == 1 ? "minute" : "minutes")")
                    }.accessibilityIdentifier("focusDuration")
                }
            }
            .navigationTitle("Focus duration").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { adjustingDuration = false } } }
            .disabled(model.focus.isSaving || !model.storageReady)
        }
        .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.medium, .large])
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
struct AccountNotice: View {
    @Bindable var model: PokusModel
    var compact = false
    var body: some View {
        if model.account == nil {
            ContentUnavailableView {
                Label("Your focus, saved", systemImage: "timer")
            } description: {
                Text("Sign in to sync your habits, tasks, library, and focus history across devices.")
            } actions: {
                GoogleSignInButton(isConnecting: model.isSigningIn) { Task { await model.signIn() } }
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
