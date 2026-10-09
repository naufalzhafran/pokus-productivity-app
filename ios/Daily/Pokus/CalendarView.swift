import DailyCore
import PokusCore
import PokusNetworking
import SwiftUI

struct PokusCalendarView: View {
    let model: PokusModel
    let today: DayKey
    /// Shows the month grid; otherwise only today's agenda.
    var showsMonth = true
    var openHabits: (() -> Void)?
    @Binding var selectedCapture: String?
    var newCapture: (() -> Void)? = nil
    var newTask: (() -> Void)? = nil
    var openTimer: (() -> Void)? = nil
    @State private var pickedDay: DayKey?
    @State private var month = DayKey()
    @State private var window = ReadState<CalendarWindow>()
    @State private var overdue = ReadState<[CalendarItem]>()
    @State private var day = ReadState<HabitDayIndex>()
    @State private var completedExpanded = false
    @State private var retry = 0
    @State private var timeRevision = 0
    @State private var loadedMonth = ""
    @State private var loadedDay = ""
    @State private var save = SaveAction()
    @State private var entryToEdit: EntrySelection?
    @State private var habitToView: UUID?
    @State private var showingReminderInfo = false
    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: .caption2) private var markerSize: CGFloat = 10

    private var selectedDay: DayKey { showsMonth ? pickedDay ?? today : today }
    private var first: DayKey { DayKey(rawValue: String(format: "%04d-%02d-01", month.year, month.month))! }
    private var nextMonth: DayKey { first.adding(days: 32).firstOfCalendarMonth }
    private var last: DayKey { nextMonth.adding(days: -1) }
    private var days: [DayKey] { DayKey.weeks(from: first, through: last) }
    private var windowStart: DayKey { showsMonth ? days[0] : today }
    private var windowEnd: DayKey { showsMonth ? days[days.count - 1] : today }
    private var items: [CalendarItem] { window.value?.items.filter { $0.day == selectedDay } ?? [] }
    private var store: AccountHabitViewStore { AccountHabitViewStore(model: model, owner: model.account?.id ?? "") }
    private var remaining: [CalendarItem] { items.filter { !$0.isComplete && $0.kind != .reminder } }
    private var reminders: [CalendarItem] { items.filter { !$0.isComplete && $0.kind == .reminder } }
    private var completed: [CalendarItem] { items.filter(\.isComplete) }

    var body: some View {
        GeometryReader { geometry in
            Group {
                if model.account == nil { AccountNotice(model: model) }
                else if !showsMonth {
                    List { agenda }
                        .listStyle(.insetGrouped)
                        .contentMargins(.top, 0)
                        .accessibilityIdentifier("calendarAgenda")
                }
                else if geometry.size.width >= 760 && !typeSize.isAccessibilitySize {
                    HStack(alignment: .top, spacing: 0) {
                        ScrollView { monthGrid.padding() }.frame(width: geometry.size.width * 0.46)
                        List { agenda }.listStyle(.insetGrouped).accessibilityIdentifier("calendarAgenda")
                    }
                } else {
                    List { Section { monthGrid }.listRowBackground(Color.clear); agenda }.listStyle(.insetGrouped).accessibilityIdentifier("calendarAgenda")
                }
            }.background(DailyTheme.background)
        }
        .navigationTitle(showsMonth ? "Calendar" : "Today")
        .toolbar {
            if showsMonth {
                ToolbarItem(placement: .topBarLeading) { Button("Today") { pickedDay = nil; month = today }.accessibilityIdentifier("calendarToday") }
            }
            if newCapture != nil || newTask != nil {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        if let newCapture { Button("New capture", systemImage: "tray", action: newCapture) }
                        if let newTask { Button("New task", systemImage: "checklist", action: newTask) }
                    } label: { Label("Add", systemImage: "plus") }
                        .disabled(!model.canEdit).accessibilityIdentifier("todayAdd")
                }
            }
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    if let openHabits { Button("Habits", systemImage: "checkmark.circle", action: openHabits) }
                    NavigationLink("Unscheduled", destination: CalendarUnscheduledView(model: model))
                    if !showsMonth {
                        Button("About reminder alerts", systemImage: "bell") { showingReminderInfo = true }
                    }
                } label: { Label(showsMonth ? "Calendar options" : "Today options", systemImage: showsMonth ? "ellipsis.circle" : "ellipsis") }
            }
        }
        .refreshable { await model.refresh(); retry += 1 }
        .task(id: "\(model.queryIdentity)-\(windowStart)-\(windowEnd)-\(retry)-\(timeRevision)") {
            guard model.account != nil else { return }
            let identity = "\(model.scope?.generation.uuidString ?? "")-\(windowStart)-\(windowEnd)-\(TimeZone.autoupdatingCurrent.identifier)"
            if loadedMonth != identity { window.clear(); loadedMonth = identity }
            await window.load { try await model.readAPI().calendarWindow(from: windowStart, through: windowEnd) }
        }
        .task(id: "\(model.queryIdentity)-\(today)-\(selectedDay)-\(retry)-\(timeRevision)") {
            guard model.account != nil else { return }
            let identity = "\(model.scope?.generation.uuidString ?? "")-\(selectedDay)-\(TimeZone.autoupdatingCurrent.identifier)"
            if loadedDay != identity { day.clear(); overdue.clear(); loadedDay = identity }
            await day.load { try await store.dayIndex(selectedDay) }
            if selectedDay == today { await overdue.load { try await model.readAPI().calendarOverdue(before: today) } }
        }
        .onAppear { month = selectedDay }
        .onReceive(NotificationCenter.default.publisher(for: .NSSystemTimeZoneDidChange)) { _ in timeRevision += 1 }
        .onChange(of: selectedDay) { _, next in
            if next.month != month.month || next.year != month.year { month = next }
            completedExpanded = false
        }
        .navigationDestination(isPresented: Binding(get: { selectedCapture != nil }, set: { if !$0 { selectedCapture = nil } })) {
            if let selectedCapture { CaptureDetailView(model: model, captureID: selectedCapture) }
        }
        .navigationDestination(item: $habitToView) { id in
            HabitDetailView(store: store, habitID: id, today: today)
        }
        .alert("Reminder alerts", isPresented: $showingReminderInfo) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("Reminder changes made on the web reach this iPhone after the app next syncs. Pull down on Today to sync now.")
        }
        .sheet(item: $entryToEdit) { selection in
            LoadedEntryEditor(store: store, habitID: selection.habitID, day: selection.day, today: today)
        }.saveAlert(save)
    }

    private var monthGrid: some View {
        VStack(spacing: 12) {
            HStack {
                Button("Previous month", systemImage: "chevron.left") { pickedDay = first.adding(days: -1).firstOfCalendarMonth; month = selectedDay }.labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
                Spacer(minLength: 0)
                Text(first.date.formatted(Date.FormatStyle(timeZone: TimeZone(secondsFromGMT: 0)!).month(.wide).year())).font(.headline)
                Spacer(minLength: 0)
                Button("Next month", systemImage: "chevron.right") { pickedDay = nextMonth; month = selectedDay }.labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
            }
            VStack(spacing: 5) {
                HStack(spacing: 0) {
                    ForEach(Array(DayKey.weekdaySymbols().enumerated()), id: \.offset) { _, title in
                        Text(title).font(.caption).foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity).accessibilityHidden(true)
                    }
                }
                ForEach(Array(stride(from: 0, to: days.count, by: 7)), id: \.self) { offset in
                    HStack(spacing: 0) {
                        ForEach(Array(days[offset..<min(offset + 7, days.count)])) { date in
                            dayButton(date)
                        }
                    }
                }
            }
            if window.isLoading { ProgressView("Loading calendar").font(.footnote) }
            if let error = window.error { ReadError(message: error) { retry += 1 } }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) { markerLegend }
                VStack(alignment: .leading, spacing: 4) { markerLegend }
            }.font(.caption).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private var markerLegend: some View {
        Label("Project deadlines", systemImage: "folder")
        Label("Tasks", systemImage: "checklist")
        Label("Reminders", systemImage: "bell")
    }

    private func dayButton(_ date: DayKey) -> some View {
        Button { pickedDay = date } label: {
            VStack(spacing: 4) {
                Text(String(Int(date.rawValue.suffix(2)) ?? 0)).fontWeight(date == today ? .bold : .regular)
                    .monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                HStack(spacing: 2) {
                    ForEach(markers(date), id: \.self) { symbol in
                        Image(systemName: symbol).font(.system(size: min(markerSize, 16), weight: .semibold))
                    }
                }.frame(minHeight: min(markerSize, 16) + 2).accessibilityHidden(true)
            }.frame(maxWidth: .infinity, minHeight: 44)
                .background(date == selectedDay ? DailyTheme.accent : Color.clear, in: RoundedRectangle(cornerRadius: 9))
                .foregroundStyle(date == selectedDay ? Color.white : date.month == month.month ? Color.primary : Color.secondary)
                .contentShape(Rectangle())
        }.buttonStyle(.plain)
            .accessibilityLabel(date.formatted("EEEE, MMMM d, yyyy"))
            .accessibilityValue(markerDescription(date))
            .accessibilityAddTraits(date == selectedDay ? .isSelected : [])
            .accessibilityIdentifier("calendarDay-\(date.rawValue)")
    }

    @ViewBuilder private var agenda: some View {
        if showsMonth {
            Section {
                AccountNotice(model: model)
                if let notice = model.captureReminderNotice { Text(notice).font(.footnote).foregroundStyle(.secondary) }
                Text("Web reminder changes reach iPhone alerts after this app next syncs.").font(.caption).foregroundStyle(.secondary)
            }
        } else {
            Section {
                Text(today.formatted("EEEE, MMMM d"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 4)
                AccountNotice(model: model)
                if let notice = model.captureReminderNotice { Text(notice).font(.footnote).foregroundStyle(.secondary) }
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
            if let openTimer {
                Section { FocusTodayCard(model: model, today: today, openTimer: openTimer) }
            }
            if window.value == nil && window.error == nil {
                Section { ProgressView("Loading your day") }
            }
            if let error = window.error { Section { ReadError(message: error) { retry += 1 } } }
            if day.value != nil && overdue.value == nil && overdue.error == nil {
                Section { ProgressView("Checking overdue items") }
            }
        }
        if selectedDay == today, let items = overdue.value, !items.isEmpty {
            Section("Overdue") { ForEach(items) { CalendarAgendaRow(model: model, item: $0, showsDate: true) } }
                .textCase(showsMonth ? .uppercase : nil)
        }
        if selectedDay == today, let error = overdue.error { Section { ReadError(message: error) { retry += 1 } } }
        if showsMonth {
            Section(selectedDay.formatted("EEEE, MMMM d")) {
                ForEach(remaining) { CalendarAgendaRow(model: model, item: $0) }
                if let index = day.value {
                    habitRows(index.remaining, index: index)
                    if window.value != nil && remaining.isEmpty && reminders.isEmpty && index.remaining.isEmpty {
                        Text(completed.isEmpty && index.completed.isEmpty ? "Nothing scheduled for this day." : "All done for this day.").foregroundStyle(.secondary)
                    }
                } else if day.isLoading { ProgressView("Loading habits") }
                if let error = day.error { ReadError(message: error) { retry += 1 } }
            }
        } else {
            if !remaining.isEmpty {
                Section("Scheduled") { ForEach(remaining) { CalendarAgendaRow(model: model, item: $0) } }
                    .textCase(nil)
            }
            if let index = day.value {
                if !index.remaining.isEmpty {
                    Section {
                        habitRows(index.remaining, index: index)
                    } header: {
                        let layout = typeSize.isAccessibilitySize
                            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                            : AnyLayout(HStackLayout())
                        layout {
                            Text("Habits")
                            if !typeSize.isAccessibilitySize { Spacer() }
                            Text("\(index.completed.count) of \(index.ids.count) done")
                                .fontWeight(.regular)
                        }
                    }
                    .textCase(nil)
                }
                if window.value != nil, overdue.value != nil,
                   window.error == nil, day.error == nil, overdue.error == nil,
                   remaining.isEmpty, reminders.isEmpty, index.remaining.isEmpty,
                   overdue.value?.isEmpty == true {
                    Section {
                        if completed.isEmpty && index.completed.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Label("Nothing scheduled today", systemImage: "calendar")
                                    .font(.headline)
                                Text("Dated tasks, project deadlines, habits, and reminders appear here.")
                                    .font(.subheadline).foregroundStyle(.secondary)
                            }.padding(.vertical, 8)
                            NavigationLink("View unscheduled items") { CalendarUnscheduledView(model: model) }
                                .accessibilityIdentifier("todayUnscheduled")
                            if let openHabits {
                                Button("Browse habits", action: openHabits).frame(minHeight: 44)
                                    .accessibilityIdentifier("todayBrowseHabits")
                            }
                        } else {
                            Label("All done for today", systemImage: "checkmark.circle")
                                .foregroundStyle(.secondary).padding(.vertical, 8)
                        }
                    }
                }
            } else if day.error == nil {
                Section { ProgressView("Loading habits") }
            }
            if let error = day.error { Section { ReadError(message: error) { retry += 1 } } }
        }
        if !reminders.isEmpty {
            Section("Reminders") { ForEach(reminders) { CalendarAgendaRow(model: model, item: $0) } }
                .textCase(showsMonth ? .uppercase : nil)
        }
        if !completed.isEmpty || day.value?.completed.isEmpty == false {
            Section {
                DisclosureGroup("Completed (\(completed.count + (day.value?.completed.count ?? 0)))", isExpanded: $completedExpanded) {
                    ForEach(completed) { CalendarAgendaRow(model: model, item: $0) }
                    if let index = day.value { habitRows(index.completed, index: index) }
                }
            }
        }
        if showsMonth { Section { NavigationLink("Unscheduled projects and tasks") { CalendarUnscheduledView(model: model) } } }
    }

    private func habitRows(_ ids: [String], index: HabitDayIndex) -> some View {
        HabitPagedRows(store: store, ids: ids, day: selectedDay, index: index) { habit in
            if showsMonth {
                HabitRow(habit: habit, day: selectedDay,
                    detail: { HabitDetailView(store: store, habitID: habit.id, today: today) },
                    toggle: { set(habit.isComplete(on: selectedDay) ? 0 : 1, habit: habit) },
                    increment: { set(habit.value(on: selectedDay) + 1, habit: habit) },
                    edit: { entryToEdit = EntrySelection(habitID: habit.id, day: selectedDay) },
                    canEdit: selectedDay <= today && store.canWrite && !save.isSaving)
            } else {
                TodayHabitRow(habit: habit, day: today,
                    toggle: { set(habit.isComplete(on: today) ? 0 : 1, habit: habit) },
                    increment: { set(habit.value(on: today) + 1, habit: habit) },
                    edit: { entryToEdit = EntrySelection(habitID: habit.id, day: today) },
                    showHistory: { habitToView = habit.id },
                    canEdit: store.canWrite && !save.isSaving)
            }
        }
    }
    private func set(_ value: Double, habit: HabitHistory) {
        let date = selectedDay
        save.performAsync { try await store.setValue(value, for: habit.id, on: date) }
    }
    private func markers(_ date: DayKey) -> [String] {
        let items = window.value?.items.filter { $0.day == date } ?? []
        // Habits recur every day, so they're listed in the day's agenda rather than marked on the grid.
        return [(items.contains { $0.kind == .project }, "folder"), (items.contains { $0.kind == .task }, "checklist"),
                (items.contains { $0.kind == .reminder }, "bell")].filter(\.0).map(\.1)
    }
    private func markerDescription(_ date: DayKey) -> String {
        let labels = ["folder": "Project deadlines", "checklist": "Tasks", "bell": "Reminders"]
        return markers(date).compactMap { labels[$0] }.joined(separator: ", ")
    }
}

private extension DayKey {
    var firstOfCalendarMonth: DayKey { DayKey(rawValue: String(format: "%04d-%02d-01", year, month))! }
}

private struct CalendarAgendaRow: View {
    let model: PokusModel
    let item: CalendarItem
    var showsDate = false
    @State private var save = SaveAction()
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout(spacing: 12))
        layout {
            NavigationLink { destination } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title).foregroundStyle(.primary).strikethrough(item.isComplete)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(detail).font(.subheadline).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }.buttonStyle(.plain)
            if item.kind != .project {
                Button { toggle() } label: {
                    if save.isSaving {
                        ProgressView().frame(width: 44, height: 44)
                    } else if typeSize.isAccessibilitySize {
                        Label(item.isComplete ? "Reopen" : "Complete", systemImage: item.isComplete ? "checkmark.circle.fill" : "circle")
                            .frame(minHeight: 44)
                    } else {
                        Image(systemName: item.isComplete ? "checkmark.circle.fill" : "circle").font(.title2).frame(width: 44, height: 44)
                    }
                }
                    .buttonStyle(.borderless).disabled(!model.canEdit || save.isSaving)
                    .accessibilityLabel("\(item.isComplete ? "Reopen" : "Complete") \(item.title)")
                    .accessibilityValue(save.isSaving ? "Saving" : item.isComplete ? "Completed" : "Not completed")
            }
        }
        .swipeActions(edge: .leading) {
            if item.kind == .task && !item.isComplete { FocusTaskButton(model: model, taskID: item.sourceID).tint(.accentColor) }
        }
        .contextMenu {
            if item.kind == .task && !item.isComplete { FocusTaskButton(model: model, taskID: item.sourceID) }
            if item.kind != .project {
                Button(item.isComplete ? "Reopen" : "Complete", systemImage: item.isComplete ? "arrow.uturn.backward" : "checkmark.circle") { toggle() }
                    .disabled(!model.canEdit || save.isSaving)
            }
        }
        .saveAlert(save)
    }
    private var detail: String {
        var labels = [item.kind == .project ? "Project deadline" : item.kind == .task ? "Task" : "Reminder"]
        if !item.projectTitle.isEmpty { labels.append(item.projectTitle) }
        if item.inheritsProjectDate { labels.append("From project") }
        if showsDate, let day = item.day { labels.append(day.formatted("MMM d, yyyy")) }
        if let time = item.reminderAt { labels.append(Date(timeIntervalSince1970: time / 1000).formatted(date: .omitted, time: .shortened)) }
        return labels.joined(separator: " · ")
    }
    @ViewBuilder private var destination: some View {
        switch item.kind {
        case .project: ProjectTasksView(model: model, projectID: item.sourceID)
        case .task: TaskDetailView(model: model, taskID: item.sourceID)
        case .reminder: CaptureDetailView(model: model, captureID: item.sourceID)
        }
    }
    private func toggle() {
        save.performAsync {
            if item.kind == .reminder { try await model.setCaptureReminderDone(id: item.sourceID, done: !item.isComplete) }
            else if !(await model.write(collection: .tasks, id: item.sourceID, fields: ["isDone": .bool(!item.isComplete)])) {
                throw PokusError.message(model.error ?? "Couldn't update this task.")
            }
        }
    }
}

struct CalendarUnscheduledView: View {
    let model: PokusModel
    @State private var project: Project?
    @State private var task: FocusTask?
    @Environment(\.dynamicTypeSize) private var typeSize
    private var rowLayout: AnyLayout {
        typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
            : AnyLayout(HStackLayout(spacing: 12))
    }
    var body: some View {
        List {
            AccountNotice(model: model)
            Section("Projects") {
                PagedRows(model: model, query: RecordQueries.calendarUnscheduledProjects(), emptyTitle: "All projects have a date", compactEmpty: true) { record in
                    rowLayout {
                        NavigationLink(record.title) { ProjectTasksView(model: model, projectID: record.id) }
                            .fixedSize(horizontal: false, vertical: true)
                        Button("Set date") { project = record }.buttonStyle(.borderless).disabled(!model.canEdit).frame(minHeight: 44)
                            .accessibilityHint("Choose a date for \(record.title).")
                    }
                }
            }
            Section("Tasks") {
                PagedRows(model: model, query: RecordQueries.calendarUnscheduledTasks(), emptyTitle: "All tasks have a date", compactEmpty: true) { record in
                    rowLayout {
                        NavigationLink(record.title) { TaskDetailView(model: model, taskID: record.id) }
                            .fixedSize(horizontal: false, vertical: true)
                        Button("Set date") { task = record }.buttonStyle(.borderless).disabled(!model.canEdit).frame(minHeight: 44)
                            .accessibilityHint("Choose a date for \(record.title).")
                    }
                }
            }
        }.navigationTitle("Unscheduled").refreshable { await model.refresh() }
            .sheet(item: $project) { record in
                RemoteRecord<Project, ProjectEditorView>(model: model, collection: "projects", id: record.id) { ProjectEditorView(model: model, original: $0) }
            }
            .sheet(item: $task) { record in
                RemoteRecord<FocusTask, TaskEditorView>(model: model, collection: "tasks", id: record.id) { TaskEditorView(model: model, original: $0, projectID: $0.project) }
            }
    }
}
