import DailyCore
import DailyPersistence
import SwiftUI

struct DayEditorView: View {
    let store: HabitStore
    let today: DayKey
    var habitID: UUID?
    @State private var day: DayKey
    @Environment(\.dismiss) private var dismiss
    @State private var entryToEdit: EntrySelection?
    @State private var save = SaveAction()

    init(store: HabitStore, day: DayKey, today: DayKey, habitID: UUID? = nil) {
        self.store = store
        self.today = today
        self.habitID = habitID
        _day = State(initialValue: day)
    }

    private var firstDay: DayKey {
        store.histories.filter { habitID == nil || $0.id == habitID }.map(\.startDay).min() ?? today
    }

    private var habits: [HabitHistory] {
        store.histories.filter { $0.startDay <= day && (habitID == nil || $0.id == habitID) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    DatePicker("Date", selection: Binding(
                        get: { day.date },
                        set: { day = DayKey(date: $0, timeZone: TimeZone(secondsFromGMT: 0)!) }
                    ), in: min(firstDay.date, today.date)...today.date, displayedComponents: .date)
                    .environment(\.timeZone, TimeZone(secondsFromGMT: 0)!)
                    .environment(\.calendar, Calendar(identifier: .gregorian))
                    .accessibilityIdentifier("historyDatePicker")
                }
                Section {
                    ForEach(habits) { habit in
                        if habit.kind == .check {
                            Toggle(isOn: Binding(
                                get: { store.history(id: habit.id)?.isComplete(on: day) ?? false },
                                set: { completed in
                                    save.perform { try store.setValue(completed ? 1 : 0, for: habit.id, on: day) }
                                }
                            )) {
                                Text(habit.name)
                            }
                            .accessibilityIdentifier("history-\(habit.name)")
                            .padding(.vertical, 6)
                        } else {
                            Button {
                                entryToEdit = EntrySelection(habitID: habit.id, day: day)
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(habit.name).foregroundStyle(.primary)
                                        Text("\(NumberText.display(habit.value(on: day))) / \(NumberText.display(habit.target(on: day))) \(habit.unit)")
                                            .font(.subheadline).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Image(systemName: habit.isComplete(on: day) ? "checkmark.circle.fill" : "pencil.circle")
                                        .font(.title2).foregroundStyle(DailyTheme.green)
                                }
                                .padding(.vertical, 6)
                            }
                            .accessibilityLabel("\(habit.name), \(NumberText.display(habit.value(on: day))) of \(NumberText.display(habit.target(on: day))) \(habit.unit). Edit total")
                            .accessibilityIdentifier("history-\(habit.name)")
                        }
                    }
                } header: {
                    Text(day.formatted("EEEE, MMMM d, yyyy"))
                } footer: {
                    Text("Changes save immediately and update your progress and streaks.")
                }
            }
            .navigationTitle(day == today ? "Today's entries" : "Daily entries")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .sheet(item: $entryToEdit) { selection in
                EntryEditorView(store: store, habitID: selection.habitID, day: selection.day, today: today)
            }
            .saveAlert(save)
        }
    }
}
