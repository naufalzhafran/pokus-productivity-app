import CoreText
import UIKit

/// UIKit chrome that SwiftUI can't style per view: navigation titles and the tab bar.
@MainActor
enum PokusAppearance {
    static func apply() {
        let textPrimary = UIColor(named: "textPrimary") ?? .label
        let navigationBar = UINavigationBar.appearance()
        // Large titles use the brand display face (`displayM`); inline titles stay in the system text face.
        navigationBar.largeTitleTextAttributes = [.font: displayFont(size: 28, weight: 700, textStyle: .largeTitle), .foregroundColor: textPrimary]
        navigationBar.titleTextAttributes = [.foregroundColor: textPrimary]
        UITabBar.appearance().unselectedItemTintColor = UIColor(named: "textSecondary")
    }

    /// Plus Jakarta Sans is a variable font, so the weight is set on its `wght` axis.
    private static func displayFont(size: CGFloat, weight: CGFloat, textStyle: UIFont.TextStyle) -> UIFont {
        let weightAxis = 0x7767_6874 // "wght"
        let descriptor = UIFontDescriptor(fontAttributes: [
            .family: "Plus Jakarta Sans",
            UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [weightAxis: weight],
        ])
        return UIFontMetrics(forTextStyle: textStyle).scaledFont(for: UIFont(descriptor: descriptor, size: size))
    }
}
