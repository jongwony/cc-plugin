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
guard AXIsProcessTrusted() else { emit(["error":"accessibility_not_trusted"]); exit(2) }
guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: "com.kakao.KakaoTalkMac").first else { emit(["error":"app_not_running"]); exit(3) }
let root = AXUIElementCreateApplication(app.processIdentifier)
AXUIElementSetMessagingTimeout(root, 1)
let windows = attr(root, kAXWindowsAttribute) as? [AXUIElement] ?? []
let mains = windows.filter { (attr($0, kAXIdentifierAttribute) as? String) == "Main Window" }
guard mains.count == 1 else { emit(["error":"main_window_not_unique","count":mains.count]); exit(4) }
var queue: [(AXUIElement,String,Int)] = [(mains[0], "Main Window", 0)]
var candidates: [(AXUIElement,String)] = []
var nodes = 0
while !queue.isEmpty && nodes < 100 {
 let (node,path,depth) = queue.removeFirst(); nodes += 1
 let role = attr(node,kAXRoleAttribute) as? String ?? "unknown"
 emit(["kind":"structure","path":path,"role":role])
 if role == "AXTable" { candidates.append((node,path)); continue }
 if depth < 3 && !["AXTextArea","AXStaticText","AXRow","AXWebArea"].contains(role), let children = attr(node,kAXChildrenAttribute) as? [AXUIElement] {
   for (i,child) in children.enumerated() { queue.append((child,"\(path)/\(role)[\(i)]",depth+1)) }
 }
}
guard candidates.count == 1 else { emit(["error":"table_not_unique","count":candidates.count]); exit(5) }
let table = candidates[0].0
emit(["kind":"target","path":candidates[0].1,"role":"AXTable","initial_child_count":(attr(table,kAXChildrenAttribute) as? [AXUIElement])?.count ?? -1])
var count = 0
let callback: AXObserverCallback = { _, element, notification, _ in
 count += 1
 emit(["kind":"event","event":notification as String,"role":attr(element,kAXRoleAttribute) as? String ?? "unknown","target_is_table":CFEqual(element,table),"time":ISO8601DateFormatter().string(from:Date()),"elapsed_s":Date().timeIntervalSince(started)])
}
var obs: AXObserver?
let result = AXObserverCreate(app.processIdentifier,callback,&obs)
guard result == .success, let observer = obs else { emit(["error":"observer_create","result":result.rawValue]); exit(6) }
let notifications = ["AXRowCountChanged","AXValueChanged","AXLayoutChanged","AXCreated","AXUIElementDestroyed","AXSelectedRowsChanged"]
var registered:[String] = []
for name in notifications {
 let status = AXObserverAddNotification(observer,table,name as CFString,nil)
 emit(["kind":"registration","role":"AXTable","event":name,"result":status.rawValue])
 if status == .success { registered.append(name) }
}
CFRunLoopAddSource(CFRunLoopGetCurrent(),AXObserverGetRunLoopSource(observer),.defaultMode)
emit(["kind":"ready","registered":registered.count,"duration_s":180,"time":ISO8601DateFormatter().string(from:Date())])
let end = Date().addingTimeInterval(180)
while Date() < end { CFRunLoopRunInMode(.defaultMode,min(30,end.timeIntervalSinceNow),false) }
for name in registered { AXObserverRemoveNotification(observer,table,name as CFString) }
CFRunLoopRemoveSource(CFRunLoopGetCurrent(),AXObserverGetRunLoopSource(observer),.defaultMode)
emit(["kind":"finished","events":count,"final_child_count":(attr(table,kAXChildrenAttribute) as? [AXUIElement])?.count ?? -1,"time":ISO8601DateFormatter().string(from:Date())])
