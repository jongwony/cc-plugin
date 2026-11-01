import Foundation

/// agent-desktop's normalized macOS roles, mapped back to the AX roles the shared Core reads.
/// agent-desktop folds AXTextArea and AXTextField into `textfield`; it maps to AXTextArea, the
/// role Core treats as message body and input.
let adRoleToAX: [String: String] = [
    "window": "AXWindow", "button": "AXButton", "textfield": "AXTextArea", "statictext": "AXStaticText",
    "table": "AXTable", "list": "AXList", "outline": "AXOutline", "row": "AXRow", "cell": "AXCell",
    "scrollarea": "AXScrollArea", "group": "AXGroup", "image": "AXImage",
]

func axRole(_ adRole: String?) -> String? {
    guard let r = adRole, !r.isEmpty else { return nil }
    if let m = adRoleToAX[r.lowercased()] { return m }
    return "AX" + r.prefix(1).uppercased() + r.dropFirst()
}

/// Containers whose rows change between reads; their children are re-read on every access.
let liveContainerRoles: Set<String> = ["AXTable", "AXList", "AXOutline"]

/// Where a node sits: the window it came from and its child indices from the window root.
struct ADOrigin {
    let windowID: String
    let path: [Int]
}

/// One node of an agent-desktop snapshot. Attributes come from the snapshot; for a node with a
/// ref, the value and enabled state are read live (`get`), and `setStringValue` / `press` go
/// through `set-value` / `click`. A node without a ref is read-only.
final class ADNode: UINode {
    let client: ADClient
    let origin: ADOrigin
    let maxDepth: Int
    private var kids: [UINode]?
    private var loaded: [String: Any]?
    private let loader: (() -> [String: Any]?)?

    init(client: ADClient, json: [String: Any], origin: ADOrigin, maxDepth: Int) {
        self.client = client
        self.loaded = json
        self.loader = nil
        self.origin = origin
        self.maxDepth = maxDepth
    }

    /// A window root whose snapshot is taken on first access.
    init(client: ADClient, origin: ADOrigin, maxDepth: Int, loader: @escaping () -> [String: Any]?) {
        self.client = client
        self.loaded = nil
        self.loader = loader
        self.origin = origin
        self.maxDepth = maxDepth
    }

    var json: [String: Any] {
        if let j = loaded { return j }
        let j = loader?() ?? [:]
        loaded = j
        return j
    }

    var ref: String? { json["ref_id"] as? String }
    var snapshotStates: [String] { json["states"] as? [String] ?? [] }
    var actions: [String] { json["available_actions"] as? [String] ?? [] }

    var role: String? { axRole(json["role"] as? String) }
    var subrole: String? { nil }
    var title: String? { json["name"] as? String }
    var nodeDescription: String? { json["description"] as? String }
    var identifier: String? { (json["native_id"] as? [String: Any])?["value"] as? String }

    var stringValue: String? {
        guard let r = ref else { return json["value"] as? String }
        let res = client.call(["get", r, "--property", "value"])
        guard res.ok, let d = res.data as? [String: Any] else { return nil }
        return d["value"] as? String
    }

    var isEnabled: Bool {
        guard let r = ref else { return !snapshotStates.contains("disabled") }
        let res = client.call(["get", r, "--property", "states"])
        guard res.ok, let d = res.data as? [String: Any], let states = d["value"] as? [String] else { return false }
        return !states.contains("disabled")
    }

    var isValueSettable: Bool { ref != nil && actions.contains("SetValue") }

    var children: [UINode] {
        if let r = role, liveContainerRoles.contains(r), let fresh = reread() { return fresh }
        if let k = kids { return k }
        let k = ADNode.build(client: client, children: json["children"] as? [[String: Any]] ?? [],
                             parent: origin, maxDepth: maxDepth)
        kids = k
        return k
    }

    func setStringValue(_ text: String) -> Bool {
        guard let r = ref else { return false }
        return client.call(["set-value", r, text]).ok
    }

    func press() -> Bool {
        guard let r = ref else { return false }
        return client.call(["click", r]).ok
    }

    /// A fresh read of this container's children: from its own ref when it has one, otherwise a
    /// new window snapshot followed down the same path.
    private func reread() -> [UINode]? {
        let tree: [String: Any]?
        if let r = ref {
            tree = ADNode.snapshotTree(client, ["snapshot", "--root", r, "--max-depth", String(maxDepth)])
        } else {
            let root = ADNode.snapshotTree(client, ["snapshot", "--window-id", origin.windowID,
                                                    "--max-depth", String(maxDepth), "--timeout-ms", "8000"])
            tree = root.flatMap { ADNode.follow($0, origin.path) }
        }
        guard let t = tree else { return nil }
        return ADNode.build(client: client, children: t["children"] as? [[String: Any]] ?? [],
                            parent: origin, maxDepth: maxDepth)
    }

    static func build(client: ADClient, children: [[String: Any]], parent: ADOrigin, maxDepth: Int) -> [UINode] {
        children.enumerated().map { i, c in
            ADNode(client: client, json: c, origin: ADOrigin(windowID: parent.windowID, path: parent.path + [i]),
                   maxDepth: maxDepth)
        }
    }

    static func follow(_ tree: [String: Any], _ path: [Int]) -> [String: Any]? {
        var cur = tree
        for i in path {
            guard let kids = cur["children"] as? [[String: Any]], i < kids.count else { return nil }
            cur = kids[i]
        }
        return cur
    }

    static func snapshotTree(_ client: ADClient, _ argv: [String]) -> [String: Any]? {
        let res = client.call(argv)
        guard res.ok, let d = res.data as? [String: Any] else { return nil }
        return d["tree"] as? [String: Any]
    }
}
