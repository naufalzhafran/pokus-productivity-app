import Foundation

/// Converts stored HTML to editable text without loading documents or remote resources.
enum HTMLText {
    private static let entities: [String: String] = {
        guard let url = Bundle.module.url(forResource: "HTMLEntities", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let entities = try? JSONDecoder().decode([String: String].self, from: data) else { return [:] }
        return entities
    }()
    private static let entityPattern = try! NSRegularExpression(pattern: "&(#(?:[xX][0-9a-fA-F]+|[0-9]+)|[a-zA-Z][a-zA-Z0-9]+);")

    static func decode(_ html: String) -> String {
        let text = html
            .replacingOccurrences(of: "(?is)<(script|style|iframe|object)\\b[^>]*>.*?</\\1\\s*>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "(?is)<!--.*?-->", with: "", options: .regularExpression)
            .replacingOccurrences(of: "(?i)<br\\s*/?>", with: "\n", options: .regularExpression)
            .replacingOccurrences(of: "(?i)<li\\b[^>]*>", with: "• ", options: .regularExpression)
            .replacingOccurrences(of: "(?i)</(?:p|div|h[1-6]|blockquote|pre|ul|ol|li|tr)\\s*>", with: "\n", options: .regularExpression)
            .replacingOccurrences(of: "<[^>]*>", with: "", options: .regularExpression)
        let source = text as NSString
        var result = ""
        var cursor = 0
        for match in entityPattern.matches(in: text, range: NSRange(location: 0, length: source.length)) {
            result += source.substring(with: NSRange(location: cursor, length: match.range.location - cursor))
            let name = source.substring(with: match.range(at: 1))
            let value: String?
            if name.hasPrefix("#") {
                let hex = name.lowercased().hasPrefix("#x")
                let digits = name.dropFirst(hex ? 2 : 1)
                value = UInt32(digits, radix: hex ? 16 : 10).flatMap(UnicodeScalar.init).map(String.init)
            } else { value = entities[name + ";"] }
            result += value ?? source.substring(with: match.range)
            cursor = NSMaxRange(match.range)
        }
        result += source.substring(from: cursor)
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
