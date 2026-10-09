import DailyCore
import PokusCore
import SwiftUI
import WidgetKit

/// Today's focus total and a Start button, from the snapshot the app keeps in the App Group.
struct PokusTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PokusTodayFocus", provider: TodayFocusProvider()) { entry in
            TodayFocusView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Today's focus")
        .description("See today's focus time and start a session.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct TodayFocusEntry: TimelineEntry {
    let date: Date
    let todaySeconds: Int
    let deadline: Date?
    let paused: Bool
    let remainingSeconds: Int
}

struct TodayFocusProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayFocusEntry {
        TodayFocusEntry(date: .now, todaySeconds: 50 * 60, deadline: nil, paused: false, remainingSeconds: 0)
    }
    func getSnapshot(in context: Context, completion: @escaping (TodayFocusEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : entry(at: .now))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayFocusEntry>) -> Void) {
        let now = Date.now
        var entries = [entry(at: now)]
        // Flip back to Start when a session's deadline passes.
        if let deadline = entries[0].deadline, deadline > now { entries.append(entry(at: deadline.addingTimeInterval(1))) }
        let midnight = Calendar.autoupdatingCurrent.nextDate(after: now, matching: DateComponents(hour: 0), matchingPolicy: .nextTime)
            ?? now.addingTimeInterval(3600)
        completion(Timeline(entries: entries, policy: .after(midnight)))
    }
    private func entry(at date: Date) -> TodayFocusEntry {
        let snapshot = FocusWidgetSnapshot.read(from: PokusAppGroup.defaults)
        let running = snapshot?.isRunning(at: date) == true
        return TodayFocusEntry(date: date, todaySeconds: snapshot?.todaySeconds(on: DayKey(date: date)) ?? 0,
                               deadline: running ? snapshot?.deadline : nil, paused: running && snapshot?.paused == true,
                               remainingSeconds: snapshot?.remainingSeconds ?? 0)
    }
}

private struct TodayFocusView: View {
    let entry: TodayFocusEntry
    @Environment(\.widgetFamily) private var family
    private var running: Bool { entry.deadline != nil || entry.paused }

    var body: some View {
        let content = VStack(alignment: .leading, spacing: 6) {
            Label("Today", systemImage: "timer").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            Text(FocusStatistics.duration(entry.todaySeconds))
                .font(.system(.title, design: .rounded, weight: .semibold)).monospacedDigit()
                .minimumScaleFactor(0.6).lineLimit(1)
            Spacer(minLength: 0)
            status
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Today's focus, \(FocusStatistics.duration(entry.todaySeconds))")

        if family == .systemSmall {
            content.widgetURL(URL(string: running ? "pokus://timer" : "pokus://start"))
        } else {
            HStack(spacing: 16) {
                content
                Link(destination: URL(string: running ? "pokus://timer" : "pokus://start")!) {
                    Label(running ? "Open timer" : "Start", systemImage: running ? "timer" : "play.fill")
                        .font(.headline).padding(.horizontal, 16).frame(minHeight: 44)
                        .background(Color.accentColor, in: Capsule()).foregroundStyle(.white)
                }
            }
        }
    }

    @ViewBuilder private var status: some View {
        if entry.paused {
            Text("Paused · \(String(format: "%02d:%02d", entry.remainingSeconds / 60, entry.remainingSeconds % 60))")
                .font(.caption).foregroundStyle(.secondary)
        } else if let deadline = entry.deadline {
            HStack(spacing: 4) {
                Text("Focusing")
                Text(timerInterval: min(entry.date, deadline)...deadline, countsDown: true).monospacedDigit()
            }.font(.caption).foregroundStyle(.secondary)
        } else if family == .systemSmall {
            Label("Start focus", systemImage: "play.fill").font(.caption.weight(.semibold)).foregroundStyle(Color.accentColor)
        }
    }
}
