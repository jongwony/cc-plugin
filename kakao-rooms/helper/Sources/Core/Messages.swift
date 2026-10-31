import Foundation

public struct Message: Equatable {
    public let texts: [String]

    public var text: String { texts.joined(separator: "\n") }

    /// Some text ends with an ellipsis: the bubble may be cut and need its full view.
    public var truncated: Bool { texts.contains { endsWithEllipsis($0) } }

    var asJSON: [String: Any] { ["text": text, "truncated": truncated] }
}

let textRoles: Set<String> = ["AXTextArea", "AXStaticText", "AXTextField"]

func endsWithEllipsis(_ s: String) -> Bool {
    let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
    return t.hasSuffix("…") || t.hasSuffix("...")
}

/// Rows of the message list, top to bottom. A row without text is skipped.
func messages(in list: UINode) -> [Message] {
    let kids = list.children
    let rows = kids.filter { $0.role == "AXRow" }
    var out: [Message] = []
    for row in (rows.isEmpty ? kids : rows) {
        let texts = walk(row, maxNodes: 300, maxDepth: 20).compactMap { v -> String? in
            guard textRoles.contains(v.node.role ?? "") else { return nil }
            let s = v.node.stringValue ?? v.node.title ?? ""
            return s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : s
        }
        if !texts.isEmpty { out.append(Message(texts: texts)) }
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
    fnv1a64(msgs.map { $0.texts.joined(separator: "\u{1F}") }.joined(separator: "\u{1E}"))
}

/// Opaque marker for the current end of the list: "v1.<k>.<hash of the last k rows>".
func marker(for msgs: [Message]) -> String {
    let k = min(markerWindow, msgs.count)
    if k == 0 { return "v1.0.0" }
    return "v1.\(k).\(fingerprint(msgs[(msgs.count - k)...]))"
}

/// Messages after the latest position whose trailing rows match `marker`; nil when it is not found.
func messages(after marker: String, in msgs: [Message]) -> [Message]? {
    let parts = marker.split(separator: ".", omittingEmptySubsequences: false)
    guard parts.count == 3, parts[0] == "v1", let k = Int(parts[1]), k >= 0 else { return nil }
    if k == 0 { return msgs }
    guard msgs.count >= k else { return nil }
    let hash = String(parts[2])
    var end = msgs.count
    while end >= k {
        if fingerprint(msgs[(end - k)..<end]) == hash { return Array(msgs[end...]) }
        end -= 1
    }
    return nil
}

/// A row shows `sent`: some text equals it, or is its cut-off beginning.
func rowShows(_ m: Message, sent: String) -> Bool {
    let want = normalize(sent)
    if normalize(m.text) == want { return true }
    for t in m.texts {
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
