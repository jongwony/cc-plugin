import Foundation

let env = ProcessInfo.processInfo.environment
let parsed = parseArguments(Array(CommandLine.arguments.dropFirst()), env: env) { path in
    if path == "-" {
        return String(decoding: FileHandle.standardInput.readDataToEndOfFile(), as: UTF8.self)
    }
    return try String(contentsOfFile: path, encoding: .utf8)
}

switch parsed {
case .help(let text):
    print(text)
    exit(0)
case .usage(let reason):
    print(renderJSON(["ok": false, "status": "usage", "exit": Int(Exit.usage.rawValue), "reason": reason]))
    exit(Exit.usage.rawValue)
case .run(let command, let config):
    guard let bin = locateAgentDesktop(env: env) else {
        print(renderJSON(["ok": false, "status": "unavailable", "exit": Int(Exit.unavailable.rawValue),
                          "command": command.name,
                          "reason": "agent-desktop not found on PATH; install it: npm i -g agent-desktop"]))
        exit(Exit.unavailable.rawValue)
    }
    // The only place the app is reached: help and usage errors above never construct the driver.
    let client = ADClient(runner: ProcessRunner(executable: bin, session: env["KAKAO_AD_SESSION"] ?? "kakao-ad"))
    let engine = Engine(driver: ADDriver(client: client, policy: SessionPolicy(bundleID: config.bundleID)),
                        store: RoomStore(stateDir: config.stateDir),
                        clock: SystemClock(), config: config)
    var result = engine.run(command)
    if env["KAKAO_AD_TRACE"] == "1" { result.body["ad_calls"] = client.log.map { $0.first ?? "" } }
    print(result.json)
    exit(result.exit.rawValue)
}
