import Foundation

/// Rows keyed by collection and record ID, as PocketBase returns them.
public typealias RecordTables = [String: [String: [String: JSONValue]]]

/// Interprets the subset of PocketBase filter syntax Pokus sends: comparisons, `?` any-of
/// operators, `&&`, `||`, parentheses, single-relation paths, and `_via_` back-relations.
public indirect enum RecordFilter: Sendable {
    case and(RecordFilter, RecordFilter), or(RecordFilter, RecordFilter)
    case comparison(String, String, JSONValue)
    case all

    public static func parse(_ text: String) -> RecordFilter { var parser = Parser(text); return parser.parse() }

    public func matches(_ record: [String: JSONValue], collection: String, tables: RecordTables, index: BackRelationIndex? = nil) -> Bool {
        switch self {
        case .all: return true
        case .and(let a, let b): return a.matches(record, collection: collection, tables: tables, index: index) && b.matches(record, collection: collection, tables: tables, index: index)
        case .or(let a, let b): return a.matches(record, collection: collection, tables: tables, index: index) || b.matches(record, collection: collection, tables: tables, index: index)
        case .comparison(let field, let operation, let expected):
            let values = Self.values(field, record: record, collection: collection, tables: tables, index: index)
            let predicate: (JSONValue) -> Bool = { value in
                let order = Self.compare(value, expected)
                switch operation.replacingOccurrences(of: "?", with: "") {
                case "=": return order == .orderedSame
                case "!=": return order != .orderedSame
                case ">": return order == .orderedDescending
                case ">=": return order != .orderedAscending
                case "<": return order == .orderedAscending
                case "<=": return order != .orderedDescending
                default: return false
                }
            }
            return operation.hasPrefix("?") ? values.contains(where: predicate) : values.allSatisfy(predicate)
        }
    }

    /// The smallest value `field` can take in any matching row, when the filter guarantees one.
    public func lowerBound(_ field: String) -> JSONValue? {
        switch self {
        case .all: return nil
        case .and(let a, let b):
            switch (a.lowerBound(field), b.lowerBound(field)) {
            case (let x?, let y?): return Self.compare(x, y) == .orderedAscending ? y : x
            case (let x?, nil): return x
            case (nil, let y): return y
            }
        case .or(let a, let b):
            guard let x = a.lowerBound(field), let y = b.lowerBound(field) else { return nil }
            return Self.compare(x, y) == .orderedAscending ? x : y
        case .comparison(let name, let operation, let value):
            return name == field && ["=", ">", ">="].contains(operation) ? value : nil
        }
    }

    static func values(_ field: String, record: [String: JSONValue], collection: String, tables: RecordTables, index: BackRelationIndex?) -> [JSONValue] {
        if field.contains("_via_") {
            let components = field.components(separatedBy: "_via_")
            let path = components[1].split(separator: ".").map(String.init)
            let id = record["id"].flatMap { if case .string(let value) = $0 { return value } else { return nil } } ?? ""
            let related = index?.rows(components[0], field: path[0], containing: id, tables: tables)
                ?? (tables[components[0]] ?? [:]).values.filter { RecordSchema.ids($0[path[0]]).contains(id) }
            return related.isEmpty ? [.string("")] : related.map { $0[path.count > 1 ? path[1] : "id"] ?? .string("") }
        }
        let path = field.split(separator: ".", maxSplits: 1).map(String.init)
        if path.count == 2, let target = RecordSchema.relation(collection, field: path[0]) {
            guard case .string(let id)? = record[path[0]], let related = tables[target]?[id] else { return [.string("")] }
            return values(path[1], record: related, collection: target, tables: tables, index: index)
        }
        let value = record[field] ?? .string("")
        if case .array(let values) = value { return values.isEmpty ? [.string("")] : values }
        return [value == .null ? .string("") : value]
    }

    public static func compare(_ a: JSONValue, _ b: JSONValue) -> ComparisonResult {
        switch (a, b) {
        case (.number(let a), .number(let b)): return a == b ? .orderedSame : a < b ? .orderedAscending : .orderedDescending
        case (.bool(let a), .bool(let b)): return a == b ? .orderedSame : a ? .orderedDescending : .orderedAscending
        case (.string(let a), .string(let b)): return a == b ? .orderedSame : a < b ? .orderedAscending : .orderedDescending
        case (.string(""), .number(let b)), (.null, .number(let b)): return compare(.number(0), .number(b))
        case (.number(let a), .string("")): return compare(.number(a), .number(0))
        default: return a == b ? .orderedSame : .orderedAscending
        }
    }

    /// Orders rows by a PocketBase `sort` parameter such as `-updated,id`.
    public static func sort(_ rows: inout [[String: JSONValue]], by sort: String) {
        let keys = sort.split(separator: ",").map { field -> (String, Bool) in
            field.hasPrefix("-") ? (String(field.dropFirst()), true) : (String(field.hasPrefix("+") ? field.dropFirst() : field[...]), false)
        }
        rows.sort { a, b in
            for (name, descending) in keys {
                let order = compare(a[name] ?? .string(""), b[name] ?? .string(""))
                if order != .orderedSame { return descending ? order == .orderedDescending : order == .orderedAscending }
            }
            // Dictionary order is random; a final ID order keeps pages stable.
            return compare(a["id"] ?? .string(""), b["id"] ?? .string("")) == .orderedAscending
        }
    }

    private struct Parser {
        private var tokens: [String] = []
        private var position = 0
        init(_ text: String) {
            let input = Array(text); var index = 0
            while index < input.count {
                if input[index].isWhitespace { index += 1; continue }
                if input[index] == "'" || input[index] == "\"" {
                    let quote = input[index]
                    var value = "'"; index += 1
                    while index < input.count && input[index] != quote {
                        if input[index] == "\\", index + 1 < input.count { index += 1 }
                        value.append(input[index]); index += 1
                    }
                    if index < input.count { index += 1 }; tokens.append(value); continue
                }
                if "()".contains(input[index]) { tokens.append(String(input[index])); index += 1; continue }
                if "&|=!?<>~".contains(input[index]) {
                    var value = ""
                    while index < input.count && "&|=!?<>~".contains(input[index]) { value.append(input[index]); index += 1 }
                    tokens.append(value); continue
                }
                var value = ""
                while index < input.count && !input[index].isWhitespace && !"()&|=!?<>~".contains(input[index]) { value.append(input[index]); index += 1 }
                tokens.append(value)
            }
        }
        mutating func parse() -> RecordFilter { tokens.isEmpty ? .all : disjunction() }
        private mutating func disjunction() -> RecordFilter {
            var result = conjunction()
            while take("||") { result = .or(result, conjunction()) }
            return result
        }
        private mutating func conjunction() -> RecordFilter {
            var result = primary()
            while take("&&") { result = .and(result, primary()) }
            return result
        }
        private mutating func primary() -> RecordFilter {
            if take("(") { let result = disjunction(); _ = take(")"); return result }
            guard position + 2 < tokens.count else { position = tokens.count; return .all }
            let field = tokens[position], operation = tokens[position + 1], raw = tokens[position + 2]; position += 3
            let value: JSONValue
            if raw.hasPrefix("'") { value = .string(String(raw.dropFirst())) }
            else if raw == "true" || raw == "false" { value = .bool(raw == "true") }
            else if raw == "null" { value = .string("") }
            else if let number = Double(raw) { value = .number(number) }
            else { value = .string(raw) }
            return .comparison(field, operation, value)
        }
        private mutating func take(_ token: String) -> Bool {
            guard position < tokens.count && tokens[position] == token else { return false }; position += 1; return true
        }
    }
}

/// Memoizes `_via_` lookups for one query evaluation; not shared across threads.
public final class BackRelationIndex {
    private var built: [String: [String: [[String: JSONValue]]]] = [:]
    public init() {}
    func rows(_ collection: String, field: String, containing id: String, tables: RecordTables) -> [[String: JSONValue]] {
        let key = collection + "." + field
        if built[key] == nil {
            var index: [String: [[String: JSONValue]]] = [:]
            for row in (tables[collection] ?? [:]).values { for target in RecordSchema.ids(row[field]) { index[target, default: []].append(row) } }
            built[key] = index
        }
        return built[key]?[id] ?? []
    }
}
