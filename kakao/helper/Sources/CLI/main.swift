import Foundation

let parsed = parseArguments(Array(CommandLine.arguments.dropFirst()),
                            env: ProcessInfo.processInfo.environment) { path in
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
    // The only place the app is reached: help and usage errors above never construct the driver.
    let engine = Engine(driver: AXAppDriver(bundleID: config.bundleID),
                        store: RoomStore(stateDir: config.stateDir),
                        clock: SystemClock(), config: config)
    let result = engine.run(command)
    print(result.json)
    exit(result.exit.rawValue)
}
