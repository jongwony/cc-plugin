import AppKit
import ApplicationServices
import Foundation

func emit(_ value: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), let s = String(data: data, encoding: .utf8) {
        print(s)
        fflush(stdout)
    }
}
func attr(_ element: AXUIElement, _ key: String) -> CFTypeRef? {
    var result: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, key as CFString, &result) == .success else { return nil }
    return result
}
let started = Date()
var callbackCount = 0
let callback: AXObserverCallback = { _, element, notification, _ in
    callbackCount += 1
    emit(["kind": "event", "time": ISO8601DateFormatter().string(from: Date()), "elapsed_s": Date().timeIntervalSince(started), "event": notification as String, "role": attr(element, kAXRoleAttribute) as? String ?? "unknown"])
}
guard AXIsProcessTrusted() else { emit(["error": "accessibility_not_trusted"]); exit(2) }
guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: "com.kakao.KakaoTalkMac").first else { emit(["error": "app_not_running"]); exit(3) }
var observerOptional: AXObserver?
let created = AXObserverCreate(app.processIdentifier, callback, &observerOptional)
guard created == .success, let observer = observerOptional else { emit(["error": "observer_create", "code": created.rawValue]); exit(4) }
let root = AXUIElementCreateApplication(app.processIdentifier)
AXUIElementSetMessagingTimeout(root, 1)
let windows = attr(root, kAXWindowsAttribute) as? [AXUIElement] ?? []
emit(["kind": "start", "time": ISO8601DateFormatter().string(from: Date()), "windows": windows.count, "duration_s": 300])
let notifications = ["AXCreated", "AXUIElementDestroyed", "AXWindowCreated", "AXValueChanged", "AXTitleChanged", "AXLayoutChanged", "AXRowCountChanged", "AXSelectedRowsChanged", "AXSelectedChildrenChanged", "AXAnnouncementRequested"]
var registrations: [(AXUIElement, String)] = []
var summary: [String: Int] = [:]
var visited: Set<AXUIElement> = []
var queue: [(AXUIElement, String)] = [(root, "application")]
for w in windows {
    let isMain = (attr(w, kAXIdentifierAttribute) as? String) == "Main Window"
    if isMain { queue.append((w, "main_window")) }
}
let allowedRoles: Set<String> = ["AXApplication", "AXWindow", "AXTable", "AXOutline", "AXScrollArea"]
while !queue.isEmpty && visited.count < 120 {
    let (element, scope) = queue.removeFirst()
    guard visited.insert(element).inserted else { continue }
    let role = attr(element, kAXRoleAttribute) as? String ?? "unknown"
    if allowedRoles.contains(role) {
        for notification in notifications {
            let status = AXObserverAddNotification(observer, element, notification as CFString, nil)
            summary["\(scope)|\(role)|\(notification)|\(status.rawValue)", default: 0] += 1
            if status == .success { registrations.append((element, notification)) }
        }
    }
    if !["AXApplication", "AXTable", "AXOutline", "AXRow", "AXTextArea", "AXStaticText", "AXWebArea"].contains(role), let children = attr(element, kAXChildrenAttribute) as? [AXUIElement] {
        queue.append(contentsOf: children.map { ($0, scope) })
    }
}
for key in summary.keys.sorted() { emit(["kind": "registration", "scope_role_notification_result": key, "count": summary[key]!]) }
CFRunLoopAddSource(CFRunLoopGetCurrent(), AXObserverGetRunLoopSource(observer), .defaultMode)
emit(["kind": "ready", "registered": registrations.count, "visited": visited.count, "time": ISO8601DateFormatter().string(from: Date())])
let end = Date().addingTimeInterval(300)
while Date() < end { CFRunLoopRunInMode(.defaultMode, min(30, end.timeIntervalSinceNow), false) }
for (element, name) in registrations { AXObserverRemoveNotification(observer, element, name as CFString) }
CFRunLoopRemoveSource(CFRunLoopGetCurrent(), AXObserverGetRunLoopSource(observer), .defaultMode)
emit(["kind": "finished", "events": callbackCount, "time": ISO8601DateFormatter().string(from: Date())])
