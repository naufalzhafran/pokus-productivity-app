import Charts
import DailyCore
import PokusCore
import SwiftUI

/// Timer settings chosen in Profile. The default length is the timer's own duration.
enum TimerPreferences {
    static let durationKey = "pokus.duration"
    static let soundKey = "pokus.completionSound"
    static let hapticKey = "pokus.completionHaptic"
    static var completionSound: Bool { UserDefaults.standard.object(forKey: soundKey) as? Bool ?? true }
    static var completionHaptic: Bool { UserDefaults.standard.object(forKey: hapticKey) as? Bool ?? true }
}

extension PokusModel {
    /// Reloads whenever records sync or the timer changes.
    var statisticsIdentity: String { "\(queryIdentity)-\(focus.timer.revision)" }
    func focusStatistics(today: DayKey = DayKey()) async throws -> FocusStatistics {
        let statistics = try await readAPI().focusStatistics(today: today, local: displayedHistory)
        if today == DayKey() { FocusWidgetSync.update(todaySeconds: statistics.today, session: session) }
        return statistics
    }
}

/// Today's focus time with a shortcut to the timer, at the top of Today.
struct FocusTodayCard: View {
    let model: PokusModel
    let today: DayKey
    let openTimer: () -> Void
    @State private var statistics = ReadState<FocusStatistics>()
    @Environment(\.dynamicTypeSize) private var typeSize
    private var running: Bool { model.hasRunningSession }

    var body: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
            : AnyLayout(HStackLayout(spacing: 12))
        layout {
            VStack(alignment: .leading, spacing: 4) {
                Text("Today's focus").font(.subheadline).foregroundStyle(.secondary)
                Group {
                    if let value = statistics.value { Text(FocusStatistics.duration(value.today)) }
                    else if statistics.error != nil { Text("—") }
                    else { Text("0m").redacted(reason: .placeholder) }
                }
                .font(.system(.title2, design: .rounded, weight: .semibold)).monospacedDigit()
                if let streak = statistics.value?.streak, streak > 1 {
                    Text("\(streak)-day streak").font(.caption).foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Today's focus")
            .accessibilityValue(accessibilityValue)
            Button(action: openTimer) {
                Label(running ? "Open timer" : "Start", systemImage: running ? "timer" : "play.fill")
                    .labelStyle(.titleAndIcon)
                    .lineLimit(1)
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .controlSize(.regular)
            .fixedSize()
            .accessibilityHint(running ? "A focus session is running." : "Opens the Focus tab.")
            .accessibilityIdentifier("todayStartFocus")
        }
        .padding(.vertical, 4)
        .accessibilityIdentifier("todayFocusCard")
        .task(id: "\(model.statisticsIdentity)-\(today)") {
            guard model.account != nil else { statistics.clear(); return }
            await statistics.load { try await model.focusStatistics(today: today) }
        }
    }
    private var accessibilityValue: String {
        guard let value = statistics.value else { return statistics.error == nil ? "Loading" : "Unavailable" }
        let total = FocusStatistics.duration(value.today)
        return value.streak > 1 ? "\(total), \(value.streak)-day streak" : total
    }
}

/// Today, this week, streak, and a seven-day chart, in Profile.
struct ProfileFocusStatistics: View {
    let model: PokusModel
    @State private var statistics = ReadState<FocusStatistics>()
    @State private var retry = 0
    @State private var today = DayKey()
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Group {
            if let value = statistics.value {
                let layout = typeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
                    : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
                layout {
                    stat("Today", FocusStatistics.duration(value.today))
                    stat("This week", FocusStatistics.duration(value.week))
                    stat("Streak", value.streak == 1 ? "1 day" : "\(value.streak) days")
                }
                .padding(.vertical, 4)
                chart(value.lastSevenDays)
            } else if let error = statistics.error {
                ReadError(message: error) { retry += 1 }
            } else {
                ProgressView("Loading focus statistics")
            }
        }
        .task(id: "\(model.statisticsIdentity)-\(retry)") {
            guard model.account != nil else { statistics.clear(); return }
            today = DayKey()
            let day = today
            await statistics.load { try await model.focusStatistics(today: day) }
        }
    }

    private func stat(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.subheadline).foregroundStyle(.secondary)
            Text(value).font(.system(.title3, design: .rounded, weight: .semibold)).monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func chart(_ days: [FocusDay]) -> some View {
        Chart(days) { day in
            BarMark(x: .value("Day", day.day.date, unit: .day), y: .value("Minutes", day.seconds / 60))
                .foregroundStyle(day.day == today ? Color.accentColor : Color.accentColor.opacity(0.45))
                .cornerRadius(4)
                .accessibilityLabel(day.day.date.formatted(Date.FormatStyle(timeZone: TimeZone(secondsFromGMT: 0)!).weekday(.wide)))
                .accessibilityValue("\(day.seconds / 60) minutes")
        }
        .chartXAxis {
            AxisMarks(values: days.map(\.day.date)) { _ in
                AxisValueLabel(format: Date.FormatStyle(timeZone: TimeZone(secondsFromGMT: 0)!).weekday(.narrow), centered: true)
            }
        }
        .chartYAxis { AxisMarks(position: .leading) }
        .chartYAxisLabel("Minutes")
        .frame(height: 160)
        .padding(.vertical, 4)
        .accessibilityLabel("Focus minutes, last 7 days")
        .accessibilityIdentifier("focusWeekChart")
    }
}

/// Default length, completion sound, and haptic for the timer.
struct TimerPreferencesSection: View {
    @AppStorage(TimerPreferences.durationKey) private var duration = 25
    @AppStorage(TimerPreferences.soundKey, store: .standard) private var sound = true
    @AppStorage(TimerPreferences.hapticKey, store: .standard) private var haptic = true

    var body: some View {
        Section {
            Stepper(value: $duration, in: FocusDuration.range, step: 5) {
                LabeledContent("Default length", value: "\(duration) min")
            }
            .accessibilityValue("\(duration) minutes")
            .accessibilityIdentifier("defaultDuration")
            Toggle("Completion sound", isOn: $sound).accessibilityIdentifier("completionSound")
            Toggle("Completion haptic", isOn: $haptic).accessibilityIdentifier("completionHaptic")
        } header: { Text("Timer") } footer: {
            Text("The sound plays with the completion notification. The haptic plays when a session finishes while Pokus is open.")
        }
    }
}
