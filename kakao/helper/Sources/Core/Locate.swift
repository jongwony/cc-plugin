import CoreGraphics
import Foundation

/// The chat-list row's title: the first static text in it (the profile button has a title, not a value).
func rowTitle(_ row: UINode) -> String? {
    walk(row, maxNodes: 60, maxDepth: 6).visited
        .first { $0.node.role == "AXStaticText" && !($0.node.stringValue ?? "").isEmpty }?.node.stringValue
}

extension Engine {
    /// Finds the room's row in the main window's chat list by exact title, scrolls it into view
    /// through the list's scroll bar value, and returns where to double-click it. Opens nothing.
    func locate(_ room: String) throws -> Outcome {
        let cmd = "locate"
        _ = try runningVersion(cmd)
        let wins = try appWindows(cmd)
        let open = wins.filter { $0.title == room }
        if open.count > 1 { throw abort(cmd, .roomNotUnique, "room_not_unique", ["room": room, "matches": open.count]) }
        if let w = open.first {
            return outcome(cmd, .ok, "already_open", ["room": room, "window_id": w.windowID.map { Int($0) } ?? NSNull()])
        }
        let names = driver.appNames()
        guard let main = wins.first(where: { $0.title.map(names.contains) ?? false }) else {
            throw abort(cmd, .unavailable, "main_window_missing", ["room": room])
        }
        // The chat list: the table inside a scroll area that also holds a scroll bar.
        var area: UINode?
        var table: UINode?
        for v in walk(main.node, maxNodes: 600, maxDepth: 8, prune: { listRoles.contains($0.role ?? "") }).visited
        where v.node.role == "AXScrollArea" {
            if let t = v.node.children.first(where: { $0.role == "AXTable" }) { area = v.node; table = t; break }
        }
        guard let area, let table, let bar = area.children.first(where: { $0.role == "AXScrollBar" }) else {
            throw abort(cmd, .unavailable, "chat_list_missing", ["room": room])
        }
        let rows = table.children.filter { $0.role == "AXRow" }
        let hits = rows.enumerated().filter { rowTitle($0.element) == room }
        guard hits.count == 1 else {
            throw abort(cmd, .roomNotUnique, "room_not_unique", ["room": room, "matches": hits.count, "in": "chat_list"])
        }
        let row = hits[0].element
        func visible() -> Bool {
            guard let r = row.frame, let a = area.frame else { return false }
            return a.contains(CGPoint(x: r.midX, y: r.midY))
        }
        var value = Double(hits[0].offset) / Double(max(rows.count - 1, 1))
        var tries = 0
        while !visible() && tries < 12 {
            _ = bar.setNumberValue(value)
            clock.sleep(0.12)
            if let r = row.frame, let a = area.frame { value += r.midY < a.midY ? -0.03 : 0.03 }
            value = min(max(value, 0), 1)
            tries += 1
        }
        guard visible(), let r = row.frame, let wf = main.node.frame else {
            throw abort(cmd, .unavailable, "row_not_visible", ["room": room])
        }
        let local = CGPoint(x: r.midX - wf.minX, y: r.midY - wf.minY)
        let scale = driver.backingScale(of: wf) ?? 2
        return outcome(cmd, .ok, "located", [
            "room": room,
            "main_window_id": main.windowID.map { Int($0) } ?? NSNull(),
            "point": ["x": Int(local.x), "y": Int(local.y)],
            "screenshot_point": ["x": Int(local.x * scale), "y": Int(local.y * scale)],
            "scale": scale,
        ])
    }

    /// A PNG of the bound room window, taken without raising it.
    func shot(_ room: String, _ window: UInt32, _ out: String?) throws -> Outcome {
        let cmd = "shot"
        _ = try resolve(cmd, room, window, needs: [])
        let path = out ?? (config.stateDir as NSString)
            .appendingPathComponent("shots/\(fnv1a64(room))-\(Int(clock.now())).png")
        try? FileManager.default.createDirectory(atPath: (path as NSString).deletingLastPathComponent,
                                                 withIntermediateDirectories: true)
        guard driver.capture(windowID: window, to: path) else {
            throw abort(cmd, .unavailable, "capture_failed",
                        ["room": room, "reason": "screencapture wrote nothing; Screen Recording may be missing"])
        }
        return outcome(cmd, .ok, "captured", ["room": room, "window_id": Int(window), "path": path])
    }
}
