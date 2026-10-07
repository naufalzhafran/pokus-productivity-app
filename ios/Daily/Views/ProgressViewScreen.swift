import DailyCore
import DailyPersistence
import SwiftUI

struct ProgressViewScreen: View {
    let store: HabitStore
    let today: DayKey
    @State private var selectedDay: DayKey?
    @State private var showingAdd = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if store.histories.isEmpty {
                    EmptyHabitsView { showingAdd = true }
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Look how far you've come.")
                            .font(.system(.title3, design: .rounded, weight: .medium))
                        Text("Complete one habit a day to keep your streak going.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 4)
                    StreakCards(streaks: ProgressCalculator.streaks(habits: store.histories, today: today))
                    ActivityGrid(habits: store.histories, today: today) { selectedDay = $0 }
                    VStack(spacing: 12) {
                        SectionCaption(title: "Habit by habit")
                        ForEach(store.histories) { habit in
                            NavigationLink {
                                HabitDetailView(store: store, habitID: habit.id, today: today)
                            } label: {
                                Card {
                                    HStack(spacing: 16) {
                                        VStack(alignment: .leading, spacing: 5) {
                                            Text(habit.name).font(.body.weight(.medium)).foregroundStyle(.primary)
                                            let streak = Streaks(completed: habit.completedDays(through: today), today: today)
                                            Text("\(streak.current) day streak · \(streak.completedDays) days completed")
                                                .font(.caption).foregroundStyle(.secondary)
                                        }
                                        Spacer(minLength: 0)
                                        Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("detail-\(habit.name)")
                        }
                    }
                }
            }
            .padding(20)
        }
        .background(DailyTheme.background)
        .navigationTitle("Progress")
        .sheet(item: $selectedDay) { day in DayEditorView(store: store, day: day, today: today) }
        .sheet(isPresented: $showingAdd) { HabitEditorView(store: store, today: today) }
    }
}

struct HabitDetailView: View {
    let store: HabitStore
    let habitID: UUID
    let today: DayKey
    @Environment(\.dismiss) private var dismiss
    @State private var selectedDay: DayKey?
    @State private var showingEdit = false
    @State private var confirmingDelete = false
    @State private var save = SaveAction()

    var body: some View {
        Group {
            if let habit = store.history(id: habitID) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        Card {
                            VStack(alignment: .leading, spacing: 12) {
                                Label(habit.kind == .check ? "A daily check-in" : "\(NumberText.display(habit.target(on: today))) \(habit.unit) a day",
                                      systemImage: habit.kind == .check ? "checkmark.circle" : "number.circle")
                                    .font(.headline).foregroundStyle(DailyTheme.green)
                                Text("Started \(habit.startDay.formatted("MMMM d, yyyy"))")
                                    .font(.subheadline).foregroundStyle(.secondary)
                                let completed = habit.completedDays(through: today).count
                                Text("\(completed) \(completed == 1 ? "day" : "days") completed")
                                    .font(.subheadline.weight(.medium))
                            }
                        }
                        StreakCards(streaks: Streaks(completed: habit.completedDays(through: today), today: today))
                        ActivityGrid(habits: [habit], today: today, individual: true) { selectedDay = $0 }
                        Text("An unfinished today keeps yesterday's streak alive. Tap any past day to fill it in or make a correction.")
                            .font(.footnote).foregroundStyle(.secondary).padding(.horizontal, 4)
                    }
                    .padding(20)
                }
                .navigationTitle(habit.name)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button("Edit habit", systemImage: "pencil") { showingEdit = true }
                            Button("Delete habit", systemImage: "trash", role: .destructive) { confirmingDelete = true }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                        }
                        .accessibilityLabel("Habit options")
                    }
                }
                .sheet(isPresented: $showingEdit) { HabitEditorView(store: store, today: today, existing: habit) }
            } else {
                ContentUnavailableView("Habit deleted", systemImage: "checkmark.circle")
            }
        }
        .background(DailyTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $selectedDay) { day in DayEditorView(store: store, day: day, today: today, habitID: habitID) }
        .confirmationDialog("Delete this habit and all its history?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete habit and history", role: .destructive) {
                save.perform { try store.delete(id: habitID) } onSuccess: { dismiss() }
            }
        } message: {
            Text("This cannot be undone. Overall progress and streaks will be recalculated.")
        }
        .saveAlert(save)
    }
}
