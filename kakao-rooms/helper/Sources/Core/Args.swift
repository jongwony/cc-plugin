import Foundation

public enum Parsed {
    case help(String)
    case usage(String)
    case run(Command, Config)
}

public let usageText = """
kakao-rooms — one KakaoTalk (macOS) chat window per caller, through Accessibility only.

  kakao-rooms handshake --room <title> [--send-label <label>]... [--input-identifier <id>] [--list-identifier <id>]
  kakao-rooms read      --room <title> --window <id> [--after <marker>] [--limit <n>]
  kakao-rooms draft     --room <title> --window <id> (--text <text> | --text-file <path|->)
  kakao-rooms send      --room <title> --window <id> [--text <text> | --text-file <path|->] [--accept-edited]
  kakao-rooms clear     --room <title> --window <id>

Common: [--state-dir <dir>] [--min-interval <seconds>] [--confirm-timeout <seconds>]
Env: KAKAO_ROOMS_STATE_DIR, KAKAO_ROOMS_MIN_INTERVAL, KAKAO_ROOMS_BUNDLE_ID
Output: one JSON object on stdout. Exit codes: 0 ok, 2 usage, 3 handshake incomplete,
4 handshake again, 5 input busy, 6 not verified, 7 send unconfirmed, 8 draft changed,
9 unavailable, 10 room not unique.
"""

private let valueFlags: Set<String> = [
    "--room", "--window", "--text", "--text-file", "--after", "--limit",
    "--send-label", "--input-identifier", "--list-identifier",
    "--state-dir", "--min-interval", "--confirm-timeout",
]
private let boolFlags: Set<String> = ["--accept-edited"]
private let commonFlags: Set<String> = ["--state-dir", "--min-interval", "--confirm-timeout"]
private let allowed: [String: Set<String>] = [
    "handshake": ["--room", "--send-label", "--input-identifier", "--list-identifier"],
    "read": ["--room", "--window", "--after", "--limit"],
    "draft": ["--room", "--window", "--text", "--text-file"],
    "send": ["--room", "--window", "--text", "--text-file", "--accept-edited"],
    "clear": ["--room", "--window"],
]

public let defaultMinInterval: Double = 20
public let defaultConfirmTimeout: Double = 5

/// `readFile` reads a path, or standard input for "-".
public func parseArguments(_ argv: [String], env: [String: String],
                           readFile: (String) throws -> String) -> Parsed {
    if argv.isEmpty || argv.contains("--help") || argv.contains("-h") || argv.first == "help" {
        return .help(usageText)
    }
    let cmd = argv[0]
    guard let permitted = allowed[cmd] else { return .usage("unknown command: \(cmd)") }

    var values: [String: [String]] = [:]
    var bools: Set<String> = []
    var i = 1
    while i < argv.count {
        let flag = argv[i]
        if boolFlags.contains(flag) {
            guard permitted.contains(flag) else { return .usage("\(flag) does not apply to \(cmd)") }
            bools.insert(flag)
            i += 1
            continue
        }
        guard valueFlags.contains(flag) else { return .usage("unknown option: \(flag)") }
        guard permitted.contains(flag) || commonFlags.contains(flag) else {
            return .usage("\(flag) does not apply to \(cmd)")
        }
        guard i + 1 < argv.count else { return .usage("\(flag) needs a value") }
        values[flag, default: []].append(argv[i + 1])
        i += 2
    }
    for (flag, vs) in values where vs.count > 1 && flag != "--send-label" {
        return .usage("\(flag) given more than once")
    }
    func one(_ f: String) -> String? { values[f]?.first }

    let home = env["HOME"] ?? NSHomeDirectory()
    var config = Config(
        stateDir: one("--state-dir") ?? env["KAKAO_ROOMS_STATE_DIR"] ?? "\(home)/.local/state/kakao-rooms",
        bundleID: env["KAKAO_ROOMS_BUNDLE_ID"] ?? "com.kakao.KakaoTalkMac",
        minInterval: defaultMinInterval,
        confirmTimeout: defaultConfirmTimeout)
    if let s = one("--min-interval") ?? env["KAKAO_ROOMS_MIN_INTERVAL"] {
        guard let v = Double(s), v >= 0 else { return .usage("min-interval must be a number >= 0") }
        config.minInterval = v
    }
    if let s = one("--confirm-timeout") {
        guard let v = Double(s), v > 0 else { return .usage("--confirm-timeout must be a number > 0") }
        config.confirmTimeout = v
    }

    guard let room = one("--room"), !room.isEmpty else { return .usage("--room is required") }

    if cmd == "handshake" {
        let hints = Hints(sendLabels: values["--send-label"],
                          inputIdentifier: one("--input-identifier"),
                          listIdentifier: one("--list-identifier"))
        return .run(.handshake(room: room, hints: hints), config)
    }

    guard let ws = one("--window") else { return .usage("--window is required (from handshake)") }
    guard let window = UInt32(ws) else { return .usage("--window must be a window id number") }

    if one("--text") != nil && one("--text-file") != nil {
        return .usage("give --text or --text-file, not both")
    }
    var text = one("--text")
    if let p = one("--text-file") {
        do { text = try readFile(p) } catch { return .usage("cannot read --text-file \(p): \(error)") }
    }
    if let t = text, t.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return .usage("text is empty")
    }

    switch cmd {
    case "read":
        var limit = 30
        if let s = one("--limit") {
            guard let v = Int(s), v > 0 else { return .usage("--limit must be a positive integer") }
            limit = v
        }
        return .run(.read(room: room, window: window, after: one("--after"), limit: limit), config)
    case "draft":
        guard let t = text else { return .usage("draft needs --text or --text-file") }
        return .run(.draft(room: room, window: window, text: t), config)
    case "send":
        return .run(.send(room: room, window: window, text: text,
                          acceptEdited: bools.contains("--accept-edited")), config)
    default:
        return .run(.clear(room: room, window: window), config)
    }
}
