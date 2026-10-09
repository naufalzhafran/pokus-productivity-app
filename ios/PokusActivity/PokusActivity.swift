import ActivityKit
import AppIntents
import PokusCore
import SwiftUI
import WidgetKit

@main
struct PokusActivityBundle: WidgetBundle {
    var body: some Widget {
        PokusFocusActivity()
        if #available(iOSApplicationExtension 18.0, *) { PokusTimerControl() }
    }
}
struct PokusFocusActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusActivityAttributes.self) { context in
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center, spacing: 12) {
                    Image(systemName: "timer").font(.title2).foregroundStyle(Color.accentColor).accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.state.paused ? "Focus paused" : "Focusing").font(.headline)
                        Text(context.attributes.taskTitle ?? "\(context.attributes.durationMinutes)-minute session")
                            .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    Countdown(state: context.state)
                        .font(.title2.monospacedDigit())
                        .multilineTextAlignment(.trailing)
                        .frame(width: 96, alignment: .trailing)
                }
                FocusProgress(state: context.state, durationMinutes: context.attributes.durationMinutes)
                FocusControls(sessionID: context.attributes.sessionID, paused: context.state.paused)
            }
            .padding()
            .activityBackgroundTint(Color(uiColor: .secondarySystemBackground))
            .activitySystemActionForegroundColor(.accentColor)
            .foregroundStyle(.primary)
            .widgetURL(URL(string: "pokus://timer"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.state.paused ? "Paused" : "Focus", systemImage: context.state.paused ? "pause.fill" : "timer")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Countdown(state: context.state).monospacedDigit().multilineTextAlignment(.trailing).frame(width: 64, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.center) {
                    if let title = context.attributes.taskTitle { Text(title).font(.subheadline).lineLimit(1) }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        FocusProgress(state: context.state, durationMinutes: context.attributes.durationMinutes)
                        FocusControls(sessionID: context.attributes.sessionID, paused: context.state.paused)
                    }
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
/// Remaining time as a bar that keeps moving while the session runs.
private struct FocusProgress: View {
    let state: FocusActivityAttributes.ContentState
    let durationMinutes: Int
    var body: some View {
        let total = Double(max(1, durationMinutes) * 60)
        Group {
            if state.paused {
                ProgressView(value: Double(state.remainingSeconds), total: total)
            } else {
                let start = state.deadline.addingTimeInterval(-total)
                ProgressView(timerInterval: min(start, state.deadline)...state.deadline, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
            }
        }
        .progressViewStyle(.linear).tint(.accentColor)
        .accessibilityLabel("Time remaining")
    }
}
private struct FocusControls: View {
    let sessionID: String
    let paused: Bool
    var body: some View {
        HStack(spacing: 12) {
            Button(intent: ToggleFocusIntent(sessionID: sessionID)) {
                Label(paused ? "Resume" : "Pause", systemImage: paused ? "play.fill" : "pause.fill")
                    .frame(maxWidth: .infinity, minHeight: 36)
            }
            .buttonStyle(.borderedProminent).tint(.accentColor)
            Button(intent: StopFocusIntent(sessionID: sessionID)) {
                Label("Stop", systemImage: "stop.fill").frame(maxWidth: .infinity, minHeight: 36)
            }
            .buttonStyle(.bordered)
            .accessibilityHint("Ends the session and saves the elapsed time.")
        }
        .font(.subheadline.weight(.semibold))
    }
}

/// Control Center button that opens the focus timer.
@available(iOSApplicationExtension 18.0, *)
struct PokusTimerControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.centaurwarrunner.Daily.timerControl") {
            ControlWidgetButton(action: OpenFocusTimerIntent()) {
                Label("Focus timer", systemImage: "timer")
            }
        }
        .displayName("Focus timer")
        .description("Opens the Pokus focus timer.")
    }
}
