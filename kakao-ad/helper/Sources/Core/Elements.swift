import Foundation

struct Visited {
    let node: UINode
    let ancestorRoles: [String]
    let path: [Int]
}

/// Depth-first, pre-order walk with node and depth caps. A node for which `prune` holds is
/// visited but its children are not. `truncated` is true when the node cap stopped the walk.
func walk(_ root: UINode, maxNodes: Int = 4000, maxDepth: Int = 40,
          prune: (UINode) -> Bool = { _ in false }) -> (visited: [Visited], truncated: Bool) {
    var out: [Visited] = []
    var stack: [Visited] = [Visited(node: root, ancestorRoles: [], path: [])]
    while let v = stack.popLast() {
        if out.count >= maxNodes { return (out, true) }
        out.append(v)
        guard v.path.count < maxDepth, v.path.isEmpty || !prune(v.node) else { continue }
        let kids = v.node.children
        let roles = v.ancestorRoles + [v.node.role ?? "?"]
        for (i, k) in kids.enumerated().reversed() {
            stack.append(Visited(node: k, ancestorRoles: roles, path: v.path + [i]))
        }
    }
    return (out, false)
}

/// Roles that hold message rows. The walk does not enter them, so a long history never crowds
/// out the input box and the send button, and a text area inside them is never the input box.
let listRoles: Set<String> = ["AXTable", "AXOutline", "AXList"]
let rowRoles: Set<String> = ["AXRow", "AXCell"]
let textInputRoles: Set<String> = ["AXTextArea", "AXTextField"]

enum Found {
    case found(UINode)
    case missing
    case ambiguous(Int)

    var node: UINode? { if case .found(let n) = self { return n } else { return nil } }

    var check: String {
        switch self {
        case .found: return "ok"
        case .missing: return "missing"
        case .ambiguous(let n): return "ambiguous(\(n))"
        }
    }
}

func pick(_ nodes: [UINode]) -> Found {
    switch nodes.count {
    case 0: return .missing
    case 1: return .found(nodes[0])
    default: return .ambiguous(nodes.count)
    }
}

struct ElementSet {
    let input: Found
    let sendButton: Found
    let messageList: Found
    let truncated: Bool
    let visited: [Visited]

    var missing: [String] {
        var m: [String] = []
        if input.node == nil { m.append("input") }
        if sendButton.node == nil { m.append("send_button") }
        if messageList.node == nil { m.append("message_list") }
        return m
    }

    /// Descriptors of every candidate per element, for a handshake that could not settle one.
    var candidates: [String: [[String: Any]]] {
        [
            "input": visited.filter { isInputCandidate($0) }.prefix(30).map(describe),
            "send_button": visited.filter { $0.node.role == "AXButton" && hasLabel($0.node) }.prefix(40).map(describe),
            "message_list": visited.filter { listRoles.contains($0.node.role ?? "") }.prefix(20).map(describe),
        ]
    }
}

private func trimmed(_ s: String?) -> String? {
    guard let t = s?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return nil }
    return t
}

private func hasLabel(_ n: UINode) -> Bool {
    trimmed(n.title) != nil || trimmed(n.nodeDescription) != nil || trimmed(n.identifier) != nil
}

private func isInputCandidate(_ v: Visited) -> Bool {
    textInputRoles.contains(v.node.role ?? "") && v.ancestorRoles.allSatisfy { !rowRoles.contains($0) }
}

func describe(_ v: Visited) -> [String: Any] {
    var d: [String: Any] = [
        "role": v.node.role ?? NSNull(),
        "path": v.path.map(String.init).joined(separator: "/"),
        "ancestors": v.ancestorRoles,
        "settable": v.node.isValueSettable,
        "enabled": v.node.isEnabled,
    ]
    if let s = trimmed(v.node.subrole) { d["subrole"] = s }
    if let s = trimmed(v.node.identifier) { d["identifier"] = s }
    if let s = trimmed(v.node.title) { d["title"] = s }
    if let s = trimmed(v.node.nodeDescription) { d["description"] = s }
    // Only the length: the value may be someone's message.
    if let s = v.node.stringValue { d["value_length"] = s.count }
    return d
}

func findElements(in window: UINode, hints: Hints, defaultSendLabels: [String]) -> ElementSet {
    let (all, truncated) = walk(window, prune: { listRoles.contains($0.role ?? "") })

    let inputs = all.filter(isInputCandidate)
    let inputPick = inputs.filter { v in
        v.node.isValueSettable && (hints.inputIdentifier.map { v.node.identifier == $0 } ?? true)
    }.map(\.node)

    let labels = Set((hints.sendLabels ?? defaultSendLabels).compactMap { trimmed($0) })
    let sendPick = all.filter { b in
        b.node.role == "AXButton"
            && [b.node.title, b.node.nodeDescription, b.node.identifier].contains { trimmed($0).map(labels.contains) ?? false }
    }.map(\.node)

    let listPick = all.filter { v in
        listRoles.contains(v.node.role ?? "")
            && (hints.listIdentifier.map { v.node.identifier == $0 } ?? true)
    }.map(\.node)

    return ElementSet(input: pick(inputPick), sendButton: pick(sendPick), messageList: pick(listPick),
                      truncated: truncated, visited: all)
}
