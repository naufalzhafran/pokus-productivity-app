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
    private var monthTitle: String {
        let format = Date.FormatStyle(locale: locale, calendar: Calendar(identifier: .gregorian),
            timeZone: TimeZone(secondsFromGMT: 0)!).month(.wide).year()
        return month.firstDay.date.formatted(format)
    }
    private var editableDays: [DayKey] { month.days.filter { $0 >= firstDay && $0 <= today } }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header.padding(.horizontal, 8)
            if typeSize.isAccessibilitySize {
                dateList
            } else {
                ViewThatFits(in: .horizontal) {
                    calendarBody.frame(minWidth: 308)
                    dateList
                }
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
                Label("Complete", systemImage: "checkmark")
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
                monthButton("Previous month", symbol: "chevron.left", offset: -1)
                monthButton("Next month", symbol: "chevron.right", offset: 1)
            }
        }
    }

    private func monthButton(_ title: String, symbol: String, offset: Int) -> some View {
        let canMove = month.canMove(by: offset, earliest: firstDay, latest: today)
        return Button {
            if let next = month.adding(months: offset) { month = next }
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

    private var calendar: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(minimum: 44), spacing: 0), count: 7), spacing: 4) {
            ForEach(Array(["M", "T", "W", "T", "F", "S", "S"].enumerated()), id: \.offset) { _, label in
                Text(label).font(.caption).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .accessibilityHidden(true)
            }
            ForEach(Array(month.grid.enumerated()), id: \.offset) { _, day in
                if let day { cell(day) }
                else { Color.clear.frame(minHeight: 48).accessibilityHidden(true) }
            }
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
            VStack(spacing: 3) {
                Text(String(Int(day.rawValue.suffix(2))!))
                    .font(.subheadline.weight(day == today ? .bold : .medium))
                    .monospacedDigit()
                ZStack {
                    if progress >= 1 {
                        Image(systemName: "checkmark").font(.system(size: 10, weight: .bold))
                    } else if progress > 0 {
                        ProgressView(value: progress).tint(.primary).frame(width: 20)
                    }
                }.frame(height: 10)
            }
            .foregroundStyle(enabled ? Color.primary : Color.secondary)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(progress >= 1 && enabled ? DailyTheme.accent.opacity(0.16) : Color.clear, in: RoundedRectangle(cornerRadius: 10))
            .overlay {
                if day == today { RoundedRectangle(cornerRadius: 10).strokeBorder(Color.primary, lineWidth: 1.5) }
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
