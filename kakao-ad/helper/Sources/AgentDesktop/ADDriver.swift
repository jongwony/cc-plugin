import Foundation

/// The AppDriver the shared Core runs on: windows and elements through the agent-desktop subset
/// (`ADClient`), session and person checks through `SessionPolicy`.
final class ADDriver: AppDriver {
    let client: ADClient
    let policy: SessionPolicy
    let maxDepth: Int

    init(client: ADClient, policy: SessionPolicy, maxDepth: Int = 40) {
        self.client = client
        self.policy = policy
        self.maxDepth = maxDepth
    }

    func accessibilityGranted() -> Bool {
        let res = client.call(["permissions"])
        guard res.ok, let d = res.data as? [String: Any], let ax = d["accessibility"] as? [String: Any] else { return false }
        return (ax["state"] as? String) == "granted"
    }

    func appState() -> AppState {
        guard accessibilityGranted() else { return .notTrusted }
        guard policy.isRunning else { return .notRunning }
        if policy.screenLocked() { return .screenLocked }
        return .running(version: policy.version(), frontmost: policy.isFrontmost)
    }

    func appNames() -> Set<String> { policy.appNames() }

    func windows() -> [WindowInfo] {
        guard let name = policy.appName else { return [] }
        let res = client.call(["list-windows", "--app", name])
        guard res.ok, let rows = res.data as? [[String: Any]] else { return [] }
        let names = policy.appNames()
        return rows.compactMap { row in
            guard let wid = row["id"] as? String else { return nil }
            let depth = maxDepth
            let c = client
            // Snapshotted only when Core walks this window.
            let node = ADNode(client: client, origin: ADOrigin(windowID: wid, path: []), maxDepth: depth) {
                ADNode.snapshotTree(c, ["snapshot", "--window-id", wid, "--max-depth", String(depth),
                                        "--timeout-ms", "8000"])
            }
            // A window title equal to the app's name is agent-desktop's fallback when it cannot read
            // the window's name; the window's own accessible name then decides.
            var title = row["title"] as? String
            if let t = title, names.contains(t) { title = node.title ?? t }
            return WindowInfo(windowID: adWindowNumber(wid), title: title,
                              isFocused: (row["is_focused"] as? Bool) ?? false, node: node)
        }
    }

    func cgTitleCount(_ title: String) -> Int? { policy.cgTitleCount(title) }

    func secondsSinceLastInput() -> Double? { policy.secondsSinceLastInput() }
}

/// `w-<CGWindowNumber>` to the number; nil for any other form.
func adWindowNumber(_ id: String) -> UInt32? {
    guard id.hasPrefix("w-") else { return nil }
    return UInt32(id.dropFirst(2))
}
