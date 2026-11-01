import Foundation

/// The agent-desktop commands this helper may run, each with the flags it may pass. Anything
/// else — `press`, `type`, `--headed`, `--xy`, `--force`, focus or window commands — is refused
/// before a process starts. `permissions` is a read-only status check, not manipulation.
let adAllowed: [String: Set<String>] = [
    "list-windows": ["--app", "--timeout-ms"],
    "snapshot": ["--window-id", "--root", "--max-depth", "--timeout-ms"],
    "get": ["--property"],
    "set-value": ["--timeout-ms"],
    "click": ["--timeout-ms"],
    "permissions": [],
]
/// Flags allowed on every command.
let adCommonFlags: Set<String> = ["--session"]

enum ADRefusal: Error, Equatable {
    case command(String)
    case flag(String, String)
}

/// Checks one argv against `adAllowed`. Positional arguments (refs, values) are not flags; a
/// value that follows a flag is skipped.
func adCheck(_ argv: [String]) throws {
    guard let cmd = argv.first, let flags = adAllowed[cmd] else { throw ADRefusal.command(argv.first ?? "") }
    var i = 1
    while i < argv.count {
        let a = argv[i]
        if a.hasPrefix("--") {
            guard flags.contains(a) || adCommonFlags.contains(a) else { throw ADRefusal.flag(cmd, a) }
            i += 2
        } else {
            i += 1
        }
    }
}

/// One agent-desktop result: the exit code and the parsed envelope (`ok`, `data`, `error`).
struct ADResult {
    let exit: Int32
    let envelope: [String: Any]?

    var ok: Bool { exit == 0 && (envelope?["ok"] as? Bool) == true }
    var data: Any? { envelope?["data"] }
    var errorCode: String? { (envelope?["error"] as? [String: Any])?["code"] as? String }
}

protocol ADRunner {
    func run(_ argv: [String]) -> ADResult
}

/// Runs the agent-desktop binary. `AGENT_DESKTOP_BIN` overrides the PATH lookup.
final class ProcessRunner: ADRunner {
    let executable: String
    let session: String

    init(executable: String, session: String) {
        self.executable = executable
        self.session = session
    }

    func run(_ argv: [String]) -> ADResult {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: executable)
        p.arguments = argv + ["--session", session]
        let out = Pipe()
        p.standardOutput = out
        p.standardError = FileHandle.nullDevice
        do { try p.run() } catch { return ADResult(exit: 127, envelope: nil) }
        let data = out.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        let env = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        return ADResult(exit: p.terminationStatus, envelope: env)
    }
}

/// The checked gateway: every call passes `adCheck` first. A refused call never runs and
/// returns exit 126.
final class ADClient {
    let runner: ADRunner
    private(set) var log: [[String]] = []

    init(runner: ADRunner) { self.runner = runner }

    func call(_ argv: [String]) -> ADResult {
        do { try adCheck(argv) } catch { return ADResult(exit: 126, envelope: nil) }
        log.append(argv)
        return runner.run(argv)
    }
}

/// The first executable named `agent-desktop` on PATH, or the override.
func locateAgentDesktop(env: [String: String]) -> String? {
    if let p = env["AGENT_DESKTOP_BIN"], FileManager.default.isExecutableFile(atPath: p) { return p }
    for dir in (env["PATH"] ?? "").split(separator: ":") {
        let p = "\(dir)/agent-desktop"
        if FileManager.default.isExecutableFile(atPath: p) { return p }
    }
    return nil
}
