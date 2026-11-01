import AppKit
import CoreGraphics
import Foundation
import IOKit

/// What agent-desktop does not report: the session's lock state, the person at the keyboard,
/// the app's identity and version, and the CoreGraphics title cross-check. Read-only; nothing
/// here reaches an app's accessibility tree.
class SessionPolicy {
    let bundleID: String

    init(bundleID: String) { self.bundleID = bundleID }

    var app: NSRunningApplication? {
        NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).first
    }

    var isRunning: Bool { app != nil }

    func appNames() -> Set<String> {
        guard let app else { return [] }
        var names: Set<String> = []
        if let n = app.localizedName { names.insert(n) }
        if let url = app.bundleURL, let bundle = Bundle(url: url) {
            for key in ["CFBundleDisplayName", "CFBundleName"] {
                if let n = bundle.localizedInfoDictionary?[key] as? String { names.insert(n) }
                if let n = bundle.infoDictionary?[key] as? String { names.insert(n) }
            }
        }
        return names
    }

    /// The name agent-desktop's `--app` matches (exact, case-insensitive).
    var appName: String? { app?.localizedName }

    func version() -> String {
        guard let url = app?.bundleURL, let info = Bundle(url: url)?.infoDictionary else { return "unknown" }
        let short = info["CFBundleShortVersionString"] as? String ?? "?"
        let build = info["CFBundleVersion"] as? String ?? "?"
        return "\(short) (\(build))"
    }

    var isFrontmost: Bool {
        guard let app else { return false }
        return NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier
    }

    /// The session's lock state, and the login window in front, as the window server reports them.
    func screenLocked() -> Bool {
        if NSWorkspace.shared.frontmostApplication?.bundleIdentifier == "com.apple.loginwindow" { return true }
        guard let session = CGSessionCopyCurrentDictionary() as? [String: Any] else { return false }
        if (session["CGSSessionScreenIsLocked"] as? Bool) == true { return true }
        if let onConsole = session[kCGSessionOnConsoleKey as String] as? Bool, !onConsole { return true }
        return false
    }

    func secondsSinceLastInput() -> Double? {
        let service = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("IOHIDSystem"))
        guard service != 0 else { return nil }
        defer { IOObjectRelease(service) }
        guard let prop = IORegistryEntryCreateCFProperty(service, "HIDIdleTime" as CFString, kCFAllocatorDefault, 0)?
            .takeRetainedValue() else { return nil }
        if let n = prop as? NSNumber { return n.doubleValue / 1_000_000_000 }
        if let d = prop as? Data, d.count >= 8 {
            return Double(d.withUnsafeBytes { $0.loadUnaligned(as: UInt64.self) }) / 1_000_000_000
        }
        return nil
    }

    /// Layer-0 windows of the app whose CoreGraphics name equals `title`;
    /// nil when window names are unreadable (no Screen Recording permission).
    func cgTitleCount(_ title: String) -> Int? {
        guard let app else { return nil }
        let pid = app.processIdentifier
        let list = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]] ?? []
        let names = list.filter {
            ($0[kCGWindowOwnerPID as String] as? Int).map { pid_t($0) } == pid
                && ($0[kCGWindowLayer as String] as? Int) == 0
        }.map { $0[kCGWindowName as String] as? String }
        if names.allSatisfy({ $0 == nil }) { return nil }
        return names.filter { $0 == title }.count
    }
}
