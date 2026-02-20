# CDP Protocol Reference

Quick reference for Chrome DevTools Protocol methods used by this skill.

## Core Domains

### Page

```
Page.navigate({url})                    → {frameId, loaderId}
Page.captureScreenshot({format, quality, captureBeyondViewport})  → {data: base64}
Page.getLayoutMetrics()                 → {contentSize: {width, height}}
Page.handleJavaScriptDialog({accept, promptText})
  accept: boolean (true=OK/Yes, false=Cancel/No)
  promptText: string (optional, for window.prompt() only)
  Dialog types: alert → accept only, confirm → accept/dismiss, prompt → accept with text
Page.loadEventFired                     ← event
```

### Runtime

```
Runtime.evaluate({expression, returnByValue, awaitPromise})  → {result: {type, value, description}}
Runtime.enable()
Runtime.consoleAPICalled                ← {type, args[], timestamp}
Runtime.exceptionThrown                 ← {exceptionDetails}
```

### Input

```
Input.dispatchMouseEvent({type, x, y, button, clickCount, modifiers})
  type: mousePressed | mouseReleased | mouseMoved

Input.dispatchKeyEvent({type, key, code, modifiers, windowsVirtualKeyCode})
  type: keyDown | keyUp | char

Input.insertText({text})
```

**Modifier bitmask**: Alt=1, Ctrl=2, Shift=4, Meta=8

### Accessibility

```
Accessibility.enable()
Accessibility.getFullAXTree({depth})    → {nodes[]}
  node: {nodeId, role: {value}, name: {value}, parentId, childIds[]}
```

### Network

```
Network.enable()
Network.requestWillBeSent              ← {requestId, request: {url, method}}
Network.responseReceived               ← {requestId, response: {status, mimeType}}
Network.loadingFinished                ← {requestId}
Network.loadingFailed                  ← {requestId, errorText}
```

### Emulation

```
Emulation.setDeviceMetricsOverride({width, height, deviceScaleFactor, mobile})
Emulation.clearDeviceMetricsOverride()
```

### Tracing

```
Tracing.start({categories})
Tracing.end()
Tracing.dataCollected                  ← {value: traceEvent[]}
Tracing.tracingComplete                ← event
```

## Key Codes (Common)

| Key | code | windowsVirtualKeyCode |
|-----|------|-----------------------|
| Enter | Enter | 13 |
| Tab | Tab | 9 |
| Escape | Escape | 27 |
| Backspace | Backspace | 8 |
| Delete | Delete | 46 |
| Space | Space | 32 |
| ArrowUp | ArrowUp | 38 |
| ArrowDown | ArrowDown | 40 |
| ArrowLeft | ArrowLeft | 37 |
| ArrowRight | ArrowRight | 39 |
| a-z | KeyA-KeyZ | 65-90 |
| 0-9 | Digit0-Digit9 | 48-57 |

## Device Presets

| Device | Width | Height | Scale | Mobile |
|--------|-------|--------|-------|--------|
| iPhone 14 | 390 | 844 | 3 | true |
| iPhone 14 Pro Max | 430 | 932 | 3 | true |
| iPad Air | 820 | 1180 | 2 | true |
| Pixel 7 | 412 | 915 | 2.625 | true |
| Desktop HD | 1920 | 1080 | 1 | false |
| Desktop 4K | 3840 | 2160 | 2 | false |

## HTTP Endpoints

```
GET /json/list              → [{id, type, title, url, webSocketDebuggerUrl}]
GET /json/version           → {Browser, Protocol-Version, V8-Version}
GET /json/new?{url}         → {id, ...}  (open new tab)
GET /json/close/{targetId}  → "Target is closing"
GET /json/activate/{targetId} → "Target activated"
```
