import CoreGraphics
import Foundation

/// The chat-list row's title: the first non-empty static text, depth first, stopping there.
func rowTitle(_ row: UINode, depth: Int = 0) -> String? {
    if row.role == "AXStaticText", let v = row.stringValue, !v.isEmpty { return v }
    guard depth < 6 else { return nil }
    for c in row.children { if let t = rowTitle(c, depth: depth + 1) { return t } }
    return nil
}

extension Engine {
    /// Prepares opening a closed room: holds the app-wide open lease, checks the main window can
    /// be acted on (not minimized, on a display, its chat tab showing), finds exactly one chat-list
    /// row with the exact title and scrolls it into view. Opens nothing and returns no coordinate:
    /// the opener names the row through `query` (main window id, exact title) and clicks that element.
    func locate(_ room: String) throws -> Outcome {
        let cmd = "locate"
        _ = try runningVersion(cmd)
        let wins = try appWindows(cmd)
        let open = wins.filter { $0.title == room }
        if open.count > 1 {
            throw abort(cmd, .roomNotUnique, "room_not_unique",
                        ["room": room, "matches": open.count, "reason": "several open windows carry the title"])
        }
        if let w = open.first {
            try OpenLeaseStore(stateDir: config.stateDir).release(room)
            return outcome(cmd, .ok, "already_open", ["room": room, "window_id": w.windowID.map { Int($0) } ?? NSNull()])
        }
        if let held = try OpenLeaseStore(stateDir: config.stateDir)
            .acquire(room, now: clock.now(), ttl: config.openLeaseSeconds) {
            throw abort(cmd, .inputBusy, "open_busy", [
                "room": room, "holder": held.room, "retry_after_seconds": Int((held.expires - clock.now()).rounded(.up)),
                "reason": "another session is opening a room; retry after its handshake or the lease expiry",
            ])
        }
        let names = driver.appNames()
        guard let main = wins.first(where: { $0.title.map(names.contains) ?? false }), let mainID = main.windowID else {
            throw abort(cmd, .unavailable, "main_window_missing",
                        ["room": room, "reason": "KakaoTalk's main window (the chat list) is not open"])
        }
        if main.isMinimized {
            throw abort(cmd, .unavailable, "main_window_minimized",
                        ["room": room, "reason": "the main window is minimized; a person restores it"])
        }
        guard let mainFrame = main.node.frame, driver.isOnScreen(mainFrame) else {
            throw abort(cmd, .unavailable, "main_window_offscreen",
                        ["room": room, "reason": "the main window is not on a connected display"])
        }
        let header = main.node.children.first { $0.role == "AXStaticText" }?.stringValue
        guard let h = header, config.chatTabHeaders.contains(h) else {
            throw abort(cmd, .unavailable, "chat_tab_not_showing", [
                "room": room, "header": header ?? NSNull(),
                "reason": "the main window does not show its chat tab; a person switches it to 채팅",
            ])
        }
        // The chat list: the table inside a scroll area that also holds a scroll bar.
        var area: UINode?
        var table: UINode?
        for v in walk(main.node, maxNodes: 600, maxDepth: 8, prune: { listRoles.contains($0.role ?? "") }).visited
        where v.node.role == "AXScrollArea" {
            if let t = v.node.children.first(where: { $0.role == "AXTable" }) { area = v.node; table = t; break }
        }
        guard let area, let table, let bar = area.children.first(where: { $0.role == "AXScrollBar" }) else {
            throw abort(cmd, .unavailable, "chat_list_missing",
                        ["room": room, "reason": "no scrollable chat list was found in the main window"])
        }
        let rows = table.children.filter { $0.role == "AXRow" }
        let hits = rows.enumerated().filter { rowTitle($0.element) == room }
        guard hits.count == 1 else {
            throw abort(cmd, .roomNotUnique, "room_not_unique", [
                "room": room, "matches": hits.count, "in": "chat_list",
                "reason": hits.isEmpty ? "no chat-list row carries the title" : "several chat-list rows carry the title",
            ])
        }
        let row = hits[0].element
        func offset() -> Double? {
            guard let r = row.frame, let a = area.frame else { return nil }
            return a.contains(CGPoint(x: r.midX, y: r.midY)) ? 0 : Double(r.midY - a.midY)
        }
        // Start at the row's share of the list; then move by its pixel distance over the list's full height.
        var value = Double(hits[0].offset) / Double(max(rows.count - 1, 1))
        var tries = 0
        while offset() != 0 && tries < 8 {
            _ = bar.setNumberValue(value)
            clock.sleep(0.12)
            if let d = offset(), d != 0, let rh = row.frame?.height, let ah = area.frame?.height {
                let travel = max(Double(rh) * Double(rows.count) - Double(ah), 1)
                value = min(max(value + d / travel, 0), 1)
            }
            tries += 1
        }
        guard offset() == 0 else {
            throw abort(cmd, .unavailable, "row_not_visible",
                        ["room": room, "reason": "the row could not be scrolled into view"])
        }
        return outcome(cmd, .ok, "located", [
            "room": room,
            "main_window_id": Int(mainID),
            "query": ["window_id": Int(mainID), "text": room, "exact": true],
            "lease_seconds": Int(config.openLeaseSeconds),
        ])
    }

    /// A PNG of the bound room window, taken without raising it.
    func shot(_ room: String, _ window: UInt32, _ out: String?) throws -> Outcome {
        let cmd = "shot"
        _ = try resolve(cmd, room, window, needs: [])
        guard driver.canCaptureScreen() else {
            throw abort(cmd, .unavailable, "screen_recording_missing",
                        ["room": room, "reason": "Screen Recording is not granted to the app that runs this helper"])
        }
        let path = out ?? (config.stateDir as NSString)
            .appendingPathComponent("shots/\(fnv1a64(room))-\(Int(clock.now() * 1000)).png")
        if FileManager.default.fileExists(atPath: path) {
            throw abort(cmd, .usage, "out_exists", ["room": room, "path": path, "reason": "the output file already exists"])
        }
        do {
            try FileManager.default.createDirectory(atPath: (path as NSString).deletingLastPathComponent,
                                                    withIntermediateDirectories: true)
        } catch {
            throw abort(cmd, .unavailable, "capture_dir_failed", ["room": room, "path": path, "reason": "\(error)"])
        }
        if case .failed(let why) = driver.capture(windowID: window, to: path) {
            throw abort(cmd, .unavailable, "capture_failed", ["room": room, "path": path, "reason": why])
        }
        return outcome(cmd, .ok, "captured", ["room": room, "window_id": Int(window), "path": path])
    }
}
