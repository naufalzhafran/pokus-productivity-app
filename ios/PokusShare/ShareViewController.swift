import PokusCore
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Saves a shared link or text to the Pokus inbox. The app turns it into a capture the next
/// time it opens, through the same offline-first path as captures made in the app.
final class ShareViewController: UIViewController {
    private let state = ShareState()

    override func viewDidLoad() {
        super.viewDidLoad()
        let host = UIHostingController(rootView: ShareConfirmation(state: state) { [weak self] in self?.finish() })
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        host.didMove(toParent: self)
        Task { await save() }
    }

    private func save() async {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        var url: URL?, text = items.compactMap { $0.attributedContentText?.string }.first
        for provider in items.flatMap({ $0.attachments ?? [] }) {
            if url == nil, provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL
            } else if text == nil, provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String
            }
        }
        let value = SharedCapture.text(url: url.flatMap { LibraryRules.safeURL($0.absoluteString) }, text: text)
        do {
            guard !value.isEmpty else { state.result = .empty; return }
            guard let inbox = SharedCaptureInbox() else { state.result = .failed; return }
            try inbox.add(SharedCapture(text: value))
            state.result = .saved
            try? await Task.sleep(for: .seconds(1))
            finish()
        } catch { state.result = .failed }
    }

    private func finish() { extensionContext?.completeRequest(returningItems: nil) }
}

@MainActor @Observable
final class ShareState {
    enum Result { case saving, saved, empty, failed }
    var result = Result.saving
}

private struct ShareConfirmation: View {
    let state: ShareState
    let done: () -> Void
    var body: some View {
        VStack(spacing: 16) {
            switch state.result {
            case .saving: ProgressView("Saving to Pokus")
            case .saved:
                Label("Saved to Pokus", systemImage: "checkmark.circle.fill").font(.headline)
                Text("It appears in Captures when you open Pokus.").font(.subheadline).foregroundStyle(.secondary)
            case .empty:
                Label("Nothing to save", systemImage: "exclamationmark.circle").font(.headline)
                Text("Share a link or text to capture it.").font(.subheadline).foregroundStyle(.secondary)
            case .failed:
                Label("Couldn't save", systemImage: "exclamationmark.triangle").font(.headline)
                Text("Open Pokus and try again.").font(.subheadline).foregroundStyle(.secondary)
            }
            if state.result != .saving {
                Button("Done", action: done).buttonStyle(.borderedProminent).frame(minHeight: 44)
            }
        }
        .multilineTextAlignment(.center)
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(uiColor: .systemBackground))
        .accessibilityElement(children: .contain)
    }
}
