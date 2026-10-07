import DailyCore
import Observation
import PokusCore
import SwiftUI

@MainActor @Observable
private final class HabitPagingState {
    var rows: [HabitHistory] = []
    var offset = 0
    var loaded = false
    var loading = false
    var error: String?
    private var generation = UUID()
    @ObservationIgnored private var requestTask: Task<([HabitHistory], Int), Error>?
    func reset(retainingRows: Bool = false) {
        requestTask?.cancel(); requestTask = nil; generation = UUID()
        if !retainingRows { rows = [] }
        offset = 0; loaded = false; loading = false; error = nil
    }
    func more(store: any HabitViewStore, ids: [String], day: DayKey, index: HabitDayIndex, automatic: Bool = false) async {
        guard !loading, offset < ids.count || !loaded, !(automatic && error != nil) else { return }
        let token = generation, identity = store.readIdentity
        loading = true; error = nil
        let initialOffset = offset
        let batchSize = loaded ? 25 : max(25, rows.count)
        let request = Task {
            var position = initialOffset, next: [HabitHistory] = []
            while next.count < batchSize && position < ids.count {
                let slice = Array(ids[position..<min(ids.count, position + min(25, batchSize - next.count))])
                next += try await store.rows(ids: slice, on: day, index: index)
                position += slice.count
            }
            return (next, position)
        }
        requestTask = request
        defer { if generation == token { loading = false; requestTask = nil } }
        do {
            let (next, position) = try await withTaskCancellationHandler { try await request.value } onCancel: { request.cancel() }
            try Task.checkCancellation()
            guard token == generation, identity == store.readIdentity else { return }
            if !loaded { rows = [] }
            var existing = Set(rows.map(\.id)); rows += next.filter { existing.insert($0.id).inserted }
            offset = position; loaded = true
        } catch {
            guard token == generation, !Task.isCancelled, identity == store.readIdentity else { return }; self.error = error.localizedDescription
        }
    }
}

struct HabitPagedRows<Row: View>: View {
    let store: any HabitViewStore
    let ids: [String]
    let day: DayKey
    let index: HabitDayIndex
    @ViewBuilder var row: (HabitHistory) -> Row
    @State private var state = HabitPagingState()
    @State private var identity = ""
    @State private var loadedContentIdentity: String?
    private var contentIdentity: String { "\(store.cacheScopeIdentity)-\(day)-\(ids.joined(separator: ","))" }
    private var requestIdentity: String {
        let totals = ids.map { "\($0):\(index.values[$0] ?? 0):\(index.targets[$0].map { String($0) } ?? "")" }.joined(separator: ",")
        return "\(store.readIdentity)-\(contentIdentity)-\(totals)"
    }
    private var visibleRows: [HabitHistory] { loadedContentIdentity == contentIdentity ? state.rows : [] }
    var body: some View {
        Group {
            ForEach(visibleRows) { habit in
                row(habit).onAppear {
                    if state.rows.suffix(5).contains(where: { $0.id == habit.id }) {
                        Task { await state.more(store: store, ids: ids, day: day, index: index, automatic: true) }
                    }
                }
            }
            if loadedContentIdentity != contentIdentity || (visibleRows.isEmpty && (state.loading || (!state.loaded && state.error == nil))) { ProgressView("Loading habits") }
            else if state.loading && state.loaded { ProgressView("Loading more habits") }
            else if let error = state.error { ReadError(message: error) { Task { await state.more(store: store, ids: ids, day: day, index: index) } } }
            else if !state.loading && state.offset < ids.count { Button("Load more habits") { Task { await state.more(store: store, ids: ids, day: day, index: index) } }.frame(minHeight: 44) }
        }
        .task(id: requestIdentity) {
            let key = requestIdentity
            guard key != identity || !state.loaded else { return }
            identity = key
            state.reset(retainingRows: loadedContentIdentity == contentIdentity)
            loadedContentIdentity = contentIdentity
            await state.more(store: store, ids: ids, day: day, index: index)
        }
    }
}

struct LoadedEntryEditor: View {
    let store: any HabitViewStore
    let habitID: UUID
    let day: DayKey
    let today: DayKey
    @State private var state = ReadState<HabitHistory?>()
    @State private var retry = 0
    @State private var loadedContentIdentity: String?
    private var contentIdentity: String { "\(store.cacheScopeIdentity)-\(habitID)-\(day)" }
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        Group {
            if loadedContentIdentity == contentIdentity, let habit = state.value ?? nil { EntryEditorView(store: store, habitID: habitID, day: day, today: today, loaded: habit) }
            else {
                NavigationStack {
                    Group {
                        if loadedContentIdentity != contentIdentity { ProgressView("Loading daily entry") }
                        else if let error = state.error { ReadError(message: error) { retry += 1 } }
                        else if state.value == nil { ProgressView("Loading daily entry") }
                        else { ContentUnavailableView("Habit unavailable", systemImage: "checkmark.circle") }
                    }.navigationTitle("Daily total").toolbar { Button("Cancel") { dismiss() } }
                }
            }
        }.task(id: "\(store.readIdentity)-\(habitID)-\(day)-\(retry)") {
            if loadedContentIdentity != contentIdentity { state.clear(); loadedContentIdentity = contentIdentity }
            await state.load { try await store.detail(id: habitID, on: day) }
        }
    }
}

struct HabitActivityView: View {
    let store: any HabitViewStore
    let today: DayKey
    var habitID: UUID? = nil
    var onSelect: (DayKey) -> Void
    @State private var year: Int
    @State private var month: DayKey
    @State private var state = ReadState<HabitActivityYear>()
    @State private var retry = 0
    @State private var loadedContentIdentity: String?
    private var contentIdentity: String { "\(store.cacheScopeIdentity)-\(today)-\(year)-\(habitID?.uuidString ?? "all")" }
    init(store: any HabitViewStore, today: DayKey, habitID: UUID? = nil, onSelect: @escaping (DayKey) -> Void) {
        self.store = store; self.today = today; self.habitID = habitID; self.onSelect = onSelect
        _year = State(initialValue: today.year)
        _month = State(initialValue: HabitCalendarMonth(containing: today).firstDay)
    }
    var body: some View {
        Group {
            if loadedContentIdentity == contentIdentity, let activity = state.value {
                ActivityGrid(habits: activity.individual.map { [$0] } ?? [], today: today, individual: habitID != nil,
                    activity: activity, selectedYear: year, onYearChange: { year = $0 },
                    selectedMonth: month, onMonthChange: { month = $0 }, onSelect: onSelect)
            } else if state.error == nil || loadedContentIdentity != contentIdentity {
                ProgressView("Loading \(String(year)) activity").frame(maxWidth: .infinity, minHeight: 180)
            }
            if loadedContentIdentity == contentIdentity, let error = state.error { ReadError(message: error) { retry += 1 } }
        }.task(id: "\(store.readIdentity)-\(today)-\(year)-\(habitID?.uuidString ?? "all")-\(retry)") {
            if loadedContentIdentity != contentIdentity { state.clear(); loadedContentIdentity = contentIdentity }
            await state.load { try await store.activity(year: year, today: today, habitID: habitID) }
        }.onChange(of: today) { old, next in
            if month == HabitCalendarMonth(containing: old).firstDay {
                month = HabitCalendarMonth(containing: next).firstDay
                year = next.year
            }
        }
    }
}
