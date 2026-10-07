import DailyCore
import DailyPersistence
import PokusCore
import SwiftUI

struct HabitEditorView: View {
    let store: any HabitViewStore
    let today: DayKey
    let existing: HabitHistory?
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var kind: HabitKind
    @State private var unit: String
    @State private var target: String
    @State private var originalName: String
    @State private var originalTarget: Double
    @State private var nameEdited = false
    @State private var save = SaveAction()
    @State private var creationID = FocusSession.makeID()
    private enum Field { case name, target, unit }
    @FocusState private var focusedField: Field?
    @State private var initialDraft: [String]?
    @State private var closeRequested = false
    @Environment(\.dynamicTypeSize) private var typeSize
    private var draft: [String] { [name.trimmingCharacters(in: .whitespacesAndNewlines), kind.rawValue, unit, target] }

    init(store: any HabitViewStore, today: DayKey, existing: HabitHistory? = nil) {
        self.store = store
        self.today = today
        self.existing = existing
        _name = State(initialValue: existing?.name ?? "")
        _kind = State(initialValue: existing?.kind ?? .check)
        _unit = State(initialValue: existing?.unit ?? "")
        _target = State(initialValue: existing.map { NumberText.editable($0.target(on: today)) } ?? "")
        _originalName = State(initialValue: existing?.name.trimmingCharacters(in: .whitespacesAndNewlines) ?? "")
        _originalTarget = State(initialValue: existing?.target(on: today) ?? 1)
    }

    private var cleanName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var numericTarget: Double? { kind == .check ? 1 : NumberText.parse(target) }
    private var nameError: String? {
        if cleanName.isEmpty { return "Give your habit a name." }
        return cleanName.count > 120 ? "Use a name of up to 120 characters." : nil
    }
    private var unitError: String? {
        guard existing == nil, kind == .number else { return nil }
        return unit.trimmingCharacters(in: .whitespacesAndNewlines).count > 40 ? "Use a unit of up to 40 characters." : nil
    }
    private var targetError: String? {
        (numericTarget ?? 0) > 0 ? nil : "Enter a daily target greater than zero."
    }
    private var isValid: Bool { nameError == nil && unitError == nil && targetError == nil }
    private var changedName: String? { cleanName == originalName ? nil : cleanName }
    private var changedTarget: Double? {
        guard kind == .number, let numericTarget, numericTarget != originalTarget else { return nil }
        return numericTarget
    }
    private var hasChanges: Bool { existing == nil || changedName != nil || changedTarget != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section("The small thing you'll do") {
                    TextField("Habit name", text: $name)
                        .focused($focusedField, equals: .name)
                        .textInputAutocapitalization(.sentences)
                        .submitLabel(kind == .number ? .next : .done)
                        .onSubmit { focusedField = kind == .number ? .target : nil }
                        .accessibilityIdentifier("habitName")
                        .onChange(of: name) { _, _ in nameEdited = true }
                    EditorError(message: nameEdited || existing != nil ? nameError : nil)
                }
                if existing == nil || kind == .number {
                    Section {
                        if existing == nil {
                            Picker("Track with", selection: $kind) {
                                ForEach(HabitKind.allCases, id: \.self) { type in Text(type.title).tag(type) }
                            }
                            .pickerStyle(.segmented)
                            .accessibilityIdentifier("habitType")
                        }
                        if kind == .number {
                            let layout = typeSize.isAccessibilitySize
                                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
                                : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 12))
                            layout {
                                TextField("Daily target, e.g. 20", text: $target)
                                    .keyboardType(.decimalPad)
                                    .focused($focusedField, equals: .target)
                                    .accessibilityLabel("Daily target")
                                    .accessibilityIdentifier("habitTarget")
                                if existing != nil && !unit.isEmpty {
                                    Text(unit).foregroundStyle(.secondary)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                            EditorError(message: targetError)
                            if existing == nil {
                                TextField("Unit, e.g. pages (optional)", text: $unit)
                                    .focused($focusedField, equals: .unit)
                                    .submitLabel(.done)
                                    .onSubmit { focusedField = nil }
                                    .accessibilityIdentifier("habitUnit")
                                EditorError(message: unitError)
                            }
                        }
                    } header: {
                        Text(existing == nil ? "Make it measurable" : "Daily target")
                    } footer: {
                        if existing != nil {
                            Text("A new target starts today. Earlier days keep their original target.")
                        } else {
                            Text(kind == .check ? "A simple check when you're done. This habit repeats every day."
                                 : "Reach your daily target to complete the habit. You can enter decimals, too.")
                        }
                    }
                }
            }.disabled(save.isSaving)
            .keyboardDoneButton(isEditing: focusedField != nil) { focusedField = nil }
            .onAppear { if initialDraft == nil { initialDraft = draft } }
            .navigationTitle(existing == nil ? "New habit" : "Edit habit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { closeRequested = true }.disabled(save.isSaving) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(save.isSaving ? "Saving…" : "Save", action: commit)
                        .fontWeight(.semibold)
                        .disabled(!isValid || !hasChanges || !store.canWrite || save.isSaving)
                        .accessibilityIdentifier("saveHabit")
                }
            }
            .saveAlert(save)
            .protectDraft(isDirty: initialDraft.map { $0 != draft } ?? false, isSaving: save.isSaving, closeRequested: $closeRequested) { dismiss() }
        }
    }

    private func commit() {
        guard let parsed = numericTarget, isValid, hasChanges else { return }
        focusedField = nil
        let name = name, kind = kind, unit = unit
        let changedName = changedName, changedTarget = changedTarget
        save.performAsync {
            if let existing {
                try await store.edit(id: existing.id, name: changedName, target: changedTarget)
            } else {
                try await store.create(id: creationID, name: name, kind: kind, unit: unit, target: parsed)
            }
        } onSuccess: { dismiss() }
    }
}

struct EntryEditorView: View {
    let store: any HabitViewStore
    let habitID: UUID
    let day: DayKey
    let today: DayKey
    let loaded: HabitHistory?
    @Environment(\.dismiss) private var dismiss
    @State private var amount: String
    @State private var originalValue: Double
    @State private var save = SaveAction()
    @State private var initialAmount: String?
    @State private var closeRequested = false
    @FocusState private var editingAmount: Bool

    init(store: any HabitViewStore, habitID: UUID, day: DayKey, today: DayKey, loaded: HabitHistory? = nil) {
        self.store = store
        self.habitID = habitID
        self.day = day
        self.today = today
        self.loaded = loaded
        let value = (loaded ?? store.history(id: habitID))?.value(on: day) ?? 0
        _amount = State(initialValue: NumberText.editable(value))
        _originalValue = State(initialValue: value)
    }

    var body: some View {
        NavigationStack {
            Form {
                if let habit = loaded ?? store.history(id: habitID) {
                    Section {
                        TextField("Daily total", text: $amount)
                            .keyboardType(.decimalPad)
                            .focused($editingAmount)
                            .font(.title2.monospacedDigit())
                            .accessibilityIdentifier("dailyTotal")
                        EditorError(message: NumberText.parse(amount) == nil ? "Enter a daily total of zero or more." : nil)
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
            }.disabled(save.isSaving)
            .keyboardDoneButton(isEditing: editingAmount) { editingAmount = false }
            .onAppear { if initialAmount == nil { initialAmount = amount } }
            .navigationTitle("Daily total")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { closeRequested = true }.disabled(save.isSaving) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(save.isSaving ? "Saving…" : "Save") {
                        guard let value = NumberText.parse(amount), value != originalValue else { return }
                        editingAmount = false
                        save.performAsync { try await store.setValue(value, for: habitID, on: day) } onSuccess: { dismiss() }
                    }
                    .disabled(NumberText.parse(amount) == nil || NumberText.parse(amount) == originalValue || !store.canWrite || save.isSaving)
                    .accessibilityIdentifier("saveEntry")
                }
            }
            .saveAlert(save)
            .protectDraft(isDirty: initialAmount.map { $0 != amount } ?? false, isSaving: save.isSaving, closeRequested: $closeRequested) { dismiss() }
        }
    }
}
