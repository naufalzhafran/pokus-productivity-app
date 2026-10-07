import PokusCore
import SwiftUI

/// How a capture reads in lists and on its detail page.
struct CaptureDisplay {
    let capture: Capture
    init(_ capture: Capture) { self.capture = capture }

    /// True when the capture has its own or a fetched title, rather than one borrowed from its text.
    var isNamed: Bool { !capture.title.isEmpty || !(capture.preview?.title ?? "").isEmpty }
    /// Untitled thoughts are their text; show it as the content instead of repeating it as a title.
    var leadsWithNote: Bool { !isNamed && !noteText.isEmpty }
    var noteText: String { WorkspaceRules.plainText(capture.note).trimmingCharacters(in: .whitespacesAndNewlines) }
    var description: String? { capture.preview?.description?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty }
    /// Untitled link posts read better by what they say than by their domain.
    var title: String {
        if !isNamed, noteText.isEmpty, let description { return description }
        return capture.label
    }
    var link: URL? { capture.url.flatMap(LibraryRules.safeURL) }
    var host: String? { link?.host().map { $0.hasPrefix("www.") ? String($0.dropFirst(4)) : $0 } }
    var source: String { capture.preview?.siteName?.nonEmpty ?? host ?? capture.kind.label }
    var byline: String? { capture.author?.nonEmpty ?? capture.preview?.author?.nonEmpty }
    var saved: String? { LibraryDates.saved(capture.created) }
    var imageURL: URL? { capture.preview?.image.flatMap(LibraryRules.safeURL).flatMap { $0.scheme == "https" ? $0 : nil } }
    /// Secondary text under a list title, when it adds something the title does not say.
    var summary: String? {
        guard isNamed else { return nil }
        if [.article, .social].contains(capture.kind), let description { return description }
        return noteText.nonEmpty
    }
    var details: [String] {
        [source, byline, saved.map { $0.prefix(1).uppercased() + $0.dropFirst() }].compactMap { $0 }
            .reduce(into: []) { if !$0.contains($1) && $1 != title { $0.append($1) } }
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}

extension CaptureKind {
    var tint: Color {
        switch self { case .note: .orange; case .article: .blue; case .social: .indigo; case .video: .red; case .drive: .green; case .book: .brown }
    }
}

extension CaptureStage {
    var symbol: String {
        switch self { case .all: "tray.2"; case .inbox: "tray"; case .inProgress: "circle.lefthalf.filled"; case .processed: "checkmark.circle.fill" }
    }
    var tint: Color {
        switch self { case .all: .secondary; case .inbox: .blue; case .inProgress: .orange; case .processed: .green }
    }
}

struct CaptureStageBadge: View {
    let stage: CaptureStage
    var body: some View {
        Label(stage.label, systemImage: stage.symbol)
            .font(.caption.weight(.semibold)).foregroundStyle(stage.tint)
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(stage.tint.opacity(0.14), in: Capsule())
    }
}

/// A square preview image, or the capture type's symbol while it loads or when there is none.
struct CaptureThumbnail: View {
    let capture: Capture
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        ZStack {
            shape.fill(capture.kind.tint.opacity(0.14))
            Image(systemName: capture.kind.icon).font(.title3).foregroundStyle(capture.kind.tint)
            if let url = CaptureDisplay(capture).imageURL {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill().overlay {
                            if capture.kind == .video { Image(systemName: "play.circle.fill").font(.title2).foregroundStyle(.white).shadow(radius: 2) }
                        }
                    }
                }
            }
        }
        .frame(width: 56, height: 56).clipShape(shape).accessibilityHidden(true)
    }
}

struct CaptureRow: View {
    let capture: Capture
    @Environment(\.dynamicTypeSize) private var typeSize
    /// Large text fits fewer words per line, so allow more lines before truncating.
    private var extraLines: Int { typeSize.isAccessibilitySize ? 3 : 0 }
    var body: some View {
        let display = CaptureDisplay(capture)
        HStack(alignment: .top, spacing: 12) {
            if !typeSize.isAccessibilitySize { CaptureThumbnail(capture: capture) }
            VStack(alignment: .leading, spacing: 4) {
                Text(CaptureRow.singleLine(display.title)).font(.headline).lineLimit((display.isNamed ? 2 : 3) + extraLines)
                if let summary = display.summary { Text(CaptureRow.singleLine(summary)).font(.subheadline).foregroundStyle(.secondary).lineLimit(2 + extraLines) }
                HStack(spacing: 6) {
                    if capture.isProcessed { Image(systemName: CaptureStage.processed.symbol).foregroundStyle(CaptureStage.processed.tint) }
                    Text(display.details.joined(separator: " · ")).lineLimit(1)
                }.font(.caption).foregroundStyle(.secondary).padding(.top, 2)
            }
        }.padding(.vertical, 4)
    }
    static func singleLine(_ text: String) -> String { text.split(whereSeparator: \.isNewline).joined(separator: " ") }
    /// Spoken after the title so VoiceOver users hear the same context sighted users scan.
    static func accessibilityValue(_ capture: Capture) -> String {
        ([capture.kind.label] + CaptureDisplay(capture).details + (capture.isProcessed ? [CaptureStage.processed.label] : [])).joined(separator: ", ")
    }
}

/// The detail page's banner. A failed image keeps its space and shows the capture type instead of collapsing the card.
struct CaptureHeroImage: View {
    let capture: Capture
    let url: URL
    var body: some View {
        Color(uiColor: .tertiarySystemFill).aspectRatio(capture.kind == .video ? 16 / 9 : 1.91, contentMode: .fit)
            .overlay {
                AsyncImage(url: url) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() }
                    else if phase.error != nil { Image(systemName: capture.kind.icon).font(.largeTitle).foregroundStyle(capture.kind.tint) }
                }
            }
            .clipped().accessibilityHidden(true)
    }
}

/// The detail page's opening card: stage, title, source, and the two next steps.
struct CaptureHeader: View {
    let capture: Capture
    let stage: CaptureStage?
    let canEdit: Bool
    let toggleProcessed: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        let display = CaptureDisplay(capture)
        VStack(alignment: .leading, spacing: 12) {
            let status = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(alignment: .center))
            status {
                if let stage { CaptureStageBadge(stage: stage) }
                if !typeSize.isAccessibilitySize { Spacer(minLength: 8) }
                if let saved = display.saved { Text("Saved \(saved)").font(.caption).foregroundStyle(.secondary) }
            }
            if display.leadsWithNote { RichDescription(html: capture.note) }
            else { Text(display.title).font(display.isNamed ? .title2.weight(.semibold) : .title3).textSelection(.enabled) }
            Label {
                Text(([display.source] + [display.byline].compactMap { $0 }).joined(separator: " · "))
            } icon: { Image(systemName: capture.kind.icon).foregroundStyle(capture.kind.tint) }
                .font(.subheadline).foregroundStyle(.secondary)
            if display.isNamed, let description = display.description { Text(description).foregroundStyle(.secondary).textSelection(.enabled) }
            VStack(spacing: 10) {
                if let link = display.link {
                    Link(destination: link) { Label("Open original", systemImage: "safari").frame(maxWidth: .infinity, minHeight: 32) }
                        .buttonStyle(.borderedProminent).accessibilityHint(display.host ?? "")
                }
                Button(action: toggleProcessed) {
                    Label(capture.isProcessed ? "Mark unprocessed" : "Mark processed",
                          systemImage: capture.isProcessed ? "arrow.uturn.backward.circle" : "checkmark.circle").frame(maxWidth: .infinity, minHeight: 32)
                }.buttonStyle(.bordered).tint(capture.isProcessed ? nil : CaptureStage.processed.tint).disabled(!canEdit)
            }.padding(.top, 4)
        }.padding(.vertical, 8)
    }
}
