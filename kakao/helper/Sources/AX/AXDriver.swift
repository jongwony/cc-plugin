import AppKit
import ApplicationServices
import CoreGraphics
import Foundation
import IOKit

// Private HIServices call that maps an AX window to its CGWindowID. No public API does this.
@_silgen_name("_AXUIElementGetWindow")
func _AXUIElementGetWindow(_ element: AXUIElement, _ id: UnsafeMutablePointer<CGWindowID>) -> AXError

final class AXNode: UINode {
    let element: AXUIElement

    init(_ element: AXUIElement) { self.element = element }

    func attr(_ name: String) -> CFTypeRef? {
        var v: CFTypeRef?
        return AXUIElementCopyAttributeValue(element, name as CFString, &v) == .success ? v : nil
    }

    // An element's role never changes, and the walks ask for it several times per node.
    private lazy var cachedRole: String? = attr(kAXRoleAttribute) as? String
    var role: String? { cachedRole }
    var subrole: String? { attr(kAXSubroleAttribute) as? String }
    var title: String? { attr(kAXTitleAttribute) as? String }
    var nodeDescription: String? { attr(kAXDescriptionAttribute) as? String }
    var identifier: String? { attr(kAXIdentifierAttribute) as? String }
    var stringValue: String? { attr(kAXValueAttribute) as? String }
    // An element that does not report AXEnabled counts as disabled.
    var isEnabled: Bool { (attr(kAXEnabledAttribute) as? Bool) ?? false }

    var isValueSettable: Bool {
        var settable = DarwinBoolean(false)
        return AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &settable) == .success
            && settable.boolValue
    }

    var children: [UINode] {
        guard let kids = attr(kAXChildrenAttribute) as? [AXUIElement] else { return [] }
        return kids.map(AXNode.init)
    }

    func setStringValue(_ text: String) -> Bool {
        AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, text as CFString) == .success
    }

    func press() -> Bool {
        AXUIElementPerformAction(element, kAXPressAction as CFString) == .success
    }
}

final class AXAppDriver: AppDriver {
    let bundleID: String

    init(bundleID: String) {
        self.bundleID = bundleID
        // Bounds every AX call this process makes, so a stuck app cannot hang the helper.
        AXUIElementSetMessagingTimeout(AXUIElementCreateSystemWide(), 2.0)
    }

    private var app: NSRunningApplication? {
        NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).first
    }

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

    /// The session's lock state, and the login window in front, as the window server reports them.
    private func screenLocked() -> Bool {
        if NSWorkspace.shared.frontmostApplication?.bundleIdentifier == "com.apple.loginwindow" { return true }
        guard let session = CGSessionCopyCurrentDictionary() as? [String: Any] else { return false }
        if (session["CGSSessionScreenIsLocked"] as? Bool) == true { return true }
        if let onConsole = session[kCGSessionOnConsoleKey as String] as? Bool, !onConsole { return true }
        return false
    }

    func appState() -> AppState {
        guard AXIsProcessTrusted() else { return .notTrusted }
        guard let app else { return .notRunning }
        if screenLocked() { return .screenLocked }
        var version = "unknown"
        if let url = app.bundleURL, let info = Bundle(url: url)?.infoDictionary {
            let short = info["CFBundleShortVersionString"] as? String ?? "?"
            let build = info["CFBundleVersion"] as? String ?? "?"
            version = "\(short) (\(build))"
        }
        let front = NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier
        return .running(version: version, frontmost: front)
    }

    func windows() -> [WindowInfo] {
        guard let app else { return [] }
        let pid = app.processIdentifier
        let axApp = AXNode(AXUIElementCreateApplication(pid))
        let focused = axApp.attr(kAXFocusedWindowAttribute)
        guard let wins = axApp.attr(kAXWindowsAttribute) as? [AXUIElement] else { return [] }
        // The CoreGraphics list is read only if the private call fails for some window.
        var cg: [[String: Any]]?
        return wins.map { w in
            let node = AXNode(w)
            let isFocused = focused.map { CFEqual($0, w) } ?? false
            let id = windowID(of: w, title: node.title) {
                if cg == nil { cg = self.cgWindows(pid: pid) }
                return cg!
            }
            return WindowInfo(windowID: id, title: node.title, isFocused: isFocused, node: node)
        }
    }

    func cgTitleCount(_ title: String) -> Int? {
        guard let app else { return nil }
        let names = cgWindows(pid: app.processIdentifier).map { $0[kCGWindowName as String] as? String }
        if names.allSatisfy({ $0 == nil }) { return nil }
        return names.filter { $0 == title }.count
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

    // MARK: window ids

    private func cgWindows(pid: pid_t) -> [[String: Any]] {
        let list = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]] ?? []
        return list.filter {
            ($0[kCGWindowOwnerPID as String] as? Int).map { pid_t($0) } == pid
                && ($0[kCGWindowLayer as String] as? Int) == 0
        }
    }

    /// The private call first; otherwise the single same-app layer-0 window with the same bounds
    /// (and the same name, when names are readable).
    private func windowID(of w: AXUIElement, title: String?, cg: () -> [[String: Any]]) -> UInt32? {
        var id = CGWindowID(0)
        if _AXUIElementGetWindow(w, &id) == .success, id != 0 { return id }
        guard let frame = axFrame(w) else { return nil }
        let hits = cg().filter { info in
            guard let b = info[kCGWindowBounds as String] as? [String: Any],
                  let r = CGRect(dictionaryRepresentation: b as CFDictionary), r.equalTo(frame) else { return false }
            if let name = info[kCGWindowName as String] as? String, let title { return name == title }
            return true
        }
        guard hits.count == 1, let n = hits[0][kCGWindowNumber as String] as? Int else { return nil }
        return UInt32(n)
    }

    private func axFrame(_ w: AXUIElement) -> CGRect? {
        var pos: CFTypeRef?
        var size: CFTypeRef?
        guard AXUIElementCopyAttributeValue(w, kAXPositionAttribute as CFString, &pos) == .success,
              AXUIElementCopyAttributeValue(w, kAXSizeAttribute as CFString, &size) == .success,
              let pv = pos, let sv = size, CFGetTypeID(pv) == AXValueGetTypeID(), CFGetTypeID(sv) == AXValueGetTypeID()
        else { return nil }
        var p = CGPoint.zero
        var s = CGSize.zero
        guard AXValueGetValue(pv as! AXValue, .cgPoint, &p), AXValueGetValue(sv as! AXValue, .cgSize, &s) else { return nil }
        return CGRect(origin: p, size: s)
    }
}
