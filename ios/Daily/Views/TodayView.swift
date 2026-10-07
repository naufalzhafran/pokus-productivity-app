import DailyCore
import PokusCore
import SwiftUI

struct HabitsView: View {
    let store: any HabitViewStore
    let today: DayKey
    @Binding var showingProgress: Bool
    @State private var showingAdd = false
    @State private var dayState = ReadState<HabitDayIndex>()
    @State private var retry = 0

    var body: some View {
        VStack(spacing: 0) {
            Picker("Habit view", selection: $showingProgress) {
                Text("Today").tag(false)
                Text("Progress").tag(true)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 12)

            if showingProgress {
                ProgressViewScreen(store: store, today: today)
            } else if let index = dayState.value {
                if index.ids.isEmpty { EmptyHabitsView(canAdd: store.canWrite) { showingAdd = true } }
                else { TodayView(store: store, today: today, index: index) }
            } else if let error = dayState.error {
                ReadError(message: error) { retry += 1 }.padding()
            } else { ProgressView("Loading habits").frame(maxWidth: .infinity, maxHeight: .infinity) }
            if let error = dayState.error, dayState.value != nil {
                ReadError(message: error) { retry += 1 }.padding()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DailyTheme.background)
        .navigationTitle("Habits")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            if dayState.value?.ids.isEmpty == false || showingProgress {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Add habit", systemImage: "plus") { showingAdd = true }
                        .accessibilityIdentifier("addHabit")
                        .disabled(!store.canWrite)
                }
            }
        }
        .sheet(isPresented: $showingAdd) { HabitEditorView(store: store, today: today) }
        .task(id: "\(store.readIdentity)-\(today)-\(retry)") {
            await dayState.load { try await store.dayIndex(today) }
        }
    }
}

struct TodayView: View {
    let store: any HabitViewStore
    let today: DayKey
    let index: HabitDayIndex
    @State private var entryToEdit: EntrySelection?
    @State private var save = SaveAction()

    private var progress: DayProgress { index.progress }

    var body: some View {
        Group {
            if index.ids.isEmpty {
                ContentUnavailableView("No habits for today", systemImage: "calendar", description: Text("Your habits will appear here on their start date."))
            } else {
                List {
                    Section {
                        TodaySummary(progress: progress, today: today)
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets(top: 12, leading: 0, bottom: 8, trailing: 0))
                            .listRowSeparator(.hidden)
                    }
                    if !index.remaining.isEmpty {
                        Section {
                            habitRows(index.remaining)
                        } header: {
                            sectionHeader("To do", count: index.remaining.count)
                        }.textCase(nil)
                    }
                    if !index.completed.isEmpty {
                        Section {
                            habitRows(index.completed)
                        } header: {
                            sectionHeader("Completed", count: index.completed.count)
                        }.textCase(nil)
                    }
                }
                .listStyle(.insetGrouped)
                .contentMargins(.top, 0)
                .scrollContentBackground(.hidden)
            }
        }
        .background(DailyTheme.background)
        .sheet(item: $entryToEdit) { selection in
            LoadedEntryEditor(store: store, habitID: selection.habitID, day: selection.day, today: today)
        }
        .saveAlert(save)
    }

    private func sectionHeader(_ title: String, count: Int) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(count.formatted()).monospacedDigit()
        }.accessibilityElement(children: .combine)
    }

    private func habitRows(_ ids: [String]) -> some View {
        HabitPagedRows(store: store, ids: ids, day: today, index: index) { habit in
            HabitRow(habit: habit, day: today,
                     detail: { HabitDetailView(store: store, habitID: habit.id, today: today) },
                     toggle: { set(habit.isComplete(on: today) ? 0 : 1, habit: habit) },
                     increment: { set(habit.value(on: today) + 1, habit: habit) },
                     edit: { entryToEdit = EntrySelection(habitID: habit.id, day: today) },
                     canEdit: store.canWrite && !save.isSaving)
        }
    }

    private func set(_ value: Double, habit: HabitHistory) {
        let day = today
        save.performAsync { try await store.setValue(value, for: habit.id, on: day) }
    }
}

private struct TodaySummary: View {
    let progress: DayProgress
    let today: DayKey
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(today.formatted("EEEE, MMMM d"))
                .font(.subheadline).foregroundStyle(.secondary)
            Text(progress.completed == progress.total ? "All done for today" : "\(progress.completed) of \(progress.total) complete")
                .font(.title2.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
            ProgressView(value: progress.fraction)
                .tint(DailyTheme.accent)
                .accessibilityHidden(true)
            Text(progress.completed == progress.total ? "All your habits are complete." : "\(progress.total - progress.completed) \(progress.total - progress.completed == 1 ? "habit" : "habits") remaining")
                .font(.subheadline).foregroundStyle(.secondary)
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: progress)
        .accessibilityElement(children: .combine)
    }
}

struct HabitRow<Detail: View>: View {
    let habit: HabitHistory
    let day: DayKey
    @ViewBuilder let detail: () -> Detail
    let toggle: () -> Void
    let increment: () -> Void
    let edit: () -> Void
    var canEdit = true
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 12))
        layout {
            NavigationLink(destination: detail) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(habit.name).font(.body.weight(.medium)).foregroundStyle(.primary)
                    if habit.kind == .number {
                        Text("\(NumberText.display(habit.value(on: day))) of \(NumberText.display(habit.target(on: day)))\(habit.unit.isEmpty ? "" : " \(habit.unit)")")
                            .font(.subheadline).foregroundStyle(.secondary)
                    } else {
                        Text(habit.isComplete(on: day) ? "Completed" : "Daily check-in")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(habit.name), view progress")

            if habit.kind == .check {
                Button(action: toggle) {
                    Image(systemName: habit.isComplete(on: day) ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 29, weight: .light))
                        .foregroundStyle(habit.isComplete(on: day) ? DailyTheme.accent : Color.secondary)
                        .frame(width: 48, height: 48)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Mark \(habit.name) \(habit.isComplete(on: day) ? "incomplete" : "complete")")
                .accessibilityIdentifier("check-\(habit.name)")
                .disabled(!canEdit)
            } else {
                HStack(spacing: 0) {
                    Button(action: edit) {
                        Image(systemName: "pencil").font(.body).frame(width: 44, height: 48)
                    }
                    .accessibilityLabel("Edit \(habit.name) total")
                    .accessibilityIdentifier("entry-\(habit.name)")
                    Button(action: increment) {
                        Text("+1").font(.body.weight(.semibold)).frame(width: 44, height: 48)
                    }
                    .accessibilityLabel("Add one to \(habit.name)")
                }
                .buttonStyle(.plain)
                .foregroundStyle(DailyTheme.accent)
                .disabled(!canEdit)
            }
        }
        .padding(.vertical, 6)
    }
}

struct EntrySelection: Identifiable {
    let habitID: UUID
    let day: DayKey
    var id: String { "\(habitID)-\(day.rawValue)" }
}
