import Foundation

// The agent-desktop adapter against a fake agent-desktop: the allowlist, the JSON-to-node
// mapping, and the shared Core run end to end on it. No process is started and no app is reached.
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

/// A KakaoTalk-shaped window as agent-desktop reports it: rows in a table without refs, an input
/// and a send button with refs. Clicking send appends the input's text as a row and empties it.
final class FakeAgentDesktop: ADRunner {
    var granted = true
    var input = ""
    var rows: [String] = ["hello", "how are you"]
    var title = "Test Room"
    var calls: [[String]] = []
    var clickWorks = true

    func tree() -> [String: Any] {
        let rowNodes: [[String: Any]] = rows.map { t in
            ["role": "row", "children": [["role": "textfield", "value": t], ["role": "statictext", "value": "오후 3:0\(rows.count % 10)"]]]
        }
        var button: [String: Any] = ["role": "button", "name": "전송", "ref_id": "@s1:e2", "available_actions": ["Click"]]
        if input.isEmpty { button["states"] = ["disabled"] }
        return ["role": "window", "name": title, "children": [
            ["role": "scrollarea", "children": [["role": "table", "children": rowNodes]]],
            ["role": "textfield", "ref_id": "@s1:e1", "available_actions": ["SetValue"], "value": input],
            button,
        ]]
    }

    func ok(_ data: Any) -> ADResult { ADResult(exit: 0, envelope: ["ok": true, "data": data]) }

    func run(_ argv: [String]) -> ADResult {
        calls.append(argv)
        switch argv[0] {
        case "permissions":
            return ok(["accessibility": ["state": granted ? "granted" : "denied"]])
        case "list-windows":
            return ok([["id": "w-4242", "title": title, "app_name": "KakaoTalk", "pid": 1, "is_focused": false]])
        case "snapshot":
            return ok(["snapshot_id": "s1", "complete": true, "tree": tree()])
        case "get":
            if argv[1] == "@s1:e1" { return ok(["property": "value", "value": input]) }
            return ok(["property": "states", "value": input.isEmpty ? ["disabled"] : [String]()])
        case "set-value":
            input = argv[2]
            return ok(["disposition": ["delivery": "delivered_verified"]])
        case "click":
            guard clickWorks, !input.isEmpty else { return ADResult(exit: 1, envelope: ["ok": false, "error": ["code": "ACTION_FAILED"]]) }
            rows.append(input)
            input = ""
            return ok(["disposition": ["delivery": "delivered_unverified"]])
        default:
            return ADResult(exit: 2, envelope: nil)
        }
    }
}

final class FakePolicy: SessionPolicy {
    var locked = false
    var idle: Double? = 100
    override var isRunning: Bool { true }
    override var appName: String? { "KakaoTalk" }
    override func appNames() -> Set<String> { ["KakaoTalk", "카카오톡"] }
    override func version() -> String { "1.0 (1)" }
    override var isFrontmost: Bool { false }
    override func screenLocked() -> Bool { locked }
    override func secondsSinceLastInput() -> Double? { idle }
    override func cgTitleCount(_ title: String) -> Int? { nil }
}

func makeEngine(_ fake: FakeAgentDesktop, _ policy: FakePolicy = FakePolicy(bundleID: "test.bundle")) -> (Engine, ADClient) {
    let dir = (NSTemporaryDirectory() as NSString).appendingPathComponent("kakao-ad-test-\(UUID().uuidString)")
    var config = Config(stateDir: dir, bundleID: "test.bundle", minInterval: 0, confirmTimeout: 1)
    config.pollInterval = 0.01
    config.enablePoll = 0.01
    let client = ADClient(runner: fake)
    return (Engine(driver: ADDriver(client: client, policy: policy), store: RoomStore(stateDir: dir),
                   clock: SystemClock(), config: config), client)
}

test("allowlist admits the subset") {
    for argv in [["list-windows", "--app", "KakaoTalk"], ["snapshot", "--window-id", "w-1", "--max-depth", "40"],
                 ["get", "@s1:e1", "--property", "value"], ["set-value", "@s1:e1", "hi"], ["click", "@s1:e2"],
                 ["permissions"], ["click", "@s1:e2", "--session", "kakao-ad"]] {
        expect((try? adCheck(argv)) != nil, "refused \(argv)")
    }
}

test("allowlist refuses everything else") {
    for argv in [["press", "return"], ["type", "@s1:e1", "hi"], ["click", "@s1:e2", "--headed"],
                 ["focus-window", "--window-id", "w-1"], ["mouse-click", "--xy", "1,2"],
                 ["set-value", "@s1:e1", "x", "--force"], ["snapshot", "--surface", "menu"], []] {
        expect((try? adCheck(argv)) == nil, "admitted \(argv)")
    }
}

test("a refused call never reaches the runner") {
    let fake = FakeAgentDesktop()
    let client = ADClient(runner: fake)
    let r = client.call(["press", "return"])
    expect(r.exit == 126 && fake.calls.isEmpty, "runner was called")
}

test("role mapping folds textfield to AXTextArea") {
    expect(axRole("textfield") == "AXTextArea", "textfield")
    expect(axRole("statictext") == "AXStaticText", "statictext")
    expect(axRole("splitter") == "AXSplitter", "fallback")
    expect(adWindowNumber("w-4242") == 4242 && adWindowNumber("4242") == nil, "window number")
}

test("handshake binds the room through the subset") {
    let fake = FakeAgentDesktop()
    let (engine, client) = makeEngine(fake)
    let out = engine.run(.handshake(room: "Test Room", hints: Hints()))
    expect(out.exit == .ok, "exit \(out.exit) \(out.json)")
    expect(out.body["window_id"] as? Int == 4242, "window id")
    expect(client.log.allSatisfy { adAllowed[$0[0]] != nil }, "only subset commands")
}

test("read returns rows oldest first with labels apart") {
    let fake = FakeAgentDesktop()
    let (engine, _) = makeEngine(fake)
    _ = engine.run(.handshake(room: "Test Room", hints: Hints()))
    let out = engine.run(.read(room: "Test Room", window: 4242, after: nil, limit: 30))
    let msgs = out.body["messages"] as? [[String: Any]] ?? []
    expect(msgs.map { $0["text"] as? String } == ["hello", "how are you"], "texts \(msgs)")
}

test("send drafts, presses and confirms") {
    let fake = FakeAgentDesktop()
    let (engine, client) = makeEngine(fake)
    _ = engine.run(.handshake(room: "Test Room", hints: Hints()))
    let out = engine.run(.send(room: "Test Room", window: 4242, text: "ping", acceptEdited: false))
    expect(out.exit == .ok && out.body["status"] as? String == "sent", "\(out.json)")
    expect(fake.rows.last == "ping" && fake.input.isEmpty, "app state")
    expect(client.log.contains { $0[0] == "set-value" } && client.log.contains { $0[0] == "click" }, "calls")
}

test("a failed click is unconfirmed, never sent") {
    let fake = FakeAgentDesktop()
    fake.clickWorks = false
    let (engine, _) = makeEngine(fake)
    _ = engine.run(.handshake(room: "Test Room", hints: Hints()))
    let out = engine.run(.send(room: "Test Room", window: 4242, text: "ping", acceptEdited: false))
    expect(out.exit == .sendUnconfirmed, "\(out.json)")
}

test("missing permission is not_trusted") {
    let fake = FakeAgentDesktop()
    fake.granted = false
    let (engine, _) = makeEngine(fake)
    let out = engine.run(.handshake(room: "Test Room", hints: Hints()))
    expect(out.exit == .unavailable && out.body["status"] as? String == "not_trusted", "\(out.json)")
}

test("locked session stops before any window call") {
    let fake = FakeAgentDesktop()
    let policy = FakePolicy(bundleID: "test.bundle")
    policy.locked = true
    let (engine, client) = makeEngine(fake, policy)
    let out = engine.run(.handshake(room: "Test Room", hints: Hints()))
    expect(out.body["status"] as? String == "screen_locked", "\(out.json)")
    expect(!client.log.contains { $0[0] == "list-windows" }, "listed windows while locked")
}

if failed.isEmpty {
    print("all passed")
} else {
    print(failed.joined(separator: "\n"))
    exit(1)
}
