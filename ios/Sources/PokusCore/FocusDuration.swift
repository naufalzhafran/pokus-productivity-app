import Foundation

/// Focus session lengths the timer offers: 1–60 minutes, dragged in 5-minute steps.
public enum FocusDuration {
    public static let range = 1...60
    public static let presets = [15, 25, 45, 60]
    public static let dragStep = 5

    public static func clamped(_ minutes: Int) -> Int { min(range.upperBound, max(range.lowerBound, minutes)) }

    /// The ring's drag position (0…60 minutes, fractional) rounded to the nearest 5 minutes, never below 5.
    public static func snapped(_ minutes: Double) -> Int {
        let steps = (minutes / Double(dragStep)).rounded()
        return min(range.upperBound, max(dragStep, Int(steps) * dragStep))
    }
}
