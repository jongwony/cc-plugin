import Foundation

/// What a handshake binds, plus the per-room send clock and the last draft this tool placed.
public struct RoomState: Codable, Equatable {
    public var room: String
    public var windowID: UInt32
    public var appVersion: String
    public var hints: Hints
    public var handshakeAt: Double
    public var lastSendAt: Double?
    public var draftText: String?
}

/// One small JSON file per room; no process stays running.
public final class RoomStore {
    let dir: String

    public init(stateDir: String) {
        self.dir = (stateDir as NSString).appendingPathComponent("rooms")
    }

    func path(_ room: String) -> String { (dir as NSString).appendingPathComponent("\(fnv1a64(room)).json") }

    private func ensureDir() throws {
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true,
                                                attributes: [.posixPermissions: 0o700])
    }

    public func load(_ room: String) -> RoomState? {
        guard let data = FileManager.default.contents(atPath: path(room)),
              let s = try? JSONDecoder().decode(RoomState.self, from: data),
              s.room == room else { return nil }
        return s
    }

    public func save(_ s: RoomState) throws {
        try ensureDir()
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys, .prettyPrinted]
        try enc.encode(s).write(to: URL(fileURLWithPath: path(s.room)), options: .atomic)
    }

    /// Exclusive advisory lock per room; the kernel releases it if the process dies.
    public func withLock<T>(_ room: String, _ body: () throws -> T) throws -> T {
        try ensureDir()
        let lockPath = path(room) + ".lock"
        let fd = open(lockPath, O_CREAT | O_RDWR, 0o600)
        guard fd >= 0 else { throw NSError(domain: "kakao-rooms", code: Int(errno), userInfo: [NSLocalizedDescriptionKey: "cannot open \(lockPath)"]) }
        defer { close(fd) }
        guard flock(fd, LOCK_EX) == 0 else { throw NSError(domain: "kakao-rooms", code: Int(errno), userInfo: [NSLocalizedDescriptionKey: "cannot lock \(lockPath)"]) }
        defer { flock(fd, LOCK_UN) }
        return try body()
    }
}
