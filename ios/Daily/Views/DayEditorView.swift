import DailyCore
import DailyPersistence
import PokusCore
import SwiftUI

struct DayEditorView: View {
    let store: any HabitViewStore
    let today: DayKey
    var habitID: UUID?
    @State private var day: DayKey
    @Environment(\.dismiss) private var dismiss
    @State private var entryToEdit: EntrySelection?
    @State private var save = SaveAction()
    @State private var indexState = ReadState<HabitDayIndex>()
    @State private var earliest: DayKey?
    @State private var retry = 0

    init(store: any HabitViewStore, day: DayKey, today: DayKey, habitID: UUID? = nil) {
        self.store = store
        self.today = today
        self.habitID = habitID
        _day = State(initialValue: day)
    }

    private var firstDay: DayKey {
        earliest ?? today
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
                    if let index = indexState.value {
                        let ids = index.ids.filter { habitID == nil || HabitWire.identity($0) == habitID || UUID(uuidString: $0) == habitID }
                        HabitPagedRows(store: store, ids: ids, day: day, index: index) { habit in
                        if habit.kind == .check {
                            Toggle(isOn: Binding(
                                get: { habit.isComplete(on: day) },
                                set: { completed in
                                    let selectedDay = day
                                    save.performAsync { try await store.setValue(completed ? 1 : 0, for: habit.id, on: selectedDay) }
                                }
                            )) {
                                Text(habit.name)
                            }
                            .accessibilityIdentifier("history-\(habit.name)")
                            .disabled(!store.canWrite || save.isSaving)
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
                                        .font(.title2).foregroundStyle(DailyTheme.accent)
                                }
                                .padding(.vertical, 6)
                            }
                            .accessibilityLabel("\(habit.name), \(NumberText.display(habit.value(on: day))) of \(NumberText.display(habit.target(on: day))) \(habit.unit). Edit total")
                            .accessibilityIdentifier("history-\(habit.name)")
                        }
                        }
                    } else if let error = indexState.error { ReadError(message: error) { retry += 1 } }
                    else { ProgressView("Loading daily entries") }
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
                LoadedEntryEditor(store: store, habitID: selection.habitID, day: selection.day, today: today)
            }
            .saveAlert(save)
            .task(id: "\(store.readIdentity)-\(day)-\(retry)") {
                indexState.clear()
                await indexState.load { try await store.dayIndex(day) }
                if let index = indexState.value { earliest = min(earliest ?? index.earliest, index.earliest) }
                if let habitID, let detail = try? await store.detail(id: habitID, on: day) { earliest = detail.startDay }
            }
        }
    }
}
