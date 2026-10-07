import DailyCore
import SwiftUI

struct ActivityGrid: View {
    let habits: [HabitHistory]
    let today: DayKey
    let individual: Bool
    let onSelect: (DayKey) -> Void
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var year: Int
    private let cellSize: CGFloat = 16
    private let cellGap: CGFloat = 4

    init(habits: [HabitHistory], today: DayKey, individual: Bool = false, onSelect: @escaping (DayKey) -> Void) {
        self.habits = habits
        self.today = today
        self.individual = individual
        self.onSelect = onSelect
        _year = State(initialValue: today.year)
    }

    private var firstDay: DayKey { habits.map(\.startDay).min() ?? today }
    private var weeks: [[DayKey]] { DayKey.yearGrid(year) }
    private var dark: Bool { colorScheme == .dark }

    var body: some View {
        let headerLayout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout())
        Card {
            VStack(alignment: .leading, spacing: 18) {
                headerLayout {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Activity").font(.headline)
                        Text("One square, one day.").font(.caption).foregroundStyle(.secondary)
                    }
                    if !typeSize.isAccessibilitySize { Spacer() }
                    HStack(spacing: 0) {
                        Button {
                            year -= 1
                        } label: {
                            Image(systemName: "chevron.left").font(.caption.weight(.semibold)).frame(width: 44, height: 44)
                        }
                        .disabled(year <= firstDay.year)
                        .accessibilityLabel("Previous year")
                        Text(String(year)).font(.subheadline.monospacedDigit()).accessibilityIdentifier("activityYear")
                        Button {
                            year += 1
                        } label: {
                            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).frame(width: 44, height: 44)
                        }
                        .disabled(year >= today.year)
                        .accessibilityLabel("Next year")
                    }
                    .foregroundStyle(.primary)
                }

                HStack(alignment: .top, spacing: 8) {
                    VStack(spacing: cellGap) {
                        Color.clear.frame(height: 18)
                        ForEach(0..<7) { row in
                            Text(["M", "", "W", "", "F", "", "S"][row])
                                .font(.system(size: 9))
                                .foregroundStyle(.secondary)
                                .frame(width: 10, height: cellSize)
                        }
                    }
                    .frame(width: 12)
                    .accessibilityHidden(true)

                    ScrollViewReader { proxy in
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(alignment: .top, spacing: cellGap) {
                                ForEach(weeks.indices, id: \.self) { index in
                                    let week = weeks[index]
                                    VStack(spacing: cellGap) {
                                        Text(monthLabel(week))
                                            .font(.system(size: 10))
                                            .foregroundStyle(.secondary)
                                            .fixedSize()
                                            .frame(width: cellSize, height: 18, alignment: .leading)
                                            .accessibilityHidden(true)
                                        ForEach(week) { day in
                                            cell(day)
                                        }
                                    }
                                    .id(week[0].rawValue)
                                }
                            }
                            .padding(.trailing, 10)
                        }
                        .onAppear { scrollToLatest(proxy) }
                        .onChange(of: year) { _, _ in scrollToLatest(proxy) }
                        .onChange(of: today) { old, new in
                            if old.year != new.year { year = new.year }
                            scrollToLatest(proxy)
                        }
                    }
                }

                HStack(spacing: 4) {
                    Text("Less").padding(.trailing, 3)
                    ForEach(0..<5) { level in
                        RoundedRectangle(cornerRadius: 3)
                            .fill(DailyTheme.heatColor(level, dark: dark))
                            .frame(width: 12, height: 12)
                    }
                    Text("More").padding(.leading, 3)
                    Spacer()
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(individual ? "Darker green means closer to your daily target." : "Darker green means a greater share of habits completed.")

                Button {
                    onSelect(today)
                } label: {
                    Label("Choose a date to edit", systemImage: "calendar")
                        .font(.subheadline)
                        .frame(minHeight: 44)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .disabled(firstDay > today)
                .accessibilityIdentifier("chooseHistoryDate")
            }
        }
        .onChange(of: habits.map(\.startDay).min()) { _, _ in
            year = min(today.year, max(year, firstDay.year))
        }
    }

    @ViewBuilder
    private func cell(_ day: DayKey) -> some View {
        let isInYear = day.year == year
        let enabled = isInYear && day >= firstDay && day <= today
        let fraction = individual ? (habits.first?.fraction(on: day) ?? 0) : ProgressCalculator.progress(on: day, habits: habits).fraction
        Button {
            onSelect(day)
        } label: {
            RoundedRectangle(cornerRadius: 3)
                .fill(DailyTheme.heatColor(ProgressCalculator.intensity(for: fraction), dark: dark))
                .opacity(enabled ? 1 : 0.3)
                .overlay {
                    if day == today {
                        RoundedRectangle(cornerRadius: 3).strokeBorder(Color.primary.opacity(0.7), lineWidth: 1)
                    }
                }
                .frame(width: cellSize, height: cellSize)
                .opacity(isInYear ? 1 : 0)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .allowsHitTesting(enabled)
        .accessibilityHidden(!enabled)
        .accessibilityLabel(day.formatted("EEEE, MMMM d, yyyy"))
        .accessibilityValue(accessibleProgress(day))
        .accessibilityHint("Edit this day's entries")
        .accessibilityIdentifier("day-\(day.rawValue)")
    }

    private func accessibleProgress(_ day: DayKey) -> String {
        if individual, let habit = habits.first {
            if habit.kind == .check { return habit.isComplete(on: day) ? "Complete" : "Not complete" }
            return "\(NumberText.display(habit.value(on: day))) of \(NumberText.display(habit.target(on: day))) \(habit.unit), \(habit.isComplete(on: day) ? "complete" : "not complete")"
        }
        let progress = ProgressCalculator.progress(on: day, habits: habits)
        return "\(progress.completed) of \(progress.total) habits completed"
    }

    private func monthLabel(_ week: [DayKey]) -> String {
        week.first(where: { $0.year == year && $0.rawValue.hasSuffix("-01") })?.formatted("MMM") ?? ""
    }

    private func scrollToLatest(_ proxy: ScrollViewProxy) {
        let target = year == today.year ? weeks.first(where: { $0.contains(today) }) : weeks.last
        if let first = target?.first {
            proxy.scrollTo(first.rawValue, anchor: .trailing)
        }
    }
}
