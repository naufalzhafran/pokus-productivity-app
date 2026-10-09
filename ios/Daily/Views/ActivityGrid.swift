import DailyCore
import PokusCore
import SwiftUI

struct ActivityGrid: View {
    let habits: [HabitHistory]
    let today: DayKey
    let individual: Bool
    let onSelect: (DayKey) -> Void
    var activity: HabitActivityYear? = nil
    var selectedYear: Int? = nil
    var onYearChange: ((Int) -> Void)? = nil
    var selectedMonth: DayKey? = nil
    var onMonthChange: ((DayKey) -> Void)? = nil
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.locale) private var locale
    @State private var month: HabitCalendarMonth

    init(habits: [HabitHistory], today: DayKey, individual: Bool = false, activity: HabitActivityYear? = nil,
         selectedYear: Int? = nil, onYearChange: ((Int) -> Void)? = nil,
         selectedMonth: DayKey? = nil, onMonthChange: ((DayKey) -> Void)? = nil,
         onSelect: @escaping (DayKey) -> Void) {
        self.habits = habits
        self.today = today
        self.individual = individual
        self.onSelect = onSelect
        self.activity = activity
        self.selectedYear = selectedYear
        self.onYearChange = onYearChange
        self.selectedMonth = selectedMonth
        self.onMonthChange = onMonthChange
        let initial = selectedMonth ?? DayKey(rawValue: String(format: "%04d-%02d-01", selectedYear ?? today.year, today.month)) ?? today
        _month = State(initialValue: HabitCalendarMonth(containing: initial))
    }

    private var firstDay: DayKey { activity?.earliest ?? habits.map(\.startDay).min() ?? today }
    private var year: Int { month.firstDay.year }
    private var monthTitle: String { String(year) }
    private var editableDays: [DayKey] { month.days.filter { $0 >= firstDay && $0 <= today } }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header.padding(.horizontal, 8)
            if typeSize.isAccessibilitySize {
                dateList
            } else {
                calendarBody
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DailyTheme.card, in: RoundedRectangle(cornerRadius: 20))
        .onChange(of: month) { old, next in
            onMonthChange?(next.firstDay)
            if old.firstDay.year != next.firstDay.year { onYearChange?(next.firstDay.year) }
        }
        .onChange(of: selectedMonth) { _, selected in
            if let selected { month = HabitCalendarMonth(containing: selected) }
        }
        .onChange(of: selectedYear) { _, selected in
            if let selected, selected != month.firstDay.year,
               let day = DayKey(rawValue: String(format: "%04d-%02d-01", selected, month.firstDay.month)) {
                month = HabitCalendarMonth(containing: day)
            }
        }
        .onChange(of: firstDay) { _, _ in clampMonth() }
        .onChange(of: today) { old, next in
            if month == HabitCalendarMonth(containing: old) { month = HabitCalendarMonth(containing: next) }
            clampMonth()
        }
    }

    private var dateList: some View {
        VStack(alignment: .leading, spacing: 12) {
            dateChooser.padding(.horizontal, 8)
            ForEach(editableDays) { day in
                Button { onSelect(day) } label: {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(day == today ? "Today, \(day.formatted())" : day.formatted())
                            .font(.body.weight(.medium))
                        Label(accessibleProgress(day), systemImage: fraction(on: day) >= 1 ? "checkmark.circle.fill" : "circle")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .padding(8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityAddTraits(.isButton)
                .accessibilityLabel(accessibleDate(day))
                .accessibilityValue(accessibleProgress(day))
                .accessibilityHint("Edit this day's entries")
                .accessibilityIdentifier("day-\(day.rawValue)")
                if day != editableDays.last { Divider().padding(.horizontal, 8) }
            }
        }
    }

    private var calendarBody: some View {
        VStack(alignment: .leading, spacing: 12) {
            calendar
            HStack(spacing: 16) {
                HStack(spacing: 5) {
                    RoundedRectangle(cornerRadius: 3).strokeBorder(.primary, lineWidth: 1.5)
                        .frame(width: 12, height: 12)
                    Text("Today")
                }
                Spacer(minLength: 0)
                legend
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 8)
            .accessibilityHidden(true)
            dateChooser.padding(.horizontal, 8)
        }
    }

    private var header: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout(spacing: 8))
        return layout {
            VStack(alignment: .leading, spacing: 4) {
                Text("Activity").font(.headline)
                Text(monthTitle).font(.subheadline).foregroundStyle(.secondary)
                    .accessibilityIdentifier("activityMonth")
            }
            if !typeSize.isAccessibilitySize { Spacer(minLength: 0) }
            HStack(spacing: 4) {
                yearButton("Previous year", symbol: "chevron.left", offset: -1)
                yearButton("Next year", symbol: "chevron.right", offset: 1)
            }
        }
    }

    private func yearButton(_ title: String, symbol: String, offset: Int) -> some View {
        let canMove = (firstDay.year...today.year).contains(year + offset)
        return Button {
            moveYear(to: year + offset)
        } label: {
            Image(systemName: symbol)
                .font(.body.weight(.medium))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(canMove ? DailyTheme.accent : Color.secondary.opacity(0.45))
        .disabled(!canMove)
        .accessibilityLabel(title)
    }

    private func moveYear(to target: Int) {
        guard (firstDay.year...today.year).contains(target),
              let january = DayKey(rawValue: String(format: "%04d-01-01", target)) else { return }
        month = HabitCalendarMonth(containing: january)
        clampMonth()
    }

    private static let cellSize: CGFloat = 16
    private static let cellSpacing: CGFloat = 3

    /// Weeks of the displayed year as columns of seven optional days, trimmed to the current week for the current year.
    private var weeks: [[DayKey?]] {
        guard let january = DayKey(rawValue: String(format: "%04d-01-01", year)) else { return [] }
        var days: [DayKey?] = Array(repeating: nil, count: january.weekdayIndex(firstWeekday: month.firstWeekday))
        var day = january
        while day.year == year, year < today.year || day <= today {
            days.append(day)
            day = day.adding(days: 1)
        }
        days += Array(repeating: nil, count: (7 - days.count % 7) % 7)
        return stride(from: 0, to: days.count, by: 7).map { Array(days[$0..<$0 + 7]) }
    }

    private var calendar: some View {
        let weeks = weeks
        let symbols = DayKey.weekdaySymbols(firstWeekday: month.firstWeekday)
        return HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: Self.cellSpacing) {
                Color.clear.frame(width: 1, height: 14)
                ForEach(0..<7, id: \.self) { row in
                    Text(row % 2 == 1 ? symbols[row] : "")
                        .font(.caption2).foregroundStyle(.secondary)
                        .fixedSize()
                        .frame(height: Self.cellSize, alignment: .center)
                }
            }
            .accessibilityHidden(true)
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: Self.cellSpacing) {
                        ForEach(Array(weeks.enumerated()), id: \.offset) { index, week in
                            VStack(spacing: Self.cellSpacing) {
                                Text(monthLabel(for: week, previous: index > 0 ? weeks[index - 1] : nil))
                                    .font(.caption2).foregroundStyle(.secondary)
                                    .fixedSize()
                                    .frame(width: Self.cellSize, height: 14, alignment: .leading)
                                    .accessibilityHidden(true)
                                ForEach(0..<7, id: \.self) { row in
                                    if let day = week[row] { cell(day) }
                                    else { Color.clear.frame(width: Self.cellSize, height: Self.cellSize).accessibilityHidden(true) }
                                }
                            }
                            .id(index)
                        }
                    }
                    .padding(.trailing, 2)
                }
                .onAppear { proxy.scrollTo(weeks.count - 1, anchor: .trailing) }
                .onChange(of: year) { _, _ in proxy.scrollTo(weeks.count - 1, anchor: .trailing) }
            }
        }
        .padding(.horizontal, 8)
    }

    private func monthLabel(for week: [DayKey?], previous: [DayKey?]?) -> String {
        guard let first = week.compactMap({ $0 }).first(where: { $0.rawValue.suffix(2) == "01" })
                ?? (previous == nil ? week.compactMap({ $0 }).first : nil) else { return "" }
        return first.formatted("MMM")
    }

    private func level(_ progress: Double) -> Double {
        switch progress {
        case ..<0.0001: 0
        case ..<0.34: 0.3
        case ..<0.67: 0.5
        case ..<1: 0.75
        default: 1
        }
    }

    private func heatColor(_ progress: Double) -> Color {
        let opacity = level(progress)
        return opacity == 0 ? Color.secondary.opacity(0.2) : DailyTheme.accent.opacity(opacity)
    }

    private var legend: some View {
        HStack(spacing: 4) {
            Text("Less")
            ForEach([0.0, 0.2, 0.5, 0.8, 1.0], id: \.self) { value in
                RoundedRectangle(cornerRadius: 3).fill(heatColor(value)).frame(width: 12, height: 12)
            }
            Text("More")
        }
    }

    private var dateChooser: some View {
        Button { onSelect(today) } label: {
            Label("Choose a date to edit", systemImage: "calendar")
                .font(.subheadline.weight(.medium))
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(DailyTheme.accent)
        .disabled(firstDay > today)
        .accessibilityIdentifier("chooseHistoryDate")
    }

    private func cell(_ day: DayKey) -> some View {
        let enabled = day >= firstDay && day <= today
        let progress = fraction(on: day)
        return Button { onSelect(day) } label: {
            RoundedRectangle(cornerRadius: 3)
                .fill(heatColor(enabled ? progress : 0))
                .frame(width: Self.cellSize, height: Self.cellSize)
                .overlay {
                    if day == today { RoundedRectangle(cornerRadius: 3).strokeBorder(Color.primary, lineWidth: 1.5) }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityHidden(!enabled)
        .accessibilityLabel(accessibleDate(day))
        .accessibilityValue(accessibleProgress(day))
        .accessibilityHint("Edit this day's entries")
        .accessibilityIdentifier("day-\(day.rawValue)")
    }

    private func fraction(on day: DayKey) -> Double {
        if individual { return habits.first?.fraction(on: day) ?? 0 }
        return (activity?.progress[day] ?? ProgressCalculator.progress(on: day, habits: habits)).fraction
    }

    private func accessibleDate(_ day: DayKey) -> String {
        "\(day == today ? "Today, " : "")\(day.formatted("EEEE, MMMM d, yyyy"))"
    }

    private func accessibleProgress(_ day: DayKey) -> String {
        if individual, let habit = habits.first {
            if habit.kind == .check { return habit.isComplete(on: day) ? "Complete" : "Not complete" }
            return "\(NumberText.display(habit.value(on: day))) of \(NumberText.display(habit.target(on: day))) \(habit.unit), \(habit.isComplete(on: day) ? "complete" : "not complete")"
        }
        let progress = activity?.progress[day] ?? ProgressCalculator.progress(on: day, habits: habits)
        return "\(progress.completed) of \(progress.total) habits completed"
    }

    private func clampMonth() {
        let earliest = HabitCalendarMonth(containing: firstDay)
        let latest = HabitCalendarMonth(containing: today)
        if month.firstDay < earliest.firstDay { month = earliest }
        if month.firstDay > latest.firstDay { month = latest }
    }
}
