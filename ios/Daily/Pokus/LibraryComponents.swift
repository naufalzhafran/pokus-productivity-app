import PokusCore
import SwiftUI

enum LibraryRoute: Hashable {
    case habits, calendar
    case captures, notes, projects, review, unassigned, categories
    case capture(String), note(String), project(String), task(String)
}

struct LibraryFilterSheet<Content: View>: View {
    let title: String
    let reset: () -> Void
    @ViewBuilder var content: Content
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form { content; Button("Reset filters", action: reset).frame(minHeight: 44) }
                .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

struct LibraryFilterSummary: View {
    let text: String
    let active: Bool
    let reset: () -> Void
    var body: some View {
        HStack(spacing: 12) {
            Label(text, systemImage: "line.3.horizontal.decrease.circle.fill")
                .font(.subheadline.weight(.medium)).foregroundStyle(Color.accentColor)
                .frame(maxWidth: .infinity, alignment: .leading)
            if active {
                Button("Reset", action: reset)
                    .font(.subheadline).buttonStyle(.borderless)
                    .frame(minHeight: 44)
                    .accessibilityLabel("Reset filters")
            }
        }
    }
}

struct LibrarySaveNotice: View {
    let message: String?
    var body: some View {
        if let message {
            Label(message, systemImage: "checkmark.circle").font(.subheadline).foregroundStyle(.secondary)
                .accessibilityIdentifier("librarySaveConfirmation")
        }
    }
}

enum LibraryDates {
    static func due(_ key: String, completed: Bool = false) -> String {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return key }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .autoupdatingCurrent
        guard let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12)) else { return key }
        let formatted = date.formatted(date: .abbreviated, time: .omitted)
        if completed { return formatted }
        return key < WorkspaceRules.dayKey() ? "Overdue · \(formatted)" : key == WorkspaceRules.dayKey() ? "Due today" : "Due \(formatted)"
    }
    static func review(_ timestamp: Double) -> String {
        Date(timeIntervalSince1970: timestamp / 1000).formatted(date: .abbreviated, time: .omitted)
    }
    /// A short local date for a PocketBase timestamp such as `2026-10-04 09:00:00.000Z`.
    static func saved(_ timestamp: String, now: Date = .now) -> String? {
        let value = timestamp.replacingOccurrences(of: " ", with: "T")
        guard let date = (try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(value))
                ?? (try? Date.ISO8601FormatStyle().parse(value))
                ?? (try? Date.ISO8601FormatStyle().year().month().day().parse(String(value.prefix(10)))) else { return nil }
        let calendar = Calendar.autoupdatingCurrent
        if calendar.isDate(date, inSameDayAs: now) { return "today" }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now), calendar.isDate(date, inSameDayAs: yesterday) { return "yesterday" }
        return calendar.isDate(date, equalTo: now, toGranularity: .year)
            ? date.formatted(.dateTime.month(.abbreviated).day()) : date.formatted(date: .abbreviated, time: .omitted)
    }
}
