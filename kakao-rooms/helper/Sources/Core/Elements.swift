import Foundation

struct Visited {
    let node: UINode
    let ancestorRoles: [String]
    let path: [Int]
}

/// Depth-first, pre-order walk with node and depth caps.
func walk(_ root: UINode, maxNodes: Int = 4000, maxDepth: Int = 40) -> [Visited] {
    var out: [Visited] = []
    var stack: [Visited] = [Visited(node: root, ancestorRoles: [], path: [])]
    while let v = stack.popLast(), out.count < maxNodes {
        out.append(v)
        guard v.path.count < maxDepth else { continue }
        let kids = v.node.children
        let roles = v.ancestorRoles + [v.node.role ?? "?"]
        for (i, k) in kids.enumerated().reversed() {
            stack.append(Visited(node: k, ancestorRoles: roles, path: v.path + [i]))
        }
    }
    return out
}

/// Roles that hold message rows. A text area under one of these is a message, not the input box.
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
    /// Descriptors of every candidate per element, for the handshake report.
    let candidates: [String: [[String: Any]]]

    var missing: [String] {
        var m: [String] = []
        if input.node == nil { m.append("input") }
        if sendButton.node == nil { m.append("send_button") }
        if messageList.node == nil { m.append("message_list") }
        return m
    }
}

private func trimmed(_ s: String?) -> String? {
    guard let t = s?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return nil }
    return t
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
    let all = walk(window)

    let inputCands = all.filter {
        textInputRoles.contains($0.node.role ?? "")
            && $0.ancestorRoles.allSatisfy { !listRoles.contains($0) && !rowRoles.contains($0) }
    }
    let inputPick: [UINode]
    if let id = hints.inputIdentifier {
        inputPick = all.filter { textInputRoles.contains($0.node.role ?? "") && $0.node.identifier == id && $0.node.isValueSettable }.map(\.node)
    } else {
        inputPick = inputCands.filter { $0.node.isValueSettable }.map(\.node)
    }

    let labels = Set((hints.sendLabels ?? defaultSendLabels).compactMap { trimmed($0) })
    let buttons = all.filter { $0.node.role == "AXButton" }
    let labelled = buttons.filter { trimmed($0.node.title) != nil || trimmed($0.node.nodeDescription) != nil || trimmed($0.node.identifier) != nil }
    let sendPick = buttons.filter { b in
        [b.node.title, b.node.nodeDescription, b.node.identifier].contains { s in
            guard let t = trimmed(s) else { return false }
            return labels.contains(t)
        }
    }.map(\.node)

    let topLists = all.filter {
        listRoles.contains($0.node.role ?? "") && $0.ancestorRoles.allSatisfy { !listRoles.contains($0) }
    }
    let listPick: [UINode]
    if let id = hints.listIdentifier {
        listPick = all.filter { listRoles.contains($0.node.role ?? "") && $0.node.identifier == id }.map(\.node)
    } else {
        listPick = topLists.map(\.node)
    }

    return ElementSet(
        input: pick(inputPick),
        sendButton: pick(sendPick),
        messageList: pick(listPick),
        candidates: [
            "input": inputCands.prefix(30).map(describe),
            "send_button": labelled.prefix(40).map(describe),
            "message_list": all.filter { listRoles.contains($0.node.role ?? "") }.prefix(20).map(describe),
        ])
}
