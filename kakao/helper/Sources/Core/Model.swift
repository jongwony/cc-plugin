import Foundation

/// One accessibility element. The AX adapter wraps AXUIElement; tests use fakes.
public protocol UINode: AnyObject {
    var role: String? { get }
    var subrole: String? { get }
    var title: String? { get }
    var nodeDescription: String? { get }
    var identifier: String? { get }
    var stringValue: String? { get }
    var isEnabled: Bool { get }
    var isValueSettable: Bool { get }
    var children: [UINode] { get }
    /// Sets the element's value attribute. No focus change, no key events.
    func setStringValue(_ text: String) -> Bool
    /// Performs the element's press action. No pointer events.
    func press() -> Bool
}

public struct WindowInfo {
    public let windowID: UInt32?
    public let title: String?
    /// The app's focused window (AXFocusedWindow), which is not the same as frontmost on screen.
    public let isFocused: Bool
    public let node: UINode

    public init(windowID: UInt32?, title: String?, isFocused: Bool, node: UINode) {
        self.windowID = windowID
        self.title = title
        self.isFocused = isFocused
        self.node = node
    }
}

public enum AppState {
    case notTrusted
    case notRunning
    case running(version: String, frontmost: Bool)
}

public protocol AppDriver {
    func appState() -> AppState
    func windows() -> [WindowInfo]
    /// Layer-0 windows of the app whose CoreGraphics name equals `title`;
    /// nil when window names are unreadable (no Screen Recording permission).
    func cgTitleCount(_ title: String) -> Int?
    /// Seconds since the last keyboard or pointer input on this machine; nil if unknown.
    func secondsSinceLastInput() -> Double?
}

public protocol Clock {
    func now() -> Double
    func sleep(_ seconds: Double)
}

public final class SystemClock: Clock {
    public init() {}
    public func now() -> Double { Date().timeIntervalSince1970 }
    public func sleep(_ seconds: Double) {
        if seconds > 0 { Thread.sleep(forTimeInterval: seconds) }
    }
}

public enum Exit: Int32 {
    case ok = 0
    case usage = 2
    case handshakeIncomplete = 3
    case handshakeAgain = 4
    case inputBusy = 5
    case notVerified = 6
    case sendUnconfirmed = 7
    case draftChanged = 8
    case unavailable = 9
    case roomNotUnique = 10
}

public struct Outcome {
    public let exit: Exit
    public var body: [String: Any]

    public var json: String { renderJSON(body) }
}

public struct Hints: Codable, Equatable {
    public var sendLabels: [String]?
    public var inputIdentifier: String?
    public var listIdentifier: String?

    public init(sendLabels: [String]? = nil, inputIdentifier: String? = nil, listIdentifier: String? = nil) {
        self.sendLabels = sendLabels
        self.inputIdentifier = inputIdentifier
        self.listIdentifier = listIdentifier
    }

    var asJSON: [String: Any] {
        var d: [String: Any] = [:]
        if let s = sendLabels { d["send_labels"] = s }
        if let s = inputIdentifier { d["input_identifier"] = s }
        if let s = listIdentifier { d["list_identifier"] = s }
        return d
    }
}

public struct Config {
    public var stateDir: String
    public var bundleID: String
    public var minInterval: Double
    public var confirmTimeout: Double
    public var pollInterval: Double = 0.25
    public var personIdleThreshold: Double = 2.0
    public var defaultSendLabels: [String] = ["전송", "보내기", "Send"]

    public init(stateDir: String, bundleID: String, minInterval: Double, confirmTimeout: Double) {
        self.stateDir = stateDir
        self.bundleID = bundleID
        self.minInterval = minInterval
        self.confirmTimeout = confirmTimeout
    }
}

public enum Command {
    case handshake(room: String, hints: Hints)
    case read(room: String, window: UInt32, after: String?, limit: Int)
    case draft(room: String, window: UInt32, text: String)
    case send(room: String, window: UInt32, text: String?, acceptEdited: Bool)
    case clear(room: String, window: UInt32)

    public var name: String {
        switch self {
        case .handshake: return "handshake"
        case .read: return "read"
        case .draft: return "draft"
        case .send: return "send"
        case .clear: return "clear"
        }
    }
}

public func renderJSON(_ body: [String: Any]) -> String {
    let opts: JSONSerialization.WritingOptions = [.sortedKeys, .withoutEscapingSlashes]
    guard JSONSerialization.isValidJSONObject(body),
          let data = try? JSONSerialization.data(withJSONObject: body, options: opts),
          let s = String(data: data, encoding: .utf8) else {
        return #"{"ok":false,"status":"internal_json_error"}"#
    }
    return s
}

/// FNV-1a 64-bit, hex. Used for state file names and read markers, not for security.
public func fnv1a64(_ s: String) -> String {
    var h: UInt64 = 0xcbf29ce484222325
    for b in s.utf8 {
        h ^= UInt64(b)
        h = h &* 0x100000001b3
    }
    return String(format: "%016llx", h)
}
