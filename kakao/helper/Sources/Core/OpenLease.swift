import Foundation

/// One app-wide lease on opening a room: `locate` takes it for its room, that room's handshake
/// releases it, and it expires on its own. While another room holds it, `locate` refuses, so
/// two sessions never scroll the shared chat list between one's locate and its double-click.
struct OpenLease: Codable {
    var room: String
    var expires: Double
}

final class OpenLeaseStore {
    let path: String
    let lockPath: String

    init(stateDir: String) {
        path = (stateDir as NSString).appendingPathComponent("open-lease.json")
        lockPath = path + ".lock"
    }

    private func locked<T>(_ body: () throws -> T) throws -> T {
        try FileManager.default.createDirectory(atPath: (path as NSString).deletingLastPathComponent,
                                                withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let fd = open(lockPath, O_CREAT | O_RDWR, 0o600)
        guard fd >= 0 else { throw NSError(domain: "kakao", code: Int(errno), userInfo: [NSLocalizedDescriptionKey: "cannot open \(lockPath)"]) }
        defer { close(fd) }
        guard flock(fd, LOCK_EX) == 0 else { throw NSError(domain: "kakao", code: Int(errno), userInfo: [NSLocalizedDescriptionKey: "cannot lock \(lockPath)"]) }
        defer { flock(fd, LOCK_UN) }
        return try body()
    }

    private func current() -> OpenLease? {
        FileManager.default.contents(atPath: path).flatMap { try? JSONDecoder().decode(OpenLease.self, from: $0) }
    }

    /// Takes or renews the lease for `room`; returns the other room's live lease instead when one holds it.
    func acquire(_ room: String, now: Double, ttl: Double) throws -> OpenLease? {
        try locked {
            if let l = current(), l.room != room, l.expires > now { return l }
            try JSONEncoder().encode(OpenLease(room: room, expires: now + ttl))
                .write(to: URL(fileURLWithPath: path), options: .atomic)
            return nil
        }
    }

    func release(_ room: String) throws {
        try locked {
            if current()?.room == room { try? FileManager.default.removeItem(atPath: path) }
        }
    }
}
