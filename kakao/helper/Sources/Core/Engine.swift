import Foundation

struct Abort: Error { let outcome: Outcome }

struct Bound {
    let state: RoomState
    let window: WindowInfo
    let elements: ElementSet
    // Each accessor is used only after `resolve` confirmed that element.
    var input: UINode { elements.input.node! }
    var sendButton: UINode { elements.sendButton.node! }
    var list: UINode { elements.messageList.node! }
}

extension Hints {
    /// Fields given now replace stored ones; fields not given keep what an earlier handshake stored.
    func over(_ prior: Hints?) -> Hints {
        Hints(sendLabels: sendLabels ?? prior?.sendLabels,
              inputIdentifier: inputIdentifier ?? prior?.inputIdentifier,
              listIdentifier: listIdentifier ?? prior?.listIdentifier)
    }
}

public final class Engine {
    let driver: AppDriver
    let store: RoomStore
    let clock: Clock
    let config: Config

    public init(driver: AppDriver, store: RoomStore, clock: Clock, config: Config) {
        self.driver = driver
        self.store = store
        self.clock = clock
        self.config = config
    }

    public func run(_ c: Command) -> Outcome {
        do {
            switch c {
            case .handshake(let room, let hints): return try handshake(room, hints)
            case .read(let room, let w, let after, let limit): return try read(room, w, after, limit)
            case .draft(let room, let w, let text): return try draft(room, w, text)
            case .send(let room, let w, let text, let edited): return try send(room, w, text, edited)
            case .clear(let room, let w): return try clear(room, w)
            }
        } catch let a as Abort {
            return a.outcome
        } catch {
            return outcome(c.name, .unavailable, "error", ["reason": "\(error)"])
        }
    }

    // MARK: outcomes

    func outcome(_ cmd: String, _ exit: Exit, _ status: String, _ extra: [String: Any] = [:]) -> Outcome {
        var b = extra
        b["command"] = cmd
        b["ok"] = exit == .ok
        b["status"] = status
        b["exit"] = Int(exit.rawValue)
        return Outcome(exit: exit, body: b)
    }

    func abort(_ cmd: String, _ exit: Exit, _ status: String, _ extra: [String: Any] = [:]) -> Abort {
        Abort(outcome: outcome(cmd, exit, status, extra))
    }

    func again(_ cmd: String, _ room: String, _ reason: String, _ extra: [String: Any] = [:]) -> Abort {
        var e = extra
        e["room"] = room
        e["reason"] = reason
        return abort(cmd, .handshakeAgain, "handshake_again", e)
    }

    // MARK: shared checks

    func runningVersion(_ cmd: String) throws -> String {
        switch driver.appState() {
        case .notTrusted:
            throw abort(cmd, .unavailable, "not_trusted",
                        ["reason": "Accessibility permission is not granted to the app that runs this helper"])
        case .notRunning:
            throw abort(cmd, .unavailable, "app_not_running", ["bundle_id": config.bundleID])
        case .running(let v, _):
            return v
        }
    }

    /// Re-binds the window by id, then checks title, app version and the needed elements.
    func resolve(_ cmd: String, _ room: String, _ window: UInt32, needs: Set<String>) throws -> Bound {
        let version = try runningVersion(cmd)
        guard let state = store.load(room) else { throw again(cmd, room, "no_handshake") }
        guard state.windowID == window else {
            throw again(cmd, room, "window_differs_from_handshake", ["handshake_window_id": Int(state.windowID)])
        }
        guard state.appVersion == version else {
            throw again(cmd, room, "app_version_changed",
                        ["handshake_version": state.appVersion, "kakao_version": version])
        }
        guard let w = driver.windows().first(where: { $0.windowID == window }) else {
            throw again(cmd, room, "window_not_found")
        }
        guard w.title == room else {
            throw again(cmd, room, "title_mismatch", ["title": w.title ?? NSNull()])
        }
        let els = findElements(in: w.node, hints: state.hints, defaultSendLabels: config.defaultSendLabels)
        let missing = els.missing.filter { needs.contains($0) }
        guard missing.isEmpty else {
            throw again(cmd, room, "element_missing", ["missing": missing, "walk_truncated": els.truncated])
        }
        return Bound(state: state, window: w, elements: els)
    }

    /// A person may be using this very window: the app is frontmost, this window is its focused
    /// window, and there was input within the threshold — or the idle time cannot be read.
    func checkPresence(_ cmd: String, _ b: Bound) throws {
        guard case .running(_, let front) = driver.appState(), front, b.window.isFocused else { return }
        let idle = driver.secondsSinceLastInput()
        if let i = idle, i >= config.personIdleThreshold { return }
        throw abort(cmd, .inputBusy, "person_active", ["room": b.state.room, "idle_seconds": idle ?? NSNull()])
    }

    func mutate(_ room: String, locked: Bool = false, _ f: (inout RoomState) -> Void) throws {
        func body() throws {
            guard var s = store.load(room) else { return }
            f(&s)
            try store.save(s)
        }
        if locked { try body() } else { try store.withLock(room, body) }
    }

    /// True when the input already holds `text` as this tool's recorded draft; throws when it holds anything else.
    func inputIsOwnDraftOrEmpty(_ cmd: String, _ b: Bound, _ text: String) throws -> Bool {
        let want = normalize(text)
        let cur = normalize(b.input.stringValue ?? "")
        if cur.isEmpty { return false }
        if cur == want, let rec = b.state.draftText, normalize(rec) == want { return true }
        throw abort(cmd, .inputBusy, "input_busy", ["room": b.state.room, "input_length": cur.count])
    }

    /// Puts `text` into an empty input box and reads it back. Returns "drafted" or "already_drafted".
    /// On a mismatch, whatever the set left in the box is this tool's: it is removed, or recorded as
    /// this tool's draft so `clear` can remove it.
    func placeDraft(_ cmd: String, _ b: Bound, _ text: String, locked: Bool = false) throws -> String {
        let room = b.state.room
        if try inputIsOwnDraftOrEmpty(cmd, b, text) { return "already_drafted" }
        let setReported = b.input.setStringValue(text)
        let back = b.input.stringValue ?? ""
        if normalize(back) == normalize(text) {
            try mutate(room, locked: locked) { $0.draftText = text }
            return "drafted"
        }
        var cleared = normalize(back).isEmpty
        if !cleared {
            cleared = b.input.setStringValue("") && normalize(b.input.stringValue ?? "").isEmpty
            let left = cleared ? nil : (b.input.stringValue ?? back)
            try mutate(room, locked: locked) { $0.draftText = left }
        }
        throw abort(cmd, .notVerified, "draft_mismatch",
                    ["room": room, "set_reported": setReported, "input_left": !cleared])
    }

    /// For `send` without text: the input must hold this tool's recorded draft, or any text with `acceptEdited`.
    func existingDraft(_ cmd: String, _ b: Bound, acceptEdited: Bool) throws -> String {
        let cur = b.input.stringValue ?? ""
        guard !normalize(cur).isEmpty else { throw abort(cmd, .draftChanged, "no_draft", ["room": b.state.room]) }
        let rec = b.state.draftText
        if !acceptEdited && (rec.map { normalize($0) != normalize(cur) } ?? true) {
            throw abort(cmd, .draftChanged, "draft_changed",
                        ["room": b.state.room, "input_length": normalize(cur).count, "draft_recorded": rec != nil])
        }
        return cur
    }

    // MARK: commands

    func handshake(_ room: String, _ given: Hints) throws -> Outcome {
        let cmd = "handshake"
        let version = try runningVersion(cmd)
        let hints = given.over(store.load(room)?.hints)
        let wins = driver.windows()
        let matches = wins.filter { $0.title == room }
        guard matches.count == 1 else {
            throw abort(cmd, .roomNotUnique, "room_not_unique",
                        ["room": room, "matches": matches.count, "window_titles": wins.compactMap(\.title)])
        }
        let cg = driver.cgTitleCount(room)
        if let n = cg, n != 1 {
            throw abort(cmd, .roomNotUnique, "room_not_unique", ["room": room, "matches": 1, "cg_matches": n])
        }
        let w = matches[0]
        let els = findElements(in: w.node, hints: hints, defaultSendLabels: config.defaultSendLabels)
        var missing = els.missing
        if w.windowID == nil { missing.insert("window_id", at: 0) }
        var body: [String: Any] = [
            "room": room,
            "kakao_version": version,
            "hints": hints.asJSON,
            "checks": [
                "window_id": w.windowID == nil ? "missing" : "ok",
                "input": els.input.check,
                "send_button": els.sendButton.check,
                "message_list": els.messageList.check,
                "cg_cross_check": cg == nil ? "unreadable" : "ok",
            ],
        ]
        if let id = w.windowID { body["window_id"] = Int(id) }
        guard missing.isEmpty, let id = w.windowID else {
            body["missing"] = missing
            body["candidates"] = els.candidates
            body["walk_truncated"] = els.truncated
            throw abort(cmd, .handshakeIncomplete, "handshake_incomplete", body)
        }
        try store.withLock(room) {
            let prior = store.load(room)
            try store.save(RoomState(
                room: room, windowID: id, appVersion: version, hints: hints, handshakeAt: clock.now(),
                lastSendAt: prior?.lastSendAt,
                draftText: prior?.windowID == id ? prior?.draftText : nil))
        }
        return outcome(cmd, .ok, "ok", body)
    }

    func read(_ room: String, _ window: UInt32, _ after: String?, _ limit: Int) throws -> Outcome {
        let b = try resolve("read", room, window, needs: ["message_list"])
        let msgs = messages(in: b.list)
        var body: [String: Any] = [
            "room": room, "window_id": Int(window), "marker": marker(for: msgs), "total_rows": msgs.count,
        ]
        var picked = Array(msgs.suffix(limit))
        var more: String?
        if let a = after, let found = messages(after: a, in: msgs) {
            body["marker_found"] = true
            if found.ambiguous { body["marker_ambiguous"] = true }
            // Page forward: the oldest new rows first; the marker ends at the last row returned.
            picked = Array(found.rows.prefix(limit))
            if found.rows.count > limit {
                more = "newer"
                body["marker"] = marker(for: Array(msgs[..<(msgs.count - found.rows.count + limit)]))
            }
        } else {
            if after != nil { body["marker_found"] = false }
            if msgs.count > limit { more = "older" }
        }
        if let m = more {
            body["limited"] = true
            body["more"] = m
        }
        body["messages"] = picked.map(\.asJSON)
        return outcome("read", .ok, "ok", body)
    }

    func draft(_ room: String, _ window: UInt32, _ text: String) throws -> Outcome {
        let b = try resolve("draft", room, window, needs: ["input"])
        try checkPresence("draft", b)
        let status = try placeDraft("draft", b, text)
        return outcome("draft", .ok, status, ["room": room, "window_id": Int(window), "length": text.count])
    }

    func send(_ room: String, _ window: UInt32, _ text: String?, _ acceptEdited: Bool) throws -> Outcome {
        let cmd = "send"
        let all: Set<String> = ["input", "send_button", "message_list"]
        // Only when a wait lies ahead: fail fast now; the same checks run again under the lock.
        if let last = store.load(room)?.lastSendAt, last + config.minInterval > clock.now() {
            let b = try resolve(cmd, room, window, needs: all)
            try checkPresence(cmd, b)
            if let t = text { _ = try inputIsOwnDraftOrEmpty(cmd, b, t) } else { _ = try existingDraft(cmd, b, acceptEdited: acceptEdited) }
        }

        var bound: Bound?
        var expected = text ?? ""
        var waited = 0.0
        var before: [Message] = []
        var pressReported = false
        try store.withLock(room) {
            // Wait first, so a drafted text never sits in the box through the interval.
            if let last = store.load(room)?.lastSendAt {
                let w = last + config.minInterval - clock.now()
                if w > 0 { clock.sleep(w); waited = w }
            }
            let b = try resolve(cmd, room, window, needs: all)
            try checkPresence(cmd, b)
            var placedNow = false
            if let t = text {
                placedNow = try placeDraft(cmd, b, t, locked: true) == "drafted"
            } else {
                expected = try existingDraft(cmd, b, acceptEdited: acceptEdited)
            }
            let cur = b.input.stringValue ?? ""
            guard b.window.node.title == room else {
                throw again(cmd, room, "title_mismatch", ["title": b.window.node.title ?? NSNull()])
            }
            guard normalize(cur) == normalize(expected) else {
                throw abort(cmd, .inputBusy, "input_changed", ["room": room, "input_length": normalize(cur).count])
            }
            guard b.sendButton.isEnabled else {
                var cleared = false
                if placedNow {
                    cleared = b.input.setStringValue("") && normalize(b.input.stringValue ?? "").isEmpty
                    if cleared { try mutate(room, locked: true) { $0.draftText = nil } }
                }
                throw abort(cmd, .notVerified, "send_button_disabled", ["room": room, "cleared_own_draft": cleared])
            }
            before = messages(in: b.list)
            try mutate(room, locked: true) { $0.lastSendAt = clock.now() }
            pressReported = b.sendButton.press()
            bound = b
        }
        let b = bound!

        let deadline = clock.now() + config.confirmTimeout
        var inputCleared = false
        var appeared = false
        while true {
            inputCleared = normalize(b.input.stringValue ?? "").isEmpty
            appeared = sentAppeared(before: before, after: messages(in: b.list), sent: expected)
            if (inputCleared && appeared) || clock.now() >= deadline { break }
            clock.sleep(config.pollInterval)
        }
        let body: [String: Any] = [
            "room": room, "window_id": Int(window),
            "waited_seconds": (waited * 10).rounded() / 10,
            "press_reported": pressReported, "input_cleared": inputCleared, "text_appeared": appeared,
        ]
        guard inputCleared && appeared else { return outcome(cmd, .sendUnconfirmed, "send_unconfirmed", body) }
        try mutate(room) { $0.draftText = nil }
        return outcome(cmd, .ok, "sent", body)
    }

    func clear(_ room: String, _ window: UInt32) throws -> Outcome {
        let cmd = "clear"
        let b = try resolve(cmd, room, window, needs: ["input"])
        let cur = b.input.stringValue ?? ""
        if normalize(cur).isEmpty {
            try mutate(room) { $0.draftText = nil }
            return outcome(cmd, .ok, "nothing_to_clear", ["room": room])
        }
        guard let rec = b.state.draftText, normalize(cur) == normalize(rec) else {
            throw abort(cmd, .inputBusy, "not_own_text", ["room": room, "input_length": normalize(cur).count])
        }
        try checkPresence(cmd, b)
        _ = b.input.setStringValue("")
        guard normalize(b.input.stringValue ?? "").isEmpty else {
            throw abort(cmd, .notVerified, "clear_failed", ["room": room])
        }
        try mutate(room) { $0.draftText = nil }
        return outcome(cmd, .ok, "cleared", ["room": room])
    }
}
