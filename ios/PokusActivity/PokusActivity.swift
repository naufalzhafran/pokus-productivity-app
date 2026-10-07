import ActivityKit
import PokusCore
import SwiftUI
import WidgetKit

@main
struct PokusActivityBundle: WidgetBundle {
    var body: some Widget { PokusFocusActivity() }
}
struct PokusFocusActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusActivityAttributes.self) { context in
            HStack {
                Image(systemName: "timer").font(.title)
                VStack(alignment: .leading) {
                    Text(context.state.paused ? "Focus paused" : "Focus session").font(.headline)
                    Text("\(context.attributes.durationMinutes) minutes").font(.caption)
                }
                Spacer()
                Countdown(state: context.state)
                    .font(.title2.monospacedDigit())
                    .multilineTextAlignment(.trailing)
                    .frame(width: 96, alignment: .trailing)
            }
            .padding()
            .activityBackgroundTint(Color(uiColor: .secondarySystemBackground))
            .activitySystemActionForegroundColor(.accentColor)
            .foregroundStyle(.primary)
            .widgetURL(URL(string: "pokus://timer"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Label("Focus", systemImage: "timer") }
                DynamicIslandExpandedRegion(.trailing) { Text("\(context.attributes.durationMinutes) min") }
                DynamicIslandExpandedRegion(.bottom) {
                    Countdown(state: context.state)
                        .font(.title.monospacedDigit())
                        .frame(maxWidth: .infinity)
                }
            } compactLeading: {
                Image(systemName: context.state.paused ? "pause.fill" : "timer")
            } compactTrailing: {
                Countdown(state: context.state)
                    .monospacedDigit()
                    .multilineTextAlignment(.trailing)
                    .frame(width: 48, alignment: .trailing)
            } minimal: {
                Image(systemName: context.state.paused ? "pause.fill" : "timer")
            }
            .widgetURL(URL(string: "pokus://timer"))
            .keylineTint(.accentColor)
        }
    }
}
private struct Countdown: View {
    let state: FocusActivityAttributes.ContentState
    var body: some View {
        if state.paused {
            Text(String(format: "%02d:%02d", state.remainingSeconds / 60, state.remainingSeconds % 60))
        } else {
            Text(timerInterval: min(Date(), state.deadline)...state.deadline, countsDown: true)
        }
    }
}
