import DailyCore
import SwiftUI

struct TodayHabitRow: View {
    let habit: HabitHistory
    let day: DayKey
    let toggle: () -> Void
    let increment: () -> Void
    let edit: () -> Void
    let showHistory: () -> Void
    let canEdit: Bool
    @Environment(\.dynamicTypeSize) private var typeSize

    private var isComplete: Bool { habit.isComplete(on: day) }
    private var total: String {
        "\(NumberText.display(habit.value(on: day))) of \(NumberText.display(habit.target(on: day)))\(habit.unit.isEmpty ? "" : " \(habit.unit)")"
    }

    var body: some View {
        Group {
            if habit.kind == .check {
                Button(action: toggle) {
                    HStack(spacing: 16) {
                        VStack(alignment: .leading, spacing: 5) {
                            name
                            Text(isComplete ? "Completed" : "Tap to complete")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: isComplete ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 28, weight: .regular))
                            .foregroundStyle(isComplete ? DailyTheme.accent : Color.secondary)
                            .frame(width: 48, height: 48)
                    }
                    .frame(minHeight: 60)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Mark \(habit.name) \(isComplete ? "incomplete" : "complete")")
                .accessibilityValue(isComplete ? "Completed" : "Not completed")
                .accessibilityIdentifier("check-\(habit.name)")
                .disabled(!canEdit)
            } else {
                let layout = typeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
                    : AnyLayout(HStackLayout(spacing: 20))
                layout {
                    Button(action: edit) {
                        VStack(alignment: .leading, spacing: 7) {
                            name
                            Text(total)
                                .font(.subheadline)
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                            ProgressView(value: habit.fraction(on: day))
                                .tint(DailyTheme.accent)
                                .padding(.top, 3)
                                .accessibilityHidden(true)
                        }
                        .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Edit \(habit.name) total")
                    .accessibilityValue(total)
                    .accessibilityHint("Enter the amount you have completed today.")
                    .accessibilityIdentifier("entry-\(habit.name)")
                    .disabled(!canEdit)

                    Button(action: increment) {
                        Text("+1")
                            .font(.headline)
                            .foregroundStyle(.primary)
                            .frame(minWidth: 52, minHeight: 48)
                            .padding(.horizontal, 2)
                            .background(Color(uiColor: .tertiarySystemFill), in: RoundedRectangle(cornerRadius: 14))
                            .contentShape(RoundedRectangle(cornerRadius: 14))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Add one to \(habit.name)")
                    .disabled(!canEdit)
                }
            }
        }
        .padding(.vertical, 10)
        .contextMenu {
            Button("View history", systemImage: "chart.bar", action: showHistory)
        }
        .accessibilityAction(named: "View history", showHistory)
    }

    private var name: some View {
        Text(habit.name)
            .font(.body.weight(.semibold))
            .foregroundStyle(.primary)
            .fixedSize(horizontal: false, vertical: true)
    }
}
