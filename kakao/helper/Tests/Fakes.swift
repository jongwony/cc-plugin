import Foundation

final class FakeNode: UINode {
    var role: String?
    var subrole: String?
    var title: String?
    var nodeDescription: String?
    var identifier: String?
    var stringValue: String?
    var isEnabled = true
    var isValueSettable: Bool
    var children: [UINode]
    var onSet: ((FakeNode, String) -> Bool)?
    var onPress: (() -> Bool)?
    var setCount = 0
    var pressCount = 0

    init(_ role: String, title: String? = nil, desc: String? = nil, id: String? = nil,
         value: String? = nil, settable: Bool = false, children: [FakeNode] = []) {
        self.role = role
        self.title = title
        self.nodeDescription = desc
        self.identifier = id
        self.stringValue = value
        self.isValueSettable = settable
        self.children = children
    }

    func setStringValue(_ text: String) -> Bool {
        setCount += 1
        if let f = onSet { return f(self, text) }
        stringValue = text
        return true
    }

    func press() -> Bool {
        pressCount += 1
        return onPress?() ?? true
    }
}

/// A chat window shaped like the evidence describes: bubbles are text areas inside table rows,
/// the input box is a text area outside the table, and there is a labelled send button.
final class FakeRoom {
    let input = FakeNode("AXTextArea", value: "", settable: true)
    let button = FakeNode("AXButton", title: "전송")
    let table = FakeNode("AXTable")
    let window: FakeNode

    init(messages: [String], bubblesSettable: Bool = false) {
        window = FakeNode("AXWindow", children: [
            FakeNode("AXScrollArea", children: [table]),
            FakeNode("AXScrollArea", children: [input]),
            button,
        ])
        for m in messages { append(m, settable: bubblesSettable) }
    }

    /// A bubble row; `labels` become static texts beside it (unread counter, time).
    func append(_ text: String, settable: Bool = false, labels: [String] = []) {
        table.children.append(FakeNode("AXRow", children: [
            FakeNode("AXCell", children: [FakeNode("AXTextArea", value: text, settable: settable)]
                + labels.map { FakeNode("AXStaticText", value: $0) }),
        ]))
    }

    /// The static texts of row `i`, to change counters and time labels after the fact.
    func labelNodes(row i: Int) -> [FakeNode] {
        ((table.children[i] as! FakeNode).children[0] as! FakeNode).children.compactMap {
            ($0 as! FakeNode).role == "AXStaticText" ? $0 as? FakeNode : nil
        }
    }

    /// The button behaves like a working app: the input text becomes the newest bubble.
    func wireWorkingSend(shown: ((String) -> String)? = nil) {
        button.onPress = { [unowned self] in
            let t = self.input.stringValue ?? ""
            self.append(shown?(t) ?? t)
            self.input.stringValue = ""
            return true
        }
    }
}

final class FakeDriver: AppDriver {
    var state: AppState = .running(version: "9.9.9 (1)", frontmost: false)
    var wins: [WindowInfo] = []
    var cg: Int?
    var idle: Double? = 100

    func appState() -> AppState { state }
    func windows() -> [WindowInfo] { wins }
    func cgTitleCount(_ title: String) -> Int? { cg }
    func secondsSinceLastInput() -> Double? { idle }
}

final class FakeClock: Clock {
    var t: Double = 1_000_000
    var slept: [Double] = []
    var onSleep: (() -> Void)?

    func now() -> Double { t }
    func sleep(_ seconds: Double) {
        slept.append(seconds)
        t += seconds
        onSleep?()
    }
}
