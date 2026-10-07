import DailyCore
import PokusCore
import SwiftUI

struct ProgressViewScreen: View {
    let store: any HabitViewStore
    let today: DayKey
    @State private var selectedDay: DayKey?
    @State private var statistics = ReadState<HabitStatistics>()
    @State private var dayState = ReadState<HabitDayIndex>()
    @State private var retry = 0
    var body: some View {
        Group {
            if let index = dayState.value {
                if index.ids.isEmpty {
                    ContentUnavailableView("No habits yet", systemImage: "checkmark.circle",
                        description: Text("Add a habit to see your streaks and daily activity."))
                } else {
                    progressList(index)
                }
            } else if let error = dayState.error {
                ReadError(message: error) { retry += 1 }.padding()
            } else {
                ProgressView("Loading habits").frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DailyTheme.background)
        .sheet(item: $selectedDay) { DayEditorView(store: store, day: $0, today: today) }
        .task(id: "\(store.readIdentity)-\(today)-\(retry)") {
            async let day: Void = dayState.load { try await store.dayIndex(today) }
            async let stats: Void = statistics.load { try await store.statistics(through: today, habitID: nil) }
            _ = await (day, stats)
        }
    }

    private func progressList(_ index: HabitDayIndex) -> some View {
        List {
            Section {
                if let value = statistics.value { StreakCards(streaks: value.overall, isOverall: true) }
                else if let error = statistics.error { ReadError(message: error) { retry += 1 } }
                else { ProgressView("Loading lifetime statistics") }
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            Section {
                HabitActivityView(store: store, today: today) { selectedDay = $0 }
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            Section("Habit history") {
                HabitPagedRows(store: store, ids: index.ids, day: today, index: index) { habit in
                    NavigationLink { HabitDetailView(store: store, habitID: habit.id, today: today) } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(habit.name).font(.body.weight(.medium)).foregroundStyle(.primary)
                                .fixedSize(horizontal: false, vertical: true)
                            if let stats = statistics.value?.byID[habit.id] {
                                Text("\(stats.current) day streak · \(stats.completedDays) \(stats.completedDays == 1 ? "day" : "days") completed")
                                    .font(.subheadline).foregroundStyle(.secondary)
                            } else {
                                Text(statistics.error == nil ? "Loading statistics" : "Statistics unavailable")
                                    .font(.subheadline).foregroundStyle(.secondary)
                            }
                        }.frame(minHeight: 44)
                    }.accessibilityIdentifier("detail-\(habit.name)")
                }
            }
            .textCase(nil)
            if let error = dayState.error { ReadError(message: error) { retry += 1 } }
            if let error = statistics.error, statistics.value != nil { ReadError(message: error) { retry += 1 } }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(16)
        .contentMargins(.top, 0)
        .scrollContentBackground(.hidden)
    }
}

struct HabitDetailView: View {
    let store: any HabitViewStore
    let habitID: UUID
    let today: DayKey
    @Environment(\.dismiss) private var dismiss
    @State private var selectedDay: DayKey?
    @State private var showingEdit = false
    @State private var confirmingDelete = false
    @State private var save = SaveAction()
    @State private var detail = ReadState<HabitHistory?>()
    @State private var statistics = ReadState<HabitStatistics>()
    @State private var retry = 0
    var body: some View {
        Group {
            if let habit = detail.value ?? nil {
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        Card {
                            VStack(alignment: .leading, spacing: 12) {
                                Label(habit.kind == .check ? "A daily check-in" : "\(NumberText.display(habit.target(on: today))) \(habit.unit) a day",
                                      systemImage: habit.kind == .check ? "checkmark.circle" : "number.circle")
                                    .font(.headline).foregroundStyle(DailyTheme.accent)
                                Text("Started \(habit.startDay.formatted("MMMM d, yyyy"))").font(.subheadline).foregroundStyle(.secondary)
                                if let stats = statistics.value?.byID[habitID] {
                                    Text("\(stats.completedDays) \(stats.completedDays == 1 ? "day" : "days") completed").font(.subheadline.weight(.medium))
                                }
                            }
                        }
                        if let stats = statistics.value?.byID[habitID] { StreakCards(streaks: stats) }
                        else if let error = statistics.error { ReadError(message: error) { retry += 1 } }
                        else { ProgressView("Loading lifetime statistics") }
                        HabitActivityView(store: store, today: today, habitID: habitID) { selectedDay = $0 }
                        Text("An unfinished today keeps yesterday's streak alive. Tap any past day to fill it in or make a correction.")
                            .font(.footnote).foregroundStyle(.secondary).padding(.horizontal, 4)
                    }.padding(20)
                }.navigationTitle(habit.name)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Menu {
                                Button("Edit habit", systemImage: "pencil") { showingEdit = true }
                                Button("Delete habit", systemImage: "trash", role: .destructive) { confirmingDelete = true }
                            } label: { Image(systemName: "ellipsis.circle") }
                                .accessibilityLabel("Habit options").disabled(!store.canWrite || save.isSaving)
                        }
                    }
                    .sheet(isPresented: $showingEdit) { HabitEditorView(store: store, today: today, existing: habit) }
            } else if let error = detail.error { ReadError(message: error) { retry += 1 }.padding() }
            else if detail.value == nil { ProgressView("Loading habit") }
            else { ContentUnavailableView("Habit deleted", systemImage: "checkmark.circle") }
        }.background(DailyTheme.background).navigationBarTitleDisplayMode(.inline)
            .sheet(item: $selectedDay) { DayEditorView(store: store, day: $0, today: today, habitID: habitID) }
            .alert("Delete this habit and all its history?", isPresented: $confirmingDelete) {
                Button("Cancel", role: .cancel) { }
                Button("Delete habit and history", role: .destructive) {
                    save.performAsync { try await store.delete(id: habitID) } onSuccess: { dismiss() }
                }
            } message: { Text("This cannot be undone. Overall progress and streaks will be recalculated.") }
            .saveAlert(save)
            .task(id: "\(store.readIdentity)-\(today)-\(habitID)-\(retry)") {
                await detail.load { try await store.detail(id: habitID, on: today) }
                if detail.value != nil { await statistics.load { try await store.statistics(through: today, habitID: habitID) } }
            }
    }
}
