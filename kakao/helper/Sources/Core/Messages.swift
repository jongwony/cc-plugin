import Foundation

public struct Message: Equatable {
    /// Every text in the row, top to bottom.
    public let texts: [String]
    /// The message itself: text areas when the row has any, otherwise the texts that are not
    /// counters or time labels. Markers and send confirmation look only at this.
    public let body: [String]

    public init(texts: [String], body: [String]? = nil) {
        self.texts = texts
        self.body = body ?? texts.filter { !isVolatileLabel($0) }
    }

    public var text: String { body.joined(separator: "\n") }

    /// Texts outside the body: unread counters, time labels, sender names.
    public var labels: [String] { texts.filter { !body.contains($0) } }

    /// The body ends with an ellipsis: the bubble may be cut and need its full view.
    public var truncated: Bool { body.contains { endsWithEllipsis($0) } }

    var asJSON: [String: Any] { ["text": text, "labels": labels, "truncated": truncated] }
}

let textRoles: Set<String> = ["AXTextArea", "AXStaticText", "AXTextField"]

private let volatilePatterns: [NSRegularExpression] = [
    #"^\d{1,4}$"#,                                                      // unread counter
    #"^(오전|오후|AM|PM)?\s*\d{1,2}:\d{2}(\s*(AM|PM|am|pm))?$"#,         // time label
].map { try! NSRegularExpression(pattern: $0) }

/// Text the app changes after the fact (read counters, merged time labels).
func isVolatileLabel(_ s: String) -> Bool {
    let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
    let range = NSRange(t.startIndex..., in: t)
    return volatilePatterns.contains { $0.firstMatch(in: t, range: range) != nil }
}

func endsWithEllipsis(_ s: String) -> Bool {
    let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
    return t.hasSuffix("…") || t.hasSuffix("...")
}

/// Rows of the message list, top to bottom. A row without body text is skipped.
func messages(in list: UINode) -> [Message] {
    let kids = list.children
    let rows = kids.filter { $0.role == "AXRow" }
    var out: [Message] = []
    for row in (rows.isEmpty ? kids : rows) {
        var texts: [String] = []
        var areas: [String] = []
        for v in walk(row, maxNodes: 300, maxDepth: 20).visited {
            guard let role = v.node.role, textRoles.contains(role) else { continue }
            let s = v.node.stringValue ?? v.node.title ?? ""
            guard !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            texts.append(s)
            if role == "AXTextArea" { areas.append(s) }
        }
        let m = Message(texts: texts, body: areas.isEmpty ? nil : areas)
        if !m.body.isEmpty { out.append(m) }
    }
    return out
}

/// Line endings unified, outer whitespace trimmed. Used for every text comparison.
func normalize(_ s: String) -> String {
    s.replacingOccurrences(of: "\r\n", with: "\n")
        .replacingOccurrences(of: "\r", with: "\n")
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

let markerWindow = 3

private func fingerprint(_ msgs: ArraySlice<Message>) -> String {
    fnv1a64(msgs.map { $0.body.joined(separator: "\u{1F}") }.joined(separator: "\u{1E}"))
}

/// Opaque marker for a position in the list: "v2.<k>.<end>.<hash of the k body rows before end>".
func marker(for msgs: [Message]) -> String {
    let k = min(markerWindow, msgs.count)
    if k == 0 { return "v2.0.0.0" }
    return "v2.\(k).\(msgs.count).\(fingerprint(msgs[(msgs.count - k)...]))"
}

/// Rows after the marker's position. Among positions whose rows match, the one at the recorded
/// index wins, otherwise the nearest (the earlier on a tie, so rows repeat rather than go missing).
/// nil when no position matches.
func messages(after marker: String, in msgs: [Message]) -> (rows: [Message], ambiguous: Bool)? {
    let parts = marker.split(separator: ".", omittingEmptySubsequences: false)
    guard parts.count == 4, parts[0] == "v2", let k = Int(parts[1]), let end = Int(parts[2]),
          k >= 0, end >= k else { return nil }
    if k == 0 { return (msgs, false) }
    guard msgs.count >= k else { return nil }
    let hash = String(parts[3])
    let hits = (k...msgs.count).filter { fingerprint(msgs[($0 - k)..<$0]) == hash }
    guard let best = hits.min(by: { (abs($0 - end), $0) < (abs($1 - end), $1) }) else { return nil }
    return (Array(msgs[best...]), hits.count > 1 && best != end)
}

/// A row shows `sent`: its body equals it, or some body text is its cut-off beginning.
func rowShows(_ m: Message, sent: String) -> Bool {
    let want = normalize(sent)
    if normalize(m.text) == want { return true }
    for t in m.body {
        let n = normalize(t)
        if n == want { return true }
        if endsWithEllipsis(n) {
            var head = n
            if head.hasSuffix("…") { head.removeLast() } else { head.removeLast(3) }
            head = normalize(head)
            if head.count >= 10 && want.hasPrefix(head) { return true }
        }
    }
    return false
}

/// `sent` appeared after the press: in a row after the pre-press position, or, when that position
/// is lost, as one more row showing it than before. A matching bubble already there never counts.
func sentAppeared(before: [Message], after: [Message], sent: String) -> Bool {
    if let found = messages(after: marker(for: before), in: after) {
        return found.rows.contains { rowShows($0, sent: sent) }
    }
    return after.filter { rowShows($0, sent: sent) }.count > before.filter { rowShows($0, sent: sent) }.count
}
