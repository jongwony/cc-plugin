import Foundation

// Hand-rolled runner: no XCTest dependency, so it builds with the command line tools alone.
var failed: [String] = []
var current = ""

func expect(_ cond: Bool, _ msg: String, line: Int = #line) {
    if !cond { failed.append("\(current) (line \(line)): \(msg)") }
}

func test(_ name: String, _ body: () throws -> Void) {
    current = name
    let before = failed.count
    do { try body() } catch { failed.append("\(name): threw \(error)") }
    print(failed.count == before ? "ok   \(name)" : "FAIL \(name)")
}

let roomTitle = "Test Room"
let windowID: UInt32 = 4242

struct Env {
    let engine: Engine
    let driver: FakeDriver
    let room: FakeRoom
    let clock: FakeClock
    let store: RoomStore
    var config: Config
}

func makeEnv(messages: [String] = ["hello", "how are you"], bubblesSettable: Bool = false,
             configure: (inout Config) -> Void = { _ in }) -> Env {
    let dir = (NSTemporaryDirectory() as NSString).appendingPathComponent("kakao-test-\(UUID().uuidString)")
    var config = Config(stateDir: dir, bundleID: "test.bundle", minInterval: 20, confirmTimeout: 2)
    config.pollInterval = 0.5
    configure(&config)
    let room = FakeRoom(messages: messages, bubblesSettable: bubblesSettable)
    room.window.title = roomTitle
    let driver = FakeDriver()
    driver.wins = [
        WindowInfo(windowID: 1, title: "Other Room", isFocused: false, node: FakeRoom(messages: ["x"]).window),
        WindowInfo(windowID: windowID, title: roomTitle, isFocused: false, node: room.window),
    ]
    let clock = FakeClock()
    let store = RoomStore(stateDir: dir)
    return Env(engine: Engine(driver: driver, store: store, clock: clock, config: config),
               driver: driver, room: room, clock: clock, store: store, config: config)
}

@discardableResult
func handshake(_ e: Env, hints: Hints = Hints()) -> Outcome {
    let o = e.engine.run(.handshake(room: roomTitle, hints: hints))
    expect(o.exit == .ok, "handshake should succeed, got \(o.json)")
    return o
}

func send(_ e: Env, _ text: String?, acceptEdited: Bool = false) -> Outcome {
    e.engine.run(.send(room: roomTitle, window: windowID, text: text, acceptEdited: acceptEdited))
}

func noFile(_ p: String) throws -> String { throw NSError(domain: "test", code: 1) }

// MARK: arguments

test("args: send with text parses") {
    guard case .run(.send(let r, let w, let t, let a), let c) =
        parseArguments(["send", "--room", "R", "--window", "7", "--text", "hi"], env: ["HOME": "/h"], readFile: noFile)
    else { return expect(false, "did not parse") }
    expect(r == "R" && w == 7 && t == "hi" && !a, "values")
    expect(c.stateDir == "/h/.local/state/kakao", "default state dir")
    expect(c.minInterval == defaultMinInterval, "default interval")
}

test("args: usage errors") {
    let cases: [[String]] = [
        ["send", "--window", "1", "--text", "x"],                  // no room
        ["send", "--room", "R", "--window", "abc"],                // bad window
        ["draft", "--room", "R", "--window", "1"],                 // no text
        ["read", "--room", "R", "--window", "1", "--text", "x"],   // text on read
        ["send", "--room", "R", "--window", "1", "--text", "a", "--text-file", "f"],
        ["send", "--room", "R", "--window", "1", "--text", "   "], // empty text
        ["frobnicate", "--room", "R"],
        ["handshake", "--room"],
        ["send", "--room", "R", "--window", "1", "--min-interval", "-1"],
    ]
    for argv in cases {
        if case .usage = parseArguments(argv, env: [:], readFile: noFile) { continue }
        expect(false, "expected usage error for \(argv)")
    }
}

test("args: help, text file, repeatable send label, env interval") {
    if case .help = parseArguments([], env: [:], readFile: noFile) {} else { expect(false, "empty → help") }
    if case .help = parseArguments(["send", "--help"], env: [:], readFile: noFile) {} else { expect(false, "--help") }
    guard case .run(.draft(_, _, let t), let c) = parseArguments(
        ["draft", "--room", "R", "--window", "1", "--text-file", "-"],
        env: ["KAKAO_MIN_INTERVAL": "45"], readFile: { _ in "line1\nline2" }) else { return expect(false, "draft") }
    expect(t == "line1\nline2" && c.minInterval == 45, "text file and env interval")
    guard case .run(.handshake(_, let h), _) = parseArguments(
        ["handshake", "--room", "R", "--send-label", "A", "--send-label", "B", "--input-identifier", "in"],
        env: [:], readFile: noFile) else { return expect(false, "handshake") }
    expect(h.sendLabels == ["A", "B"] && h.inputIdentifier == "in", "hints")
}

// MARK: handshake

test("handshake: one window, all elements → ok, state written") {
    let e = makeEnv()
    let o = handshake(e)
    expect(o.body["window_id"] as? Int == Int(windowID), "window id in output")
    expect(o.body["kakao_version"] as? String == "9.9.9 (1)", "version")
    let checks = o.body["checks"] as? [String: String] ?? [:]
    expect(checks["input"] == "ok" && checks["send_button"] == "ok" && checks["message_list"] == "ok", "checks \(checks)")
    expect(checks["cg_cross_check"] == "unreadable", "cg unreadable when names nil")
    expect(e.store.load(roomTitle)?.windowID == windowID, "state file")
}

test("handshake: zero or two windows with the title → exit 10") {
    let e = makeEnv()
    e.driver.wins.append(WindowInfo(windowID: 9, title: roomTitle, isFocused: false, node: FakeRoom(messages: []).window))
    expect(e.engine.run(.handshake(room: roomTitle, hints: Hints())).exit == .roomNotUnique, "two")
    expect(e.engine.run(.handshake(room: "Nope", hints: Hints())).exit == .roomNotUnique, "zero")
    let f = makeEnv()
    f.driver.cg = 2
    expect(f.engine.run(.handshake(room: roomTitle, hints: Hints())).exit == .roomNotUnique, "cg sees two")
}

test("handshake: unknown button label → exit 3 with candidates; hint fixes it and persists") {
    let e = makeEnv()
    e.room.button.title = nil
    e.room.button.nodeDescription = "Submit"
    let o = e.engine.run(.handshake(room: roomTitle, hints: Hints()))
    expect(o.exit == .handshakeIncomplete, "exit 3, got \(o.json)")
    expect((o.body["missing"] as? [String]) == ["send_button"], "missing list")
    let cands = (o.body["candidates"] as? [String: Any])?["send_button"] as? [[String: Any]] ?? []
    expect(cands.contains { $0["description"] as? String == "Submit" }, "candidate shows the label")
    expect(e.store.load(roomTitle) == nil, "no state on incomplete handshake")
    handshake(e, hints: Hints(sendLabels: ["Submit"]))
    expect(e.store.load(roomTitle)?.hints.sendLabels == ["Submit"], "hint persisted")
    e.room.wireWorkingSend()
    expect(send(e, "uses the persisted hint").exit == .ok, "send with persisted hint")
}

test("handshake: settable bubbles inside the table are not taken for the input box") {
    let e = makeEnv(bubblesSettable: true)
    handshake(e)
}

test("handshake: missing window id → exit 3") {
    let e = makeEnv()
    e.driver.wins = [WindowInfo(windowID: nil, title: roomTitle, isFocused: false, node: e.room.window)]
    let o = e.engine.run(.handshake(room: roomTitle, hints: Hints()))
    expect(o.exit == .handshakeIncomplete && (o.body["missing"] as? [String])?.first == "window_id", o.json)
}

test("unavailable: not trusted / not running → exit 9") {
    let e = makeEnv()
    e.driver.state = .notTrusted
    expect(e.engine.run(.handshake(room: roomTitle, hints: Hints())).exit == .unavailable, "not trusted")
    e.driver.state = .notRunning
    expect(e.engine.run(.handshake(room: roomTitle, hints: Hints())).exit == .unavailable, "not running")
}

// MARK: re-check on every command

test("re-check: no handshake, other id, title change, version change, window gone → exit 4, nothing touched") {
    let e = makeEnv()
    expect(send(e, "x").exit == .handshakeAgain, "no handshake")
    handshake(e)
    expect(e.engine.run(.draft(room: roomTitle, window: 1, text: "x")).exit == .handshakeAgain, "other window id")
    e.driver.wins[1] = WindowInfo(windowID: windowID, title: "Renamed", isFocused: false, node: e.room.window)
    expect(send(e, "x").exit == .handshakeAgain, "title mismatch")
    e.driver.wins[1] = WindowInfo(windowID: windowID, title: roomTitle, isFocused: false, node: e.room.window)
    e.driver.state = .running(version: "10.0 (2)", frontmost: false)
    let v = send(e, "x")
    expect(v.exit == .handshakeAgain && v.body["reason"] as? String == "app_version_changed", v.json)
    e.driver.state = .running(version: "9.9.9 (1)", frontmost: false)
    e.driver.wins.removeLast()
    expect(send(e, "x").exit == .handshakeAgain, "window gone")
    expect(e.room.input.setCount == 0 && e.room.button.pressCount == 0, "nothing set or pressed")
}

// MARK: draft

test("draft: empty input → drafted and recorded") {
    let e = makeEnv()
    handshake(e)
    let o = e.engine.run(.draft(room: roomTitle, window: windowID, text: "a question"))
    expect(o.exit == .ok && o.body["status"] as? String == "drafted", o.json)
    expect(e.room.input.stringValue == "a question", "value set")
    expect(e.store.load(roomTitle)?.draftText == "a question", "draft recorded")
    expect(e.room.button.pressCount == 0, "draft never presses")
    let again = e.engine.run(.draft(room: roomTitle, window: windowID, text: "a question"))
    expect(again.body["status"] as? String == "already_drafted" && e.room.input.setCount == 1, "idempotent")
}

test("draft: someone else's text in the input → exit 5, untouched") {
    let e = makeEnv()
    handshake(e)
    e.room.input.stringValue = "half typed by a pers"
    let o = e.engine.run(.draft(room: roomTitle, window: windowID, text: "mine"))
    expect(o.exit == .inputBusy, o.json)
    expect(e.room.input.stringValue == "half typed by a pers" && e.room.input.setCount == 0, "untouched")
}

test("draft: read-back differs → exit 6, nothing recorded once the own result is gone") {
    let e = makeEnv()
    handshake(e)
    e.room.input.onSet = { n, t in n.stringValue = String(t.prefix(3)); return true }
    let o = e.engine.run(.draft(room: roomTitle, window: windowID, text: "abcdef"))
    expect(o.exit == .notVerified && o.body["status"] as? String == "draft_mismatch", o.json)
    expect(e.room.input.stringValue == "" && e.room.input.setCount == 2, "set, then own result removed")
    expect(e.store.load(roomTitle)?.draftText == nil, "not recorded")
}

test("presence: app frontmost, this window focused, recent input → exit 5 person_active") {
    let e = makeEnv()
    handshake(e)
    e.driver.state = .running(version: "9.9.9 (1)", frontmost: true)
    e.driver.wins[1] = WindowInfo(windowID: windowID, title: roomTitle, isFocused: true, node: e.room.window)
    e.driver.idle = 0.4
    let o = e.engine.run(.draft(room: roomTitle, window: windowID, text: "x"))
    expect(o.exit == .inputBusy && o.body["status"] as? String == "person_active", o.json)
    expect(e.room.input.setCount == 0, "untouched")
    e.driver.idle = 30
    expect(e.engine.run(.draft(room: roomTitle, window: windowID, text: "x")).exit == .ok, "idle long enough")
}

// MARK: send

test("send --text: drafted, pressed once, confirmed") {
    let e = makeEnv()
    handshake(e)
    e.room.wireWorkingSend()
    let o = send(e, "first message")
    expect(o.exit == .ok && o.body["status"] as? String == "sent", o.json)
    expect(e.room.button.pressCount == 1, "pressed once")
    expect(e.store.load(roomTitle)?.lastSendAt == e.clock.t, "send stamped")
    expect(e.store.load(roomTitle)?.draftText == nil, "draft record cleared")
}

test("send: press does nothing → exit 7, never pressed twice, input left") {
    let e = makeEnv()
    handshake(e)
    e.room.button.onPress = { true }
    let o = send(e, "lost?")
    expect(o.exit == .sendUnconfirmed, o.json)
    expect(e.room.button.pressCount == 1, "one press only")
    expect(e.room.input.stringValue == "lost?", "input untouched after press")
    expect(o.body["input_cleared"] as? Bool == false && o.body["text_appeared"] as? Bool == false, "observations")
}

test("send: same text already the last bubble is not taken as confirmation") {
    let e = makeEnv(messages: ["ok"])
    handshake(e)
    e.room.button.onPress = { [unowned room = e.room] in room.input.stringValue = ""; return true }
    let o = send(e, "ok")
    expect(o.exit == .sendUnconfirmed && o.body["text_appeared"] as? Bool == false, o.json)
}

test("send: a long text shown cut with an ellipsis still confirms") {
    let e = makeEnv()
    handshake(e)
    let long = String(repeating: "긴 문장입니다. ", count: 40)
    e.room.wireWorkingSend(shown: { String($0.prefix(60)) + "…" })
    let o = send(e, long)
    expect(o.exit == .ok, o.json)
}

test("send without --text: recorded draft → sent; edited → exit 8; --accept-edited → sent") {
    let e = makeEnv()
    handshake(e)
    e.room.wireWorkingSend()
    _ = e.engine.run(.draft(room: roomTitle, window: windowID, text: "draft one"))
    expect(send(e, nil).exit == .ok, "recorded draft sent")

    e.clock.t += 100
    _ = e.engine.run(.draft(room: roomTitle, window: windowID, text: "draft two"))
    e.room.input.stringValue = "draft two, edited by a person"
    let changed = send(e, nil)
    expect(changed.exit == .draftChanged, changed.json)
    expect(e.room.button.pressCount == 1, "no press on changed draft")
    expect(send(e, nil, acceptEdited: true).exit == .ok, "accept edited")

    e.clock.t += 100
    expect(send(e, nil).exit == .draftChanged, "empty input → no_draft")
}

test("send: per-room interval waits before pressing, then re-checks") {
    let e = makeEnv()
    handshake(e)
    e.room.wireWorkingSend()
    expect(send(e, "one").exit == .ok, "first")
    e.clock.t += 5
    var boxDuringWait: String?
    e.clock.onSleep = { [unowned room = e.room] in boxDuringWait = room.input.stringValue }
    let o = send(e, "two")
    expect(boxDuringWait == "", "nothing drafted while waiting, box was \(boxDuringWait ?? "nil")")
    expect(o.exit == .ok, o.json)
    expect(e.clock.slept.first == 15, "waited the remaining 15 s, slept \(e.clock.slept)")
    expect(o.body["waited_seconds"] as? Double == 15, "reported wait")
}

test("send: title changes during the interval wait → exit 4, not pressed") {
    let e = makeEnv()
    handshake(e)
    e.room.wireWorkingSend()
    expect(send(e, "one").exit == .ok, "first")
    e.clock.onSleep = { [unowned d = e.driver, room = e.room] in
        d.wins[1] = WindowInfo(windowID: windowID, title: "Someone else", isFocused: false, node: room.window)
    }
    let o = send(e, "two")
    expect(o.exit == .handshakeAgain, o.json)
    expect(e.room.button.pressCount == 1, "second not pressed")
    expect(e.room.input.stringValue == "", "second never drafted")
}

test("send: button disabled after drafting → exit 6, own draft cleared") {
    let e = makeEnv()
    handshake(e)
    e.room.button.isEnabled = false
    let o = send(e, "will not go")
    expect(o.exit == .notVerified && o.body["cleared_own_draft"] as? Bool == true, o.json)
    expect(e.room.input.stringValue == "", "own text removed")
    expect(e.room.button.pressCount == 0, "not pressed")
}

test("send: the button turns enabled a moment after the box is filled → waits, then sends") {
    let e = makeEnv()
    handshake(e)
    e.room.wireWorkingSend()
    e.room.button.isEnabled = false
    var filledAt: Double?
    e.room.input.onSet = { [unowned clock = e.clock] n, t in n.stringValue = t; filledAt = t.isEmpty ? nil : clock.t; return true }
    e.clock.onSleep = { [unowned room = e.room, unowned clock = e.clock] in
        if let f = filledAt, clock.t - f >= 0.5 { room.button.isEnabled = true }
    }
    let o = send(e, "late button")
    expect(o.exit == .ok && e.room.button.pressCount == 1, o.json)
    expect(e.clock.slept.prefix(5).allSatisfy { $0 == 0.1 }, "polled in 0.1 s steps: \(e.clock.slept.prefix(6))")
}

test("send: the button never turns enabled → exit 6 after the enable wait, own draft cleared") {
    let e = makeEnv()
    handshake(e)
    e.room.button.isEnabled = false
    let start = e.clock.t
    let o = send(e, "never")
    expect(o.exit == .notVerified && o.body["cleared_own_draft"] as? Bool == true, o.json)
    expect(e.clock.t - start >= 3.0 && e.room.button.pressCount == 0, "waited \(e.clock.t - start) s, not pressed")
}

test("send: an AX error from the press does not decide; the appearing text does") {
    let e = makeEnv()
    handshake(e)
    e.room.wireWorkingSend()
    let working = e.room.button.onPress!
    e.room.button.onPress = { _ = working(); return false }
    let o = send(e, "pressed anyway")
    expect(o.exit == .ok && o.body["press_reported"] as? Bool == false, o.json)
}

test("send: interval survives a new handshake") {
    let e = makeEnv()
    handshake(e)
    e.room.wireWorkingSend()
    expect(send(e, "one").exit == .ok, "first")
    handshake(e)
    _ = send(e, "two")
    expect(e.clock.slept.first == 20, "waited full interval after re-handshake, slept \(e.clock.slept)")
}

// MARK: clear

test("clear: only the recorded draft is removed") {
    let e = makeEnv()
    handshake(e)
    _ = e.engine.run(.draft(room: roomTitle, window: windowID, text: "mine"))
    expect(e.engine.run(.clear(room: roomTitle, window: windowID)).body["status"] as? String == "cleared", "cleared")
    expect(e.room.input.stringValue == "", "empty")
    e.room.input.stringValue = "a person's text"
    let o = e.engine.run(.clear(room: roomTitle, window: windowID))
    expect(o.exit == .inputBusy && e.room.input.stringValue == "a person's text", o.json)
    e.room.input.stringValue = ""
    expect(e.engine.run(.clear(room: roomTitle, window: windowID)).body["status"] as? String == "nothing_to_clear", "nothing")
}

// MARK: read

test("read: marker returns only newer rows; unknown marker returns all") {
    let e = makeEnv(messages: ["a", "b", "c"])
    handshake(e)
    let first = e.engine.run(.read(room: roomTitle, window: windowID, after: nil, limit: 30))
    let m = first.body["marker"] as? String ?? ""
    expect((first.body["messages"] as? [[String: Any]])?.count == 3, "all three")
    e.room.append("d")
    e.room.append("e…")
    let next = e.engine.run(.read(room: roomTitle, window: windowID, after: m, limit: 30))
    let msgs = next.body["messages"] as? [[String: Any]] ?? []
    expect(msgs.map { $0["text"] as? String ?? "" } == ["d", "e…"], "only new: \(msgs)")
    expect(msgs.last?["truncated"] as? Bool == true, "ellipsis flagged")
    expect(next.body["marker_found"] as? Bool == true, "found")
    let lost = e.engine.run(.read(room: roomTitle, window: windowID, after: "v2.3.0.ffffffffffffffff", limit: 2))
    expect(lost.body["marker_found"] as? Bool == false && lost.body["more"] as? String == "older", lost.json)
}

test("read: without --after, rows beyond --limit are reported as older") {
    let e = makeEnv(messages: ["a", "b", "c", "d"])
    handshake(e)
    let o = e.engine.run(.read(room: roomTitle, window: windowID, after: nil, limit: 2))
    let texts = (o.body["messages"] as? [[String: Any]] ?? []).map { $0["text"] as? String ?? "" }
    expect(texts == ["c", "d"] && o.body["more"] as? String == "older", o.json)
}

test("read: a read counter or time label changing later does not lose the marker") {
    let e = makeEnv(messages: [])
    for t in ["a", "b", "c"] { e.room.append(t, labels: ["1", "오후 3:12"]) }
    handshake(e)
    let m = e.engine.run(.read(room: roomTitle, window: windowID, after: nil, limit: 30)).body["marker"] as? String ?? ""
    for n in e.room.labelNodes(row: 2) where n.stringValue == "1" { n.stringValue = "" }
    e.room.labelNodes(row: 1)[1].stringValue = "오후 3:13"
    e.room.append("d", labels: ["1"])
    let o = e.engine.run(.read(room: roomTitle, window: windowID, after: m, limit: 30))
    let msgs = o.body["messages"] as? [[String: Any]] ?? []
    expect(o.body["marker_found"] as? Bool == true && msgs.map { $0["text"] as? String ?? "" } == ["d"], o.json)
    expect(msgs.first?["labels"] as? [String] == ["1"], "labels kept apart from the text")
}

test("read: paging through repeated rows loses none") {
    let e = makeEnv(messages: ["a"])
    handshake(e)
    var m = e.engine.run(.read(room: roomTitle, window: windowID, after: nil, limit: 30)).body["marker"] as? String ?? ""
    let added = ["ㅋㅋ", "ㅋㅋ", "ㅋㅋ", "ㅋㅋ", "ㅋㅋ", "z"]
    for t in added { e.room.append(t) }
    var seen: [String] = []
    for _ in 0..<6 {
        let o = e.engine.run(.read(room: roomTitle, window: windowID, after: m, limit: 2))
        seen += (o.body["messages"] as? [[String: Any]] ?? []).map { $0["text"] as? String ?? "" }
        m = o.body["marker"] as? String ?? ""
        if o.body["limited"] as? Bool != true { break }
    }
    expect(seen == added, "paged: \(seen)")
}

test("read: more new rows than --limit pages forward without losing any") {
    let e = makeEnv(messages: ["a", "b", "c"])
    handshake(e)
    var m = e.engine.run(.read(room: roomTitle, window: windowID, after: nil, limit: 30)).body["marker"] as? String ?? ""
    for t in ["n1", "n2", "n3", "n4", "n5"] { e.room.append(t) }
    var seen: [String] = []
    for _ in 0..<4 {
        let o = e.engine.run(.read(room: roomTitle, window: windowID, after: m, limit: 2))
        seen += (o.body["messages"] as? [[String: Any]] ?? []).map { $0["text"] as? String ?? "" }
        m = o.body["marker"] as? String ?? ""
        if o.body["limited"] as? Bool != true { break }
    }
    expect(seen == ["n1", "n2", "n3", "n4", "n5"], "paged: \(seen)")
}

test("marker: recorded position wins; shorter tails and the earliest match when the top moved") {
    let rows = ["x", "y", "x", "y"].map { Message(texts: [$0]) }
    let three = marker(for: [Message(texts: ["q"]), Message(texts: ["x"]), Message(texts: ["y"])])
    expect(messages(after: three, in: rows)?.rows.count == 2, "q left the loaded rows: placed by its last rows x,y")
    expect(messages(after: marker(for: [Message(texts: ["q"])]), in: rows) == nil, "no row of the marker is loaded")
    let two = marker(for: Array(rows.prefix(2)))
    expect(two.hasPrefix("v2.2.") && two.split(separator: "-").count == 2, "end=2, two row hashes: \(two)")
    expect(messages(after: two, in: rows)?.rows.count == 2, "recorded position, not the latest occurrence")
    // An older row loaded at the top moves every index by one: x,y now ends at 3 and at 5.
    let grown = [Message(texts: ["w"])] + rows
    let found = messages(after: two, in: grown)
    expect(found?.rows.map(\.text) == ["x", "y"] && found?.ambiguous == true, "nearest: \(String(describing: found))")
    expect(messages(after: marker(for: []), in: rows)?.rows.count == 4, "empty-list marker returns all")
    expect(messages(after: "garbage", in: rows) == nil, "malformed")
}

test("read: rows leaving the top as new ones arrive (only near-screen rows are loaded)") {
    let e = makeEnv(messages: ["a", "b", "c", "d"])
    handshake(e)
    let m = e.engine.run(.read(room: roomTitle, window: windowID, after: nil, limit: 30)).body["marker"] as? String ?? ""
    e.room.table.children.removeFirst(2)       // a, b scrolled out of the loaded rows
    e.room.append("e")
    e.room.append("f")
    let o = e.engine.run(.read(room: roomTitle, window: windowID, after: m, limit: 30))
    let texts = (o.body["messages"] as? [[String: Any]] ?? []).map { $0["text"] as? String ?? "" }
    expect(o.body["marker_found"] as? Bool == true && texts == ["e", "f"], o.json)
}

test("marker: with the top shifted and repeated rows, rows repeat rather than go missing") {
    let start = ["a", "ㅋ", "ㅋ", "ㅋ"].map { Message(texts: [$0]) }
    let m = marker(for: start)
    let shifted = ["ㅋ", "ㅋ", "ㅋ", "ㅋ", "ㅋ"].map { Message(texts: [$0]) }   // a gone, two new ㅋ
    let found = messages(after: m, in: shifted)
    expect((found?.rows.count ?? 0) >= 2 && found?.ambiguous == true, "\(String(describing: found))")
}

test("send: marker lost after the press and an identical bubble already there → not confirmed") {
    let e = makeEnv(messages: ["a", "ok"])
    handshake(e)
    e.room.button.onPress = { [unowned room = e.room] in
        room.input.stringValue = ""
        room.table.children.removeFirst()     // the list shifts; nothing new arrives
        return true
    }
    let o = send(e, "ok")
    expect(o.exit == .sendUnconfirmed && o.body["text_appeared"] as? Bool == false, o.json)
}

test("send: a counter change on the last bubble does not hide a real send") {
    let e = makeEnv(messages: [])
    e.room.append("ok", labels: ["1"])
    handshake(e)
    e.room.button.onPress = { [unowned room = e.room] in
        for n in room.labelNodes(row: 0) { n.stringValue = "" }
        room.append(room.input.stringValue ?? "", labels: ["1"])
        room.input.stringValue = ""
        return true
    }
    expect(send(e, "ok").exit == .ok, "sent")
}

test("handshake: a later handshake without hints keeps the stored ones") {
    let e = makeEnv()
    e.room.button.title = "Submit"
    handshake(e, hints: Hints(sendLabels: ["Submit"]))
    let o = handshake(e)
    expect(e.store.load(roomTitle)?.hints.sendLabels == ["Submit"], o.json)
}

test("handshake: a long history before the input box does not hide it") {
    let e = makeEnv(messages: (0..<5000).map { "m\($0)" })
    handshake(e)
}

test("presence: unknown idle time while that window has focus → person_active") {
    let e = makeEnv()
    handshake(e)
    e.driver.state = .running(version: "9.9.9 (1)", frontmost: true)
    e.driver.wins[1] = WindowInfo(windowID: windowID, title: roomTitle, isFocused: true, node: e.room.window)
    e.driver.idle = nil
    let o = e.engine.run(.draft(room: roomTitle, window: windowID, text: "x"))
    expect(o.body["status"] as? String == "person_active" && e.room.input.setCount == 0, o.json)
}

test("draft: a mismatched result is removed as this tool's own") {
    let e = makeEnv()
    handshake(e)
    e.room.input.onSet = { n, t in n.stringValue = t.isEmpty ? "" : String(t.prefix(3)); return true }
    let o = e.engine.run(.draft(room: roomTitle, window: windowID, text: "abcdef"))
    expect(o.exit == .notVerified && o.body["input_left"] as? Bool == false, o.json)
    expect(e.room.input.stringValue == "", "own result removed")
    e.room.input.onSet = { n, t in n.stringValue = String(t.prefix(3)) + (t.isEmpty ? "?" : ""); return true }
    let stuck = e.engine.run(.draft(room: roomTitle, window: windowID, text: "abcdef"))
    expect(stuck.body["input_left"] as? Bool == true, stuck.json)
    expect(e.store.load(roomTitle)?.draftText == e.room.input.stringValue, "what was left is recorded as own")
}

test("draft and clear compare the same way; text files lose one final newline") {
    let e = makeEnv()
    handshake(e)
    e.room.input.onSet = { n, t in n.stringValue = t.trimmingCharacters(in: .whitespaces); return true }
    expect(e.engine.run(.draft(room: roomTitle, window: windowID, text: "abc  ")).exit == .ok, "drafted")
    e.room.input.onSet = nil
    expect(e.engine.run(.clear(room: roomTitle, window: windowID)).body["status"] as? String == "cleared", "own draft cleared")
    guard case .run(.send(_, _, let t, _), _) = parseArguments(
        ["send", "--room", "R", "--window", "1", "--text-file", "f"], env: [:], readFile: { _ in "two\nlines\n" })
    else { return expect(false, "parse") }
    expect(t == "two\nlines", "one final newline stripped: \(String(describing: t))")
}

test("args: --help as a --text value is text, not help") {
    guard case .run(.send(_, _, let t, _), _) = parseArguments(
        ["send", "--room", "R", "--window", "1", "--text", "--help"], env: [:], readFile: noFile)
    else { return expect(false, "parsed as help") }
    expect(t == "--help", "text kept")
}

test("json: output is one object with ok/status/exit/command") {
    let e = makeEnv()
    let o = e.engine.run(.read(room: roomTitle, window: windowID, after: nil, limit: 5))
    let obj = try JSONSerialization.jsonObject(with: Data(o.json.utf8)) as? [String: Any] ?? [:]
    expect(obj["ok"] as? Bool == false && obj["status"] as? String == "handshake_again", o.json)
    expect(obj["exit"] as? Int == 4 && obj["command"] as? String == "read", "fields")
}

print(failed.isEmpty ? "\nall tests passed" : "\n\(failed.count) failure(s):\n" + failed.joined(separator: "\n"))
exit(failed.isEmpty ? 0 : 1)
