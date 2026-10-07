import SwiftUI

struct FocusDurationDial<Content: View>: View {
    @Binding var minutes: Int
    var progress: Double?
    var spokenValue: String
    @ViewBuilder var content: Content
    @State private var previousAngle: Double?
    @State private var dragAngle = 0.0

    private var fraction: Double { min(1, max(0, progress ?? Double(minutes) / 60)) }

    @ViewBuilder
    var body: some View {
        if progress == nil {
            dial.accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: minutes = min(60, minutes + 1)
                case .decrement: minutes = max(1, minutes - 1)
                @unknown default: break
                }
            }
        } else {
            dial
        }
    }

    private var dial: some View {
        GeometryReader { geometry in
            let side = min(geometry.size.width, geometry.size.height)
            let inset = min(22, side * 0.09)
            let radius = max(0, side / 2 - inset)
            let angle = fraction * 2 * Double.pi - Double.pi / 2
            ZStack {
                Circle().stroke(Color(uiColor: .systemGray5), lineWidth: 10).padding(inset)
                Circle().trim(from: 0, to: fraction)
                    .stroke(Color.blue, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                    .rotationEffect(.degrees(-90)).padding(inset)
                content.padding(min(24, side * 0.1)).allowsHitTesting(false)
                if progress == nil {
                    Circle().fill(Color.blue).frame(width: 22, height: 22)
                        .overlay { Circle().stroke(Color(uiColor: .systemBackground), lineWidth: 3) }
                        .offset(x: radius * cos(angle), y: radius * sin(angle))
                        .allowsHitTesting(false)
                    Circle().stroke(.clear, lineWidth: 44)
                        .contentShape(Circle().stroke(lineWidth: 44))
                        .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .named("focusDial"))
                            .onChanged { updateDuration(at: $0.location, side: side) }
                            .onEnded { _ in previousAngle = nil })
                        .padding(inset)
                }
            }.coordinateSpace(name: "focusDial")
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(progress == nil ? "Focus duration" : "Focus timer")
        .accessibilityValue(progress == nil ? "\(minutes) minutes" : spokenValue)
        .accessibilityHint(progress == nil ? "Drag around the ring or swipe up and down to adjust minutes." : "")
        .accessibilityIdentifier(progress == nil ? "focusDurationDial" : "focusProgressDial")
    }

    private func updateDuration(at point: CGPoint, side: CGFloat) {
        let turn = 2 * Double.pi
        var angle = atan2(Double(point.y - side / 2), Double(point.x - side / 2)) + Double.pi / 2
        if angle < 0 { angle += turn }
        if let previousAngle {
            var change = angle - previousAngle
            if change > Double.pi { change -= turn }
            if change < -Double.pi { change += turn }
            dragAngle = min(turn, max(0, dragAngle + change))
        } else {
            // Use the closest turn so dragging across twelve o'clock stays at the limit.
            let current = Double(minutes) / 60 * turn
            let closest = [angle - turn, angle, angle + turn].min(by: { abs($0 - current) < abs($1 - current) }) ?? angle
            dragAngle = abs(closest - current) < Double.pi / 6 ? closest : angle
            dragAngle = min(turn, max(0, dragAngle))
        }
        previousAngle = angle
        minutes = min(60, max(1, Int((dragAngle / turn * 60).rounded())))
    }
}
