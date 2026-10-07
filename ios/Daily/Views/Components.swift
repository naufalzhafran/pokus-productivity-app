import DailyCore
import Observation
import SwiftUI

enum DailyTheme {
    static let accent = Color.accentColor
    static let background = Color(uiColor: .systemGroupedBackground)
    static let card = Color(uiColor: .secondarySystemGroupedBackground)

    static func heatColor(_ level: Int, dark: Bool) -> Color {
        let colors: [Color] = [Color(uiColor: .systemGray5), accent.opacity(dark ? 0.35 : 0.2),
                               accent.opacity(0.5), accent.opacity(0.75), accent]
        return colors[min(4, max(0, level))]
    }
}

struct Card<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(DailyTheme.card, in: RoundedRectangle(cornerRadius: 24))
    }
}

struct StreakCards: View {
    let streaks: Streaks
    var isOverall = false
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 16))
            : AnyLayout(HStackLayout(alignment: .top, spacing: 16))
        layout {
            stat(value: streaks.current, label: "Current streak")
            stat(value: streaks.longest, label: "Best streak")
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DailyTheme.card, in: RoundedRectangle(cornerRadius: 20))
    }

    private func stat(value: Int, label: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text(value.formatted()).font(.title2.weight(.semibold)).monospacedDigit()
                Text(value == 1 ? "day" : "days").font(.subheadline).foregroundStyle(.secondary)
            }
            Text(label).font(.subheadline).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(value) \(value == 1 ? "day" : "days")")
        .accessibilityHint(isOverall ? "A streak day includes at least one completed habit." : "A streak day meets this habit's target.")
    }
}

struct EmptyHabitsView: View {
    let canAdd: Bool
    let addHabit: () -> Void
    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                ContentUnavailableView {
                    Label("No habits yet", systemImage: "checkmark.circle")
                } description: {
                    Text("Add a habit you want to repeat each day. Check it off here and see your progress over time.")
                } actions: {
                    Button(action: addHabit) {
                        Label("Add habit", systemImage: "plus")
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .frame(minHeight: 44)
                    .disabled(!canAdd)
                    .accessibilityIdentifier("createFirstHabit")
                }
                .frame(minHeight: geometry.size.height)
            }
        }
    }
}

@MainActor
@Observable
final class SaveAction {
    var isShowingError = false
    var errorMessage = ""
    var isSaving = false
    @ObservationIgnored private var retry: (() -> Void)?

    func tryAgain() { retry?() }
    func performAsync(_ operation: @escaping () async throws -> Void, onSuccess: @escaping () -> Void = {}) {
        guard !isSaving else { return }
        isSaving = true
        Task {
            defer { isSaving = false }
            do { try await operation(); retry = nil; onSuccess() }
            catch {
                errorMessage = error.localizedDescription
                rememberRetry(operation, onSuccess: onSuccess)
                isShowingError = true
            }
        }
    }
    func cancel() { retry = nil }
    private func rememberRetry(_ operation: @escaping () async throws -> Void, onSuccess: @escaping () -> Void) {
        retry = { [weak self] in self?.performAsync(operation, onSuccess: onSuccess) }
    }
}

private struct SaveAlert: ViewModifier {
    @Bindable var action: SaveAction
    func body(content: Content) -> some View {
        content.alert("Couldn't save your change", isPresented: $action.isShowingError) {
            Button("Try again") { action.tryAgain() }
            Button("Cancel", role: .cancel) { action.cancel() }
        } message: {
            Text(action.errorMessage + " Try again to repeat this change.")
        }
    }
}

extension View {
    func saveAlert(_ action: SaveAction) -> some View { modifier(SaveAlert(action: action)) }
    func protectDraft(isDirty: Bool, isSaving: Bool, closeRequested: Binding<Bool>, onKeepEditing: @escaping () -> Void = {}, onDiscard: @escaping () -> Void) -> some View {
        modifier(DraftProtection(isDirty: isDirty, isSaving: isSaving, closeRequested: closeRequested, onKeepEditing: onKeepEditing, onDiscard: onDiscard))
    }
    /// Reserve a dismissal row above the keyboard so Done does not cover multiline text.
    func keyboardDoneButton(isEditing: Bool, _ done: @escaping () -> Void) -> some View {
        scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if isEditing {
                    HStack {
                        Spacer()
                        KeyboardDoneButton(action: done)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal)
                    .padding(.top, 8)
                    .padding(.bottom, 12)
                    .background(Color(uiColor: .systemBackground))
                }
            }
    }
    /// Wrapping title fields keep Return for moving on instead of inserting a line break.
    /// Pasted line breaks become spaces.
    func submitsOnReturn(_ text: Binding<String>, perform action: @escaping () -> Void) -> some View {
        onChange(of: text.wrappedValue) { old, new in
            let lineBreaks = { (value: String) in value.filter(\.isNewline).count }
            guard lineBreaks(new) > lineBreaks(old) else { return }
            if new.count == old.count + 1 {
                text.wrappedValue = old
                action()
            } else {
                text.wrappedValue = new.split(whereSeparator: \.isNewline).joined(separator: " ")
            }
        }
    }
    /// TextEditor has no prompt, so show one where and how a text field shows its own.
    func editorPrompt(_ prompt: String, isShowing: Bool) -> some View {
        overlay(alignment: .topLeading) {
            if isShowing {
                Text(prompt)
                    .foregroundStyle(Color(uiColor: .placeholderText))
                    .padding(.top, 8).padding(.leading, 5)
                    .allowsHitTesting(false).accessibilityHidden(true)
            }
        }
    }
}

private struct DraftProtection: ViewModifier {
    let isDirty: Bool
    let isSaving: Bool
    @Binding var closeRequested: Bool
    let onKeepEditing: () -> Void
    let onDiscard: () -> Void
    @State private var confirming = false
    func body(content: Content) -> some View {
        content
            .interactiveDismissDisabled(isDirty || isSaving)
            .onChange(of: closeRequested) { _, requested in
                guard requested else { return }
                closeRequested = false
                guard !isSaving else { return }
                if isDirty { confirming = true } else { onDiscard() }
            }
            .alert("Discard changes?", isPresented: $confirming) {
                Button("Keep editing", role: .cancel, action: onKeepEditing)
                Button("Discard changes", role: .destructive, action: onDiscard)
            } message: { Text("Your changes haven't been saved.") }
    }
}

private struct KeyboardDoneButton: View {
    let action: () -> Void
    var body: some View {
        let button = Button("Done", action: action)
            .fontWeight(.semibold)
            .controlSize(.large)
            .buttonBorderShape(.capsule)
            .frame(minWidth: 44, minHeight: 44)
            .accessibilityIdentifier("keyboardDone")
        if #available(iOS 26, *) {
            button.buttonStyle(.glass)
        } else {
            button.buttonStyle(.bordered).background(.bar, in: .capsule)
        }
    }
}

struct EditorError: View {
    let message: String?
    @AccessibilityFocusState private var focused: Bool
    var body: some View {
        if let message {
            Text(message).foregroundStyle(.red)
                .accessibilityFocused($focused)
                .onAppear { focused = true }
                .onChange(of: message) { _, _ in focused = true }
        }
    }
}
