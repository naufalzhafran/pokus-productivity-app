import DailyCore
import DailyPersistence
import SwiftUI

struct HabitEditorView: View {
    let store: HabitStore
    let today: DayKey
    let existing: HabitHistory?
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var kind: HabitKind
    @State private var unit: String
    @State private var target: String
    @State private var save = SaveAction()
    @FocusState private var focusedName: Bool

    init(store: HabitStore, today: DayKey, existing: HabitHistory? = nil) {
        self.store = store
        self.today = today
        self.existing = existing
        _name = State(initialValue: existing?.name ?? "")
        _kind = State(initialValue: existing?.kind ?? .check)
        _unit = State(initialValue: existing?.unit ?? "")
        _target = State(initialValue: existing.map { NumberText.editable($0.target(on: today)) } ?? "")
    }

    private var numericTarget: Double? { kind == .check ? 1 : NumberText.parse(target) }
    private var isValid: Bool { !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (numericTarget ?? 0) > 0 }

    var body: some View {
        NavigationStack {
            Form {
                Section("The small thing you'll do") {
                    TextField("Habit name", text: $name)
                        .focused($focusedName)
                        .textInputAutocapitalization(.sentences)
                        .accessibilityIdentifier("habitName")
                }
                Section {
                    if existing == nil {
                        Picker("Track with", selection: $kind) {
                            ForEach(HabitKind.allCases, id: \.self) { type in Text(type.title).tag(type) }
                        }
                        .pickerStyle(.segmented)
                        .accessibilityIdentifier("habitType")
                    } else {
                        LabeledContent("Track with", value: kind.title)
                    }
                    if kind == .number {
                        TextField("Daily target, e.g. 20", text: $target)
                            .keyboardType(.decimalPad)
                            .accessibilityIdentifier("habitTarget")
                        if existing == nil {
                            TextField("Unit, e.g. pages (optional)", text: $unit)
                                .accessibilityIdentifier("habitUnit")
                        } else if !unit.isEmpty {
                            LabeledContent("Unit", value: unit)
                        }
                    }
                } header: {
                    Text("Make it measurable")
                } footer: {
                    Text(kind == .check ? "A simple check when you're done. This habit repeats every day."
                         : "Reach your daily target to complete the habit. You can enter decimals, too.")
                }
                if existing != nil && kind == .number {
                    Section {
                        Label("A new target starts today. Earlier days keep their original target.", systemImage: "clock.arrow.circlepath")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle(existing == nil ? "New habit" : "Edit habit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: commit)
                        .fontWeight(.semibold)
                        .disabled(!isValid)
                        .accessibilityIdentifier("saveHabit")
                }
            }
            .saveAlert(save)
        }
    }

    private func commit() {
        guard let parsed = numericTarget, isValid else { return }
        let name = name, kind = kind, unit = unit
        save.perform {
            if let existing {
                try store.edit(id: existing.id, name: name, target: parsed)
            } else {
                try store.create(name: name, kind: kind, unit: unit, target: parsed)
            }
        } onSuccess: { dismiss() }
    }
}

struct EntryEditorView: View {
    let store: HabitStore
    let habitID: UUID
    let day: DayKey
    let today: DayKey
    @Environment(\.dismiss) private var dismiss
    @State private var amount: String
    @State private var save = SaveAction()

    init(store: HabitStore, habitID: UUID, day: DayKey, today: DayKey) {
        self.store = store
        self.habitID = habitID
        self.day = day
        self.today = today
        _amount = State(initialValue: NumberText.editable(store.history(id: habitID)?.value(on: day) ?? 0))
    }

    var body: some View {
        NavigationStack {
            Form {
                if let habit = store.history(id: habitID) {
                    Section {
                        TextField("Daily total", text: $amount)
                            .keyboardType(.decimalPad)
                            .font(.title2.monospacedDigit())
                            .accessibilityIdentifier("dailyTotal")
                    } header: {
                        Text(habit.name)
                    } footer: {
                        Text("Target: \(NumberText.display(habit.target(on: day))) \(habit.unit). Enter the total for this day. Zero clears your progress.")
                    }
                    Section {
                        Label(day.formatted(), systemImage: "calendar")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Daily total")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        guard let value = NumberText.parse(amount) else { return }
                        save.perform { try store.setValue(value, for: habitID, on: day) } onSuccess: { dismiss() }
                    }
                    .disabled(NumberText.parse(amount) == nil)
                    .accessibilityIdentifier("saveEntry")
                }
            }
            .saveAlert(save)
        }
    }
}
