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

    var role: String? { attr(kAXRoleAttribute) as? String }
    var subrole: String? { attr(kAXSubroleAttribute) as? String }
    var title: String? { attr(kAXTitleAttribute) as? String }
    var nodeDescription: String? { attr(kAXDescriptionAttribute) as? String }
    var identifier: String? { attr(kAXIdentifierAttribute) as? String }
    var stringValue: String? { attr(kAXValueAttribute) as? String }
    var isEnabled: Bool { (attr(kAXEnabledAttribute) as? Bool) ?? true }

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

    func appState() -> AppState {
        guard AXIsProcessTrusted() else { return .notTrusted }
        guard let app else { return .notRunning }
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
        let cg = cgWindows(pid: pid)
        return wins.map { w in
            let node = AXNode(w)
            let isFocused = focused.map { CFEqual($0, w) } ?? false
            return WindowInfo(windowID: windowID(of: w, title: node.title, cg: cg),
                              title: node.title, isFocused: isFocused, node: node)
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
    private func windowID(of w: AXUIElement, title: String?, cg: [[String: Any]]) -> UInt32? {
        var id = CGWindowID(0)
        if _AXUIElementGetWindow(w, &id) == .success, id != 0 { return id }
        guard let frame = axFrame(w) else { return nil }
        let hits = cg.filter { info in
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
