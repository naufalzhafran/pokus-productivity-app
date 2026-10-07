import SwiftUI

struct GoogleSignInButton: View {
    let isConnecting: Bool
    var isEnabled = true
    let action: () -> Void
    @Environment(\.colorScheme) private var colorScheme
    @ScaledMetric(relativeTo: .body) private var labelSize = 17

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image("GoogleLogo")
                    .renderingMode(.original)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 20, height: 20)
                    .accessibilityHidden(true)
                Text(isConnecting ? "Connecting…" : "Continue with Google")
                    .font(.system(size: labelSize, weight: .medium))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                if isConnecting {
                    ProgressView().controlSize(.small).accessibilityHidden(true)
                }
            }
            .foregroundStyle(colorScheme == .dark ? Color(red: 0.89, green: 0.89, blue: 0.89) : Color(red: 0.12, green: 0.12, blue: 0.12))
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(colorScheme == .dark ? Color(red: 0.075, green: 0.075, blue: 0.08) : .white,
                        in: RoundedRectangle(cornerRadius: 12))
            .overlay {
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(colorScheme == .dark ? Color(red: 0.56, green: 0.57, blue: 0.56) : Color(red: 0.45, green: 0.47, blue: 0.46), lineWidth: 1)
            }
            .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .disabled(isConnecting || !isEnabled)
        .opacity(isEnabled || isConnecting ? 1 : 0.5)
        .accessibilityHint(isEnabled ? "" : "Connect to the internet to sign in.")
        .accessibilityIdentifier("googleSignIn")
    }
}
