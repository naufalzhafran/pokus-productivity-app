import DailyCore
import DailyPersistence
import SwiftUI

struct TodayView: View {
    let store: HabitStore
    let today: DayKey
    @State private var showingAdd = false
    @State private var entryToEdit: EntrySelection?
    @State private var save = SaveAction()

    private var habits: [HabitHistory] { store.histories.filter { $0.startDay <= today } }
    private var progress: DayProgress { ProgressCalculator.progress(on: today, habits: habits) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text(today.formatted("EEEE, MMMM d").uppercased())
                    .font(.caption.weight(.medium))
                    .tracking(1.5)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 4)

                if habits.isEmpty {
                    EmptyHabitsView { showingAdd = true }
                } else {
                    TodaySummary(progress: progress)
                    VStack(spacing: 12) {
                        SectionCaption(title: "Your habits", trailing: "\(progress.completed) of \(progress.total)")
                        ForEach(habits) { habit in
                            HabitRow(habit: habit, day: today,
                                     detail: { HabitDetailView(store: store, habitID: habit.id, today: today) },
                                     toggle: { set(habit.isComplete(on: today) ? 0 : 1, habit: habit) },
                                     increment: { set(habit.value(on: today) + 1, habit: habit) },
                                     edit: { entryToEdit = EntrySelection(habitID: habit.id, day: today) })
                        }
                    }

                    Label("Small steps count. Keep showing up.", systemImage: "sparkle")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
            }
            .padding(20)
        }
        .background(DailyTheme.background)
        .navigationTitle("Today")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Add habit", systemImage: "plus") { showingAdd = true }
                    .accessibilityIdentifier("addHabit")
            }
        }
        .sheet(isPresented: $showingAdd) {
            HabitEditorView(store: store, today: today)
        }
        .sheet(item: $entryToEdit) { selection in
            EntryEditorView(store: store, habitID: selection.habitID, day: selection.day, today: today)
        }
        .saveAlert(save)
    }

    private func set(_ value: Double, habit: HabitHistory) {
        let day = today
        save.perform { try store.setValue(value, for: habit.id, on: day) }
    }
}

private struct TodaySummary: View {
    let progress: DayProgress
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 20)) : AnyLayout(HStackLayout(spacing: 18))
        layout {
            VStack(alignment: .leading, spacing: 10) {
                Text(progress.completed == progress.total ? "A good day,\none habit at a time." : "Small steps.\nSteady progress.")
                    .font(.system(.title2, design: .rounded, weight: .semibold))
                    .fixedSize(horizontal: false, vertical: true)
                Text(progress.completed == progress.total ? "All your habits are complete." : "\(progress.completed) of \(progress.total) habits complete")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            ZStack {
                Circle().stroke(DailyTheme.green.opacity(0.12), lineWidth: 7)
                Circle()
                    .trim(from: 0, to: progress.fraction)
                    .stroke(DailyTheme.green, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                if progress.completed == progress.total {
                    Image(systemName: "checkmark").font(.title2.weight(.semibold)).foregroundStyle(DailyTheme.green)
                } else {
                    Text(progress.fraction.formatted(.percent.precision(.fractionLength(0))))
                        .font(.system(size: 20, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                }
            }
            .frame(width: 80, height: 80)
            .accessibilityHidden(true)
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(DailyTheme.green.opacity(0.07), in: RoundedRectangle(cornerRadius: 26))
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
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12)) : AnyLayout(HStackLayout(spacing: 12))
        layout {
            NavigationLink(destination: detail) {
                HStack(spacing: 12) {
                    Image(systemName: habit.kind == .check ? "checkmark" : "number")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(DailyTheme.green)
                        .frame(width: 40, height: 40)
                        .background(DailyTheme.green.opacity(0.08), in: RoundedRectangle(cornerRadius: 13))
                    VStack(alignment: .leading, spacing: 5) {
                        Text(habit.name).font(.body.weight(.medium)).foregroundStyle(.primary)
                        if habit.kind == .number {
                            Text("\(NumberText.display(habit.value(on: day))) / \(NumberText.display(habit.target(on: day))) \(habit.unit)")
                                .font(.caption).foregroundStyle(.secondary)
                        } else {
                            Text(habit.isComplete(on: day) ? "Done for the day" : "A little commitment to yourself")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(minHeight: 48)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(habit.name), view progress")

            if habit.kind == .check {
                Button(action: toggle) {
                    Image(systemName: habit.isComplete(on: day) ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 29, weight: .light))
                        .foregroundStyle(habit.isComplete(on: day) ? DailyTheme.green : Color.secondary.opacity(0.5))
                        .frame(width: 48, height: 48)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Mark \(habit.name) \(habit.isComplete(on: day) ? "incomplete" : "complete")")
                .accessibilityIdentifier("check-\(habit.name)")
            } else {
                HStack(spacing: 0) {
                    Button(action: edit) {
                        Image(systemName: "pencil").font(.system(size: 15)).frame(width: 44, height: 48)
                    }
                    .accessibilityLabel("Edit \(habit.name) total")
                    .accessibilityIdentifier("entry-\(habit.name)")
                    Button(action: increment) {
                        Image(systemName: "plus").font(.system(size: 17, weight: .semibold)).frame(width: 44, height: 48)
                    }
                    .accessibilityLabel("Add one to \(habit.name)")
                }
                .buttonStyle(.plain)
                .foregroundStyle(DailyTheme.green)
                .background(DailyTheme.green.opacity(0.07), in: Capsule())
            }
        }
        .padding(16)
        .background(DailyTheme.card, in: RoundedRectangle(cornerRadius: 22))
    }
}

struct EntrySelection: Identifiable {
    let habitID: UUID
    let day: DayKey
    var id: String { "\(habitID)-\(day.rawValue)" }
}
