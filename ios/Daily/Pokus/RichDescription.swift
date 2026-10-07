import Foundation
import PokusCore
import SwiftUI
import UIKit

/// Parses text and supported formatting without a web view or HTML resource loading.
struct RichDescription: View {
    let html: String
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    var body: some View {
        Text(AttributedString(DescriptionParser.render(html)))
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
private final class DescriptionParser: NSObject, XMLParserDelegate {
    private let output = NSMutableAttributedString(string: "")
    private var stack: [(String, [NSAttributedString.Key: Any])] = []
    private var ignoredDepth = 0
    static func render(_ html: String) -> NSAttributedString {
        let delegate = DescriptionParser()
        let clean = html.replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "<br\\s*/?>", with: "<br/>", options: .regularExpression)
        guard !clean.localizedCaseInsensitiveContains("<!DOCTYPE"), !clean.localizedCaseInsensitiveContains("<!ENTITY"),
              let data = ("<root>" + clean + "</root>").data(using: .utf8) else {
            return NSAttributedString(string: WorkspaceRules.plainText(html))
        }
        let parser = XMLParser(data: data); parser.delegate = delegate; parser.shouldResolveExternalEntities = false
        if parser.parse() { return delegate.output }
        return NSAttributedString(string: WorkspaceRules.plainText(html))
    }
    func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?, qualifiedName: String?, attributes: [String: String]) {
        let name = name.lowercased()
        if ignoredDepth > 0 || ["script", "style", "iframe", "object"].contains(name) { ignoredDepth += 1; return }
        var style = stack.last?.1 ?? [.font: UIFont.preferredFont(forTextStyle: .body)]
        if ["p", "h2", "blockquote", "pre"].contains(name), output.length > 0 { output.append(NSAttributedString(string: "\n")) }
        if name == "br" { output.append(NSAttributedString(string: "\n")) }
        if name == "li" { output.append(NSAttributedString(string: output.length == 0 ? "• " : "\n• ")) }
        if name == "h2" { style[.font] = UIFont.preferredFont(forTextStyle: .headline) }
        if name == "strong" || name == "b" || name == "em" || name == "i" {
            let font = (style[.font] as? UIFont) ?? UIFont.preferredFont(forTextStyle: .body)
            var traits = font.fontDescriptor.symbolicTraits
            traits.insert(name == "em" || name == "i" ? .traitItalic : .traitBold)
            if let descriptor = font.fontDescriptor.withSymbolicTraits(traits) { style[.font] = UIFont(descriptor: descriptor, size: font.pointSize) }
        }
        if name == "s" { style[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
        if name == "code" { style[.font] = UIFont.monospacedSystemFont(ofSize: UIFont.preferredFont(forTextStyle: .body).pointSize, weight: .regular) }
        if name == "a", let href = attributes["href"], let url = URL(string: href), ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
            style[.link] = url; style[.underlineStyle] = NSUnderlineStyle.single.rawValue
        }
        stack.append((name, style))
    }
    func parser(_ parser: XMLParser, foundCharacters text: String) {
        if ignoredDepth == 0 { output.append(NSAttributedString(string: text, attributes: stack.last?.1)) }
    }
    func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
        if ignoredDepth > 0 { ignoredDepth -= 1; return }
        if !stack.isEmpty { stack.removeLast() }
    }
}
