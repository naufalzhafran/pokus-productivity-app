//  PokusTheme.swift
//  Pokus brand tokens for SwiftUI. Mirrors tokens/tokens.json.
//
//  Setup:
//  1. Drag `PokusColors.xcassets` into the Xcode project (semantic colors, auto light/dark).
//  2. Add fonts/Unbounded.ttf to the target and list it under `UIAppFonts` in Info.plist.
//  3. Use `Color.pk.primary`, `Font.pk.timer`, `PKSpace.m`, `PKRadius.lg` etc.

import SwiftUI

// MARK: - Colors

extension Color {
    enum pk {
        // Semantic (from PokusColors.xcassets — adapt to light/dark automatically)
        static let background     = Color("background")
        static let surface        = Color("surface")
        static let surfaceRaised  = Color("surfaceRaised")
        static let surfaceSunken  = Color("surfaceSunken")
        static let border         = Color("border")
        static let textPrimary    = Color("textPrimary")
        static let textSecondary  = Color("textSecondary")
        static let primary        = Color("primary")
        static let primaryPressed = Color("primaryPressed")
        static let onPrimary      = Color("onPrimary")
        static let accent         = Color("accent")
        static let onAccent       = Color("onAccent")
        static let focusRing      = Color("focusRing")
        static let sessionFocus   = Color("sessionFocus")
        static let sessionBreak   = Color("sessionBreak")
        static let sessionPaused  = Color("sessionPaused")
        static let success        = Color("success")
        static let warning        = Color("warning")
        static let danger         = Color("danger")

        // Fixed brand colors (do not adapt)
        static let night  = Color(hex: 0x14143C)
        static let indigo = Color(hex: 0x4B3BFF)
        static let lime   = Color(hex: 0xD7FF3E)
        static let paper  = Color(hex: 0xF1F0FF)
    }

    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: opacity)
    }
}

// MARK: - Typography
// Display = Unbounded (bundled). Text = SF Pro (system) so Dynamic Type works natively.

extension Font {
    enum pk {
        private static func display(_ size: CGFloat, _ weight: Font.Weight, relativeTo style: Font.TextStyle) -> Font {
            .custom("Unbounded", size: size, relativeTo: style).weight(weight)
        }
        static let timer     = display(72, .medium, relativeTo: .largeTitle).monospacedDigit()
        static let displayL  = display(40, .bold, relativeTo: .largeTitle)
        static let displayM  = display(28, .bold, relativeTo: .title)
        static let displayS  = display(22, .semibold, relativeTo: .title2)
        static let title     = Font.system(size: 20, weight: .bold)
        static let headline  = Font.headline                         // 17 semibold
        static let body      = Font.system(.body, weight: .medium)   // 17 on iOS
        static let bodySmall = Font.system(.subheadline, weight: .medium)
        static let label     = Font.system(.footnote, weight: .bold)
        static let caption   = Font.system(.caption, weight: .semibold)
    }
}

// MARK: - Spacing (4pt grid), radius, motion

enum PKSpace {
    static let xxs: CGFloat = 4
    static let xs:  CGFloat = 8
    static let s:   CGFloat = 12
    static let m:   CGFloat = 16
    static let l:   CGFloat = 24
    static let xl:  CGFloat = 32
    static let xxl: CGFloat = 48
}

enum PKRadius {
    static let xs: CGFloat = 6
    static let sm: CGFloat = 10
    static let md: CGFloat = 14
    static let lg: CGFloat = 20
    static let xl: CGFloat = 28
}

enum PKMotion {
    static let fast     = Animation.easeOut(duration: 0.15)
    static let standard = Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.25)
    static let spring   = Animation.spring(response: 0.35, dampingFraction: 0.8)
}

// MARK: - Session state

enum PokusSessionState {
    case focus, shortBreak, longBreak, paused

    var tint: Color {
        switch self {
        case .focus: return .pk.sessionFocus
        case .shortBreak, .longBreak: return .pk.sessionBreak
        case .paused: return .pk.sessionPaused
        }
    }
    /// Foreground for text/icons sitting ON `tint`.
    var onTint: Color {
        switch self {
        case .focus: return .pk.onPrimary
        case .shortBreak, .longBreak: return .pk.night
        case .paused: return .pk.night
        }
    }
}

// MARK: - Primary button

struct PKPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.pk.headline)
            .foregroundStyle(Color.pk.onPrimary)
            .frame(minHeight: 50)
            .padding(.horizontal, PKSpace.l)
            .background(configuration.isPressed ? Color.pk.primaryPressed : Color.pk.primary,
                        in: RoundedRectangle(cornerRadius: PKRadius.md, style: .continuous))
            .animation(PKMotion.fast, value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == PKPrimaryButtonStyle {
    static var pkPrimary: PKPrimaryButtonStyle { .init() }
}
