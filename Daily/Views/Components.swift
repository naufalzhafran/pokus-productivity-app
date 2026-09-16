import DailyCore
import Observation
import SwiftUI

enum DailyTheme {
    static let green = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.43, green: 0.85, blue: 0.51, alpha: 1)
            : UIColor(red: 0.16, green: 0.50, blue: 0.30, alpha: 1)
    })
    static let background = Color(uiColor: .systemGroupedBackground)
    static let card = Color(uiColor: .secondarySystemGroupedBackground)

    static func heatColor(_ level: Int, dark: Bool) -> Color {
        let light: [Color] = [Color(uiColor: .systemGray5), Color(red: 0.80, green: 0.91, blue: 0.80),
                              Color(red: 0.50, green: 0.76, blue: 0.50), Color(red: 0.28, green: 0.62, blue: 0.36), green]
        let night: [Color] = [Color(uiColor: .systemGray5), Color(red: 0.13, green: 0.27, blue: 0.19),
                              Color(red: 0.17, green: 0.43, blue: 0.26), Color(red: 0.25, green: 0.64, blue: 0.36),
                              Color(red: 0.43, green: 0.85, blue: 0.51)]
        return (dark ? night : light)[min(4, max(0, level))]
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

struct SectionCaption: View {
    let title: String
    var trailing: String = ""
    var body: some View {
        HStack {
            Text(title.uppercased()).tracking(1.7)
            Spacer()
            Text(trailing)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
        .padding(.horizontal, 4)
    }
}

struct StreakCards: View {
    let streaks: Streaks
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 12)) : AnyLayout(HStackLayout(spacing: 12))
        layout {
            stat(value: streaks.current, label: "Current streak", icon: "flame", suffix: "days")
            stat(value: streaks.longest, label: "Best streak", icon: "trophy", suffix: "days")
        }
    }

    private func stat(value: Int, label: String, icon: String, suffix: String) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Label(label, systemImage: icon)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text(value.formatted()).font(.system(.largeTitle, design: .rounded, weight: .semibold)).contentTransition(.numericText())
                    Text(value == 1 ? "day" : suffix).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(value) \(value == 1 ? "day" : "days")")
    }
}

struct EmptyHabitsView: View {
    let addHabit: () -> Void
    var body: some View {
        Card {
            VStack(spacing: 18) {
                Image(systemName: "leaf")
                    .font(.system(size: 34, weight: .light))
                    .foregroundStyle(DailyTheme.green)
                    .frame(width: 76, height: 76)
                    .background(DailyTheme.green.opacity(0.08), in: RoundedRectangle(cornerRadius: 24))
                Text("A little, every day.")
                    .font(.title2.weight(.semibold))
                Text("Start with one small habit.\nYour progress will grow from here.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button(action: addHabit) {
                    Label("Create your first habit", systemImage: "plus")
                        .frame(minHeight: 32)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .accessibilityIdentifier("createFirstHabit")
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 26)
        }
    }
}

@MainActor
@Observable
final class SaveAction {
    var isShowingError = false
    var errorMessage = ""
    @ObservationIgnored private var retry: (() -> Void)?

    func perform(_ operation: @escaping () throws -> Void, onSuccess: @escaping () -> Void = {}) {
        do {
            try operation()
            retry = nil
            onSuccess()
        } catch {
            errorMessage = error.localizedDescription
            retry = { [weak self] in self?.perform(operation, onSuccess: onSuccess) }
            isShowingError = true
        }
    }

    func tryAgain() { retry?() }
    func cancel() { retry = nil }
}

private struct SaveAlert: ViewModifier {
    @Bindable var action: SaveAction
    func body(content: Content) -> some View {
        content.alert("Couldn't save your change", isPresented: $action.isShowingError) {
            Button("Try again") { action.tryAgain() }
            Button("Cancel", role: .cancel) { action.cancel() }
        } message: {
            Text(action.errorMessage + " Your input is still here.")
        }
    }
}

extension View {
    func saveAlert(_ action: SaveAction) -> some View { modifier(SaveAlert(action: action)) }
}
