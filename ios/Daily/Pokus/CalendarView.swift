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
    /// Starts a session at the default length and shows the timer.
    var startFocus: (() -> Void)? = nil
    @State private var pickedDay: DayKey?
    @State private var newTaskDay: DayKey?
    @State private var showsWelcome = false
    @State private var month = DayKey()
    @State private var window = ReadState<CalendarWindow>()
    @State private var overdue = ReadState<[CalendarItem]>()
    @State private var day = ReadState<HabitDayIndex>()
    @State private var plan = ReadState<[PlanDay]>()
    @State private var loadedPlan = ""
    @AppStorage(TodayPlan.capacityKey) private var dailyCapacity = TodayPlan.defaultCapacity
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
    /// Open past-due tasks leave their own day and appear on today instead.
    private var items: [CalendarItem] {
        window.value?.items.filter { $0.day == selectedDay && CalendarProjection.rolledOver($0, to: today) == nil } ?? []
    }
    private var rolledOver: [CalendarItem] {
        selectedDay == today ? overdue.value?.compactMap { CalendarProjection.rolledOver($0, to: today) } ?? [] : []
    }
    private var overdueOther: [CalendarItem] { overdue.value?.filter { $0.kind != .task } ?? [] }
    /// Overdue reminders, plus rolled-over tasks in the month view, that "Move all to today" reschedules. On Today,
    /// overdue tasks live in the plan instead. Project deadlines stay put.
    private var movableOverdue: [CalendarItem] { (showsMonth ? rolledOver : []) + overdueOther.filter { $0.kind == .reminder } }
    /// The button sits on the Overdue section when it has reminders, otherwise on today's list of rolled-over tasks.
    private var overdueHostsMoveAll: Bool { overdueOther.contains { $0.kind == .reminder } }
    private var store: AccountHabitViewStore { AccountHabitViewStore(model: model, owner: model.account?.id ?? "") }
    private var remaining: [CalendarItem] { rolledOver + items.filter { !$0.isComplete && $0.kind != .reminder } }
    private var reminders: [CalendarItem] { items.filter { !$0.isComplete && $0.kind == .reminder } }
    private var completed: [CalendarItem] { items.filter(\.isComplete) }
    /// Today keeps project deadlines in their own section; tasks come from the plan.
    private var deadlines: [CalendarItem] { items.filter { !$0.isComplete && $0.kind == .project } }
    private var todayPlan: PlanDay? { plan.value?.first }
    /// Tasks the plan starts on `date` ahead of their due date, or undated filler on today.
    private func planned(_ date: DayKey) -> [PlanEntry] {
        plan.value?.first { $0.day == date }?.entries.filter { $0.reason == .early || $0.reason == .filler } ?? []
    }

    var body: some View {
        GeometryReader { geometry in
            Group {
                if model.account == nil { AccountNotice(model: model) }
                else if !showsMonth {
                    List { agenda }
                        .listStyle(.insetGrouped)
                        .pkScreenBackground()
                        .contentMargins(.top, 0)
                        .accessibilityIdentifier("calendarAgenda")
                }
                else if geometry.size.width >= 760 && !typeSize.isAccessibilitySize {
                    HStack(alignment: .top, spacing: 0) {
                        ScrollView { monthGrid.padding() }.frame(width: geometry.size.width * 0.46)
                        List { agenda }.listStyle(.insetGrouped).pkScreenBackground().accessibilityIdentifier("calendarAgenda")
                    }
                } else {
                    List { Section { monthGrid }.listRowBackground(Color.clear); agenda }.listStyle(.insetGrouped).pkScreenBackground().accessibilityIdentifier("calendarAgenda")
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
        .task(id: "plan-\(model.queryIdentity)-\(today)-\(dailyCapacity)-\(retry)-\(timeRevision)") {
            guard model.account != nil else { return }
            let identity = "\(model.scope?.generation.uuidString ?? "")-\(today)-\(TimeZone.autoupdatingCurrent.identifier)"
            if loadedPlan != identity { plan.clear(); loadedPlan = identity }
            let start = today, capacity = min(max(dailyCapacity, TodayPlan.capacityRange.lowerBound), TodayPlan.capacityRange.upperBound)
            await plan.load {
                let tasks = try await model.readAPI().calendarPlanTasks(through: start.adding(days: TodayPlan.days - 1))
                return TodayPlan.planDays(tasks, today: start, capacity: capacity)
            }
        }
        .task(id: "welcome-\(model.scope?.generation.uuidString ?? "")-\(model.storageReady)") {
            // First run: checked once per account, so the welcome stays while its first task is added.
            guard !showsMonth, startFocus != nil, model.account != nil, model.storageReady, !showsWelcome,
                  !ProcessInfo.processInfo.arguments.contains("-ui-testing") else { return }
            let scope = model.scope
            guard let empty = try? await model.readAPI().isWorkspaceEmpty(), model.scope == scope else { return }
            showsWelcome = empty && model.displayedHistory.isEmpty && model.session == nil
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
        }
        .sheet(item: $newTaskDay) { day in
            TaskEditorView(model: model, original: nil, projectID: "", initialDueDate: day.localDate, onSaved: { _ in retry += 1 })
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
                        Text(title).font(.caption).foregroundStyle(Color.pk.textSecondary)
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
            }.font(.caption).foregroundStyle(Color.pk.textSecondary)
        }
    }

    @ViewBuilder private var markerLegend: some View {
        Label("Project deadlines", systemImage: "folder")
        Label("Tasks", systemImage: "checklist")
        Label("Reminders", systemImage: "bell")
        Label("Planned", systemImage: "clock")
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
                .background(date == selectedDay ? DailyTheme.accent : Color.clear, in: RoundedRectangle(cornerRadius: PKRadius.sm, style: .continuous))
                .foregroundStyle(date == selectedDay ? Color.pk.onPrimary : date.month == month.month ? Color.pk.textPrimary : Color.pk.textSecondary)
                .contentShape(Rectangle())
        }.buttonStyle(.plain)
            .accessibilityLabel(date.formatted("EEEE, MMMM d, yyyy"))
            .accessibilityValue(markerDescription(date))
            .accessibilityAddTraits(date == selectedDay ? .isSelected : [])
            .accessibilityIdentifier("calendarDay-\(date.rawValue)")
    }

    @ViewBuilder private var agenda: some View {
        // The date header sits on the screen background; every other agenda row uses the brand surface.
        if !showsMonth {
            Section {
                Text(today.formatted("EEEE, MMMM d"))
                    .font(.subheadline)
                    .foregroundStyle(Color.pk.textSecondary)
                    .padding(.vertical, 4)
                AccountNotice(model: model)
                if let notice = model.captureReminderNotice { Text(notice).font(.footnote).foregroundStyle(Color.pk.textSecondary) }
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
        }
        Group {
            if showsMonth {
                Section {
                    AccountNotice(model: model)
                    if let notice = model.captureReminderNotice { Text(notice).font(.footnote).foregroundStyle(Color.pk.textSecondary) }
                    Text("Web reminder changes reach iPhone alerts after this app next syncs.").font(.caption).foregroundStyle(Color.pk.textSecondary)
                }
            } else {
                if showsWelcome, let account = model.account, let startFocus {
                    WelcomeSection(model: model, accountID: account.id, startFocus: startFocus)
                }
                if let openTimer {
                    Section { FocusTodayCard(model: model, today: today, openTimer: openTimer, startFocus: startFocus) }
                }
                if window.value == nil && window.error == nil {
                    Section { ProgressView("Loading your day") }
                }
                if let error = window.error { Section { ReadError(message: error) { retry += 1 } } }
                if day.value != nil && overdue.value == nil && overdue.error == nil {
                    Section { ProgressView("Checking overdue items") }
                }
            }
            if selectedDay == today, !overdueOther.isEmpty {
                Section {
                    ForEach(overdueOther) { CalendarAgendaRow(model: model, item: $0, showsDate: true, moveTarget: today) }
                } header: {
                    sectionHeader("Overdue", showsMoveAll: overdueHostsMoveAll)
                }
                .textCase(nil)
            }
            if selectedDay == today, let error = overdue.error { Section { ReadError(message: error) { retry += 1 } } }
            if showsMonth {
                Section {
                    ForEach(remaining) { CalendarAgendaRow(model: model, item: $0, moveTarget: $0.rolledOverFrom == nil ? nil : today) }
                    if let index = day.value {
                        habitRows(index.remaining, index: index)
                        if window.value != nil && remaining.isEmpty && reminders.isEmpty && index.remaining.isEmpty {
                            Text(completed.isEmpty && index.completed.isEmpty ? "Nothing scheduled for this day." : "All done for this day.").foregroundStyle(Color.pk.textSecondary)
                        }
                    } else if day.isLoading { ProgressView("Loading habits") }
                    if let error = day.error { ReadError(message: error) { retry += 1 } }
                    Button { newTaskDay = selectedDay } label: {
                        Label("New task on \(selectedDay.formatted())", systemImage: "plus.circle").frame(minHeight: 44)
                    }
                    .disabled(!model.canEdit)
                    .accessibilityIdentifier("calendarNewTask")
                } header: {
                    sectionHeader(selectedDay.formatted("EEEE, MMMM d"), showsMoveAll: !overdueHostsMoveAll && !rolledOver.isEmpty)
                }
                .textCase(nil)
                let plannedEntries = planned(selectedDay)
                if !plannedEntries.isEmpty {
                    Section {
                        ForEach(plannedEntries) { planRow($0, on: selectedDay) }
                    } header: {
                        countHeader("Planned", count: "\(plannedEntries.reduce(0) { $0 + $1.cost }) Pokus")
                    } footer: {
                        Text("Tasks to start ahead of their due date.")
                    }
                    .textCase(nil)
                }
            } else {
                if let todayPlan {
                    if !todayPlan.entries.isEmpty {
                        Section {
                            ForEach(todayPlan.entries) { planRow($0, on: today) }
                        } header: {
                            countHeader("Today's plan", count: "\(todayPlan.used) of \(todayPlan.capacity) Pokus")
                        } footer: {
                            if todayPlan.used > todayPlan.capacity {
                                Text("That's more than your \(todayPlan.capacity) Pokus for today. Move something to another day, or change your daily capacity in Profile.")
                            }
                        }
                        .textCase(nil)
                    }
                } else if let error = plan.error {
                    Section { ReadError(message: error) { retry += 1 } }
                } else if window.value != nil {
                    Section { ProgressView("Planning your day") }
                }
                if !deadlines.isEmpty {
                    Section("Project deadlines") {
                        ForEach(deadlines) { CalendarAgendaRow(model: model, item: $0) }
                    }
                    .textCase(nil)
                }
                if let index = day.value {
                    if !index.remaining.isEmpty {
                        Section {
                            habitRows(index.remaining, index: index)
                        } header: {
                            countHeader("Habits", count: "\(index.completed.count) of \(index.ids.count) done")
                        }
                        .textCase(nil)
                    }
                    if window.value != nil, overdue.value != nil, todayPlan?.entries.isEmpty == true,
                       window.error == nil, day.error == nil, overdue.error == nil, plan.error == nil,
                       deadlines.isEmpty, reminders.isEmpty, index.remaining.isEmpty,
                       overdue.value?.isEmpty == true {
                        Section {
                            if completed.isEmpty && index.completed.isEmpty {
                                VStack(alignment: .leading, spacing: 8) {
                                    Label("Nothing scheduled today", systemImage: "calendar")
                                        .font(.headline)
                                    Text("Dated tasks, project deadlines, habits, and reminders appear here.")
                                        .font(.subheadline).foregroundStyle(Color.pk.textSecondary)
                                }.padding(.vertical, 8)
                                NavigationLink("View unscheduled items") { CalendarUnscheduledView(model: model) }
                                    .accessibilityIdentifier("todayUnscheduled")
                                if let openHabits {
                                    Button("Browse habits", action: openHabits).frame(minHeight: 44)
                                        .accessibilityIdentifier("todayBrowseHabits")
                                }
                            } else {
                                Label("All done for today", systemImage: "checkmark.circle")
                                    .foregroundStyle(Color.pk.textSecondary).padding(.vertical, 8)
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
                    .textCase(nil)
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
        }.pkRowBackground()
    }

    private func sectionHeader(_ title: String, showsMoveAll: Bool) -> some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
            : AnyLayout(HStackLayout())
        return layout {
            Text(title)
            if showsMoveAll {
                if !typeSize.isAccessibilitySize { Spacer() }
                Button(save.isSaving ? "Moving…" : "Move all to today") { moveAllOverdue() }
                    .font(.subheadline).fontWeight(.regular)
                    .disabled(!model.canEdit || save.isSaving)
                    .accessibilityIdentifier("calendarMoveOverdue")
            }
        }
    }

    private func countHeader(_ title: String, count: String) -> some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
            : AnyLayout(HStackLayout())
        return layout {
            Text(title)
            if !typeSize.isAccessibilitySize { Spacer() }
            Text(count).fontWeight(.regular)
        }
    }

    @ViewBuilder private func planRow(_ entry: PlanEntry, on date: DayKey) -> some View {
        if let item = CalendarProjection.task(entry.task) {
            CalendarAgendaRow(model: model, item: item, caption: TodayPlan.label(entry, on: date),
                              moveTarget: entry.reason == .overdue ? today : nil)
        }
    }

    private func moveAllOverdue() {
        let items = movableOverdue
        save.performAsync {
            for item in items { try await model.moveCalendarItem(item, to: today) }
        }
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
        let items = window.value?.items.filter { $0.day == date && CalendarProjection.rolledOver($0, to: today) == nil } ?? []
        let hasRolledOver = date == today && overdue.value?.contains { $0.kind == .task } == true
        // Habits recur every day, so they're listed in the day's agenda rather than marked on the grid.
        return [(items.contains { $0.kind == .project }, "folder"), (hasRolledOver || items.contains { $0.kind == .task }, "checklist"),
                (items.contains { $0.kind == .reminder }, "bell"), (!planned(date).isEmpty, "clock")].filter(\.0).map(\.1)
    }
    private func markerDescription(_ date: DayKey) -> String {
        let labels = ["folder": "Project deadlines", "checklist": "Tasks", "bell": "Reminders", "clock": "Planned tasks"]
        return markers(date).compactMap { labels[$0] }.joined(separator: ", ")
    }
}

private extension DayKey {
    var firstOfCalendarMonth: DayKey { DayKey(rawValue: String(format: "%04d-%02d-01", year, month))! }
    /// Noon on this day in the device's time zone, for date pickers that save the local day.
    var localDate: Date {
        let parts = rawValue.split(separator: "-").compactMap { Int($0) }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .autoupdatingCurrent
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12)) ?? date
    }
}

private struct CalendarAgendaRow: View {
    let model: PokusModel
    let item: CalendarItem
    var showsDate = false
    /// Replaces the kind label, such as the plan's "Due Fri · start early".
    var caption: String? = nil
    /// Set on overdue rows: the day "Move to today" moves the item to.
    var moveTarget: DayKey? = nil
    @State private var save = SaveAction()
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout(spacing: 12))
        layout {
            NavigationLink { destination } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title).foregroundStyle(Color.pk.textPrimary).strikethrough(item.isComplete)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(detail).font(.subheadline).foregroundStyle(Color.pk.textSecondary)
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
        .swipeActions(edge: .trailing) {
            if let moveTarget, item.kind != .project {
                Button("Tomorrow", systemImage: "arrow.right.circle") { move(to: moveTarget.adding(days: 1)) }
                    .tint(Color.pk.primary).disabled(!model.canEdit || save.isSaving)
                Button("Today", systemImage: "calendar") { move(to: moveTarget) }
                    .tint(Color.pk.warning).disabled(!model.canEdit || save.isSaving)
            }
        }
        .contextMenu {
            if item.kind == .task && !item.isComplete { FocusTaskButton(model: model, taskID: item.sourceID) }
            if let moveTarget, item.kind != .project {
                Button("Move to today", systemImage: "calendar") { move(to: moveTarget) }
                    .disabled(!model.canEdit || save.isSaving)
                Button("Move to tomorrow", systemImage: "arrow.right.circle") { move(to: moveTarget.adding(days: 1)) }
                    .disabled(!model.canEdit || save.isSaving)
            }
            if item.kind != .project {
                Button(item.isComplete ? "Reopen" : "Complete", systemImage: item.isComplete ? "arrow.uturn.backward" : "checkmark.circle") { toggle() }
                    .disabled(!model.canEdit || save.isSaving)
            }
        }
        .saveAlert(save)
    }
    private var detail: String {
        var labels = [caption ?? (item.kind == .project ? "Project deadline" : item.kind == .task ? "Task" : "Reminder")]
        if !item.projectTitle.isEmpty { labels.append(item.projectTitle) }
        if caption != nil { return labels.joined(separator: " · ") }
        if item.inheritsProjectDate { labels.append("From project") }
        if let from = item.rolledOverFrom, let day = item.day {
            let late = CalendarProjection.days(from: from, to: day)
            labels.append("Rolled over from \(from.formatted("MMM d")) · \(late) \(late == 1 ? "day" : "days") late")
        }
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
    private func move(to day: DayKey) {
        save.performAsync { try await model.moveCalendarItem(item, to: day) }
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
        List { Group {
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
        }.pkRowBackground() }.pkScreenBackground().navigationTitle("Unscheduled").refreshable { await model.refresh() }
            .sheet(item: $project) { record in
                RemoteRecord<Project, ProjectEditorView>(model: model, collection: "projects", id: record.id) { ProjectEditorView(model: model, original: $0) }
            }
            .sheet(item: $task) { record in
                RemoteRecord<FocusTask, TaskEditorView>(model: model, collection: "tasks", id: record.id) { TaskEditorView(model: model, original: $0, projectID: $0.project) }
            }
    }
}

/// First run on Today: shown while a new account has no projects, tasks, captures, or sessions,
/// until it's dismissed or the first session starts. Dismissal is remembered per account.
private struct WelcomeSection: View {
    let model: PokusModel
    let startFocus: () -> Void
    @AppStorage private var dismissed: Bool
    @AppStorage(TimerPreferences.durationKey) private var duration = 25
    @State private var taskTitle = ""
    @State private var addedTitle: String?
    @State private var adding = false
    @FocusState private var titleFocused: Bool
    @Environment(\.dynamicTypeSize) private var typeSize

    init(model: PokusModel, accountID: String, startFocus: @escaping () -> Void) {
        self.model = model; self.startFocus = startFocus
        _dismissed = AppStorage(wrappedValue: false, "pokus.welcomeDismissed.\(accountID)")
    }

    var body: some View {
        if !dismissed && !model.hasRunningSession {
            Section {
                Text("Your Pokus, tasks, captures, and notes live together here. Start with one Pokus.")
                    .font(.subheadline).foregroundStyle(Color.pk.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Picker("Pokus length", selection: $duration) {
                    ForEach(FocusDuration.presets, id: \.self) { Text("\($0) min").tag($0) }
                    if !FocusDuration.presets.contains(duration) { Text("\(duration) min").tag(duration) }
                }
                .pickerStyle(.menu)
                .frame(minHeight: 44)
                .accessibilityIdentifier("welcomeDuration")
                if let addedTitle {
                    Label("Next Pokus: \(addedTitle)", systemImage: "checklist")
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("welcomeTask")
                } else {
                    let layout = typeSize.isAccessibilitySize
                        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
                        : AnyLayout(HStackLayout(spacing: 12))
                    layout {
                        TextField("What are you working on?", text: $taskTitle)
                            .focused($titleFocused).submitLabel(.done)
                            .onSubmit(addTask)
                            .frame(minHeight: 44)
                            .accessibilityHint("Adds a task due today and links it to your first Pokus.")
                            .accessibilityIdentifier("welcomeTaskTitle")
                        Button(adding ? "Adding…" : "Add", action: addTask)
                            .buttonStyle(.bordered).frame(minHeight: 44)
                            .disabled(!model.canEdit || adding || taskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
                Button {
                    titleFocused = false
                    dismissed = true
                    startFocus()
                } label: {
                    Label("Start a Pokus", systemImage: "play.fill")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.pkPrimary)
                .disabled(!model.storageReady)
                .accessibilityIdentifier("welcomeStart")
            } header: {
                HStack {
                    Text("Welcome to Pokus").font(.headline).foregroundStyle(Color.pk.textPrimary)
                    Spacer()
                    Button { dismissed = true } label: {
                        Label("Dismiss welcome", systemImage: "xmark").labelStyle(.iconOnly)
                            .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                    }
                    .buttonStyle(.borderless)
                    .accessibilityIdentifier("dismissWelcome")
                }
            }
            .textCase(nil)
        }
    }

    /// Creates an unassigned task due today and links it to the next session.
    private func addTask() {
        let title = taskTitle
        guard !adding, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, model.canEdit else { return }
        let id = FocusSession.makeID()
        titleFocused = false
        adding = true
        Task {
            defer { adding = false }
            do {
                // A failed save reports through the app's error banner.
                guard try await model.saveTask(original: nil, creationID: id, title: title, description: "", projectID: "",
                                               priority: .none, category: "", dueDate: .now) else { return }
                model.selectedTaskID = id
                addedTitle = WorkspaceRules.normalizeTitle(title)
                taskTitle = ""
            } catch { model.error = error.localizedDescription }
        }
    }
}
