// ax-probe — Phase 3 M0 (docs/phase3/anchored-icon.md §Milestones): standalone AX
// probe CLI and the future helper binary's protocol reference implementation.
//
// Build:  xcrun swiftc -O -o ax-probe helper/ax-probe.swift
// Run:    ./ax-probe          (needs the Accessibility grant; prompts nothing itself)
//
// stdout — one JSON event per line (NDJSON), all with a ts (ms epoch):
//   {"type":"focus","bundleId","pid","role","subrole","secure","x","y","width","height","elementId"}
//   {"type":"bounds","elementId","x","y","width","height"}   element/window moved or resized
//   {"type":"blur"}                                          no focused element
//   {"type":"heartbeat"}                                     every 3s (liveness)
//   {"type":"error","message"}
// stdin — request/response:
//   {"op":"readValue","elementId"}   → {"type":"readValue","elementId","ok","value"|"error"}
//   {"op":"verifyFocus","elementId"} → {"type":"verifyFocus","elementId","match"}
//
// Coordinates are global-screen, top-left origin as AX reports them — the truth
// table (docs/phase3/truth-table.md) verifies that per app rather than trusting it.
// Invariant: secure fields are flagged, their value is NEVER read (the single
// AXValue read lives in readValue() behind the isSecure guard).

import AppKit
import ApplicationServices

// Mirrors SECURE_ROLES in src/main/field-qualify.js — contract-tested in
// test/ax-probe.test.mjs; change both together.
let secureRoles = ["AXSecureTextField", "AXSecureTextArea"]

var observer: AXObserver?
var observedPid: pid_t = 0
var currentBundleId = ""
var currentElement: AXUIElement?
var currentElementId = ""
var hadFocus = false
var elementWatches: [(AXUIElement, String)] = []

func emit(_ payload: [String: Any]) {
  var dict = payload
  dict["ts"] = Int(Date().timeIntervalSince1970 * 1000)
  guard let data = try? JSONSerialization.data(withJSONObject: dict) else { return }
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data([0x0a]))
}

func copyAttr(_ el: AXUIElement, _ attr: String) -> CFTypeRef? {
  var value: CFTypeRef?
  guard AXUIElementCopyAttributeValue(el, attr as CFString, &value) == .success else { return nil }
  return value
}

func stringAttr(_ el: AXUIElement, _ attr: String) -> String? {
  copyAttr(el, attr) as? String
}

func elementAttr(_ el: AXUIElement, _ attr: String) -> AXUIElement? {
  guard let ref = copyAttr(el, attr), CFGetTypeID(ref) == AXUIElementGetTypeID() else { return nil }
  return (ref as! AXUIElement)
}

func rect(of el: AXUIElement) -> CGRect? {
  guard let posRef = copyAttr(el, kAXPositionAttribute), CFGetTypeID(posRef) == AXValueGetTypeID(),
        let sizeRef = copyAttr(el, kAXSizeAttribute), CFGetTypeID(sizeRef) == AXValueGetTypeID()
  else { return nil }
  var p = CGPoint.zero
  var s = CGSize.zero
  guard AXValueGetValue(posRef as! AXValue, .cgPoint, &p),
        AXValueGetValue(sizeRef as! AXValue, .cgSize, &s)
  else { return nil }
  return CGRect(origin: p, size: s)
}

func isSecure(_ role: String, _ subrole: String) -> Bool {
  secureRoles.contains(role) || secureRoles.contains(subrole)
}

func watch(_ el: AXUIElement, _ notification: String) {
  guard let o = observer else { return }
  if AXObserverAddNotification(o, el, notification as CFString, nil) == .success {
    elementWatches.append((el, notification))
  }
}

func clearElementWatches() {
  if let o = observer {
    for (el, n) in elementWatches { AXObserverRemoveNotification(o, el, n as CFString) }
  }
  elementWatches = []
}

func blurIfNeeded() {
  clearElementWatches()
  currentElement = nil
  currentElementId = ""
  if hadFocus {
    hadFocus = false
    emit(["type": "blur"])
  }
}

func emitFocus(_ el: AXUIElement) {
  let role = stringAttr(el, kAXRoleAttribute) ?? ""
  let subrole = stringAttr(el, kAXSubroleAttribute) ?? ""
  let f = rect(of: el) ?? .zero
  emit([
    "type": "focus",
    "bundleId": currentBundleId,
    "pid": Int(observedPid),
    "role": role,
    "subrole": subrole,
    "secure": isSecure(role, subrole),
    "x": Double(f.origin.x),
    "y": Double(f.origin.y),
    "width": Double(f.size.width),
    "height": Double(f.size.height),
    "elementId": currentElementId
  ])
}

func emitBounds() {
  guard let el = currentElement, let f = rect(of: el) else { return }
  emit([
    "type": "bounds",
    "elementId": currentElementId,
    "x": Double(f.origin.x),
    "y": Double(f.origin.y),
    "width": Double(f.size.width),
    "height": Double(f.size.height)
  ])
}

func refreshFocus() {
  guard observedPid != 0 else { return blurIfNeeded() }
  clearElementWatches()
  let appEl = AXUIElementCreateApplication(observedPid)
  guard let el = elementAttr(appEl, kAXFocusedUIElementAttribute) else { return blurIfNeeded() }
  currentElement = el
  currentElementId = String(CFHash(el))
  hadFocus = true
  emitFocus(el)
  for n in [kAXMovedNotification, kAXResizedNotification] {
    watch(el, n)
    if let win = elementAttr(el, kAXWindowAttribute) { watch(win, n) }
  }
}

let axCallback: AXObserverCallback = { _, _, notification, _ in
  if (notification as String) == kAXFocusedUIElementChangedNotification {
    refreshFocus()
  } else {
    emitBounds()
  }
}

func teardownObserver() {
  clearElementWatches()
  if let o = observer {
    CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(o), .defaultMode)
  }
  observer = nil
  observedPid = 0
}

func observe(_ app: NSRunningApplication) {
  let pid = app.processIdentifier
  if pid == observedPid { return }
  teardownObserver()
  observedPid = pid
  currentBundleId = app.bundleIdentifier ?? ""
  var obs: AXObserver?
  guard AXObserverCreate(pid, axCallback, &obs) == .success, let o = obs else { return blurIfNeeded() }
  observer = o
  CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(o), .defaultMode)
  let appEl = AXUIElementCreateApplication(pid)
  AXObserverAddNotification(o, appEl, kAXFocusedUIElementChangedNotification as CFString, nil)
  refreshFocus()
}

// The single AXValue read in the whole binary — guarded so a secure field's
// value can never leave the target app (design invariant, R2).
func readValue(_ elementId: String) {
  guard let el = currentElement, !elementId.isEmpty, elementId == currentElementId else {
    return emit(["type": "readValue", "elementId": elementId, "ok": false, "error": "stale element"])
  }
  let role = stringAttr(el, kAXRoleAttribute) ?? ""
  let subrole = stringAttr(el, kAXSubroleAttribute) ?? ""
  if isSecure(role, subrole) {
    return emit(["type": "readValue", "elementId": elementId, "ok": false, "error": "secure field"])
  }
  guard let value = copyAttr(el, kAXValueAttribute) as? String else {
    return emit(["type": "readValue", "elementId": elementId, "ok": false, "error": "no AXValue"])
  }
  emit(["type": "readValue", "elementId": elementId, "ok": true, "value": value])
}

func verifyFocus(_ elementId: String) {
  var match = false
  if let el = currentElement, !elementId.isEmpty, elementId == currentElementId, observedPid != 0 {
    let appEl = AXUIElementCreateApplication(observedPid)
    if let focused = elementAttr(appEl, kAXFocusedUIElementAttribute) {
      match = CFEqual(focused, el)
    }
  }
  emit(["type": "verifyFocus", "elementId": elementId, "match": match])
}

func handleRequest(_ line: String) {
  let trimmed = line.trimmingCharacters(in: .whitespaces)
  if trimmed.isEmpty { return }
  guard let data = trimmed.data(using: .utf8),
        let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
        let op = obj["op"] as? String
  else {
    return emit(["type": "error", "message": "bad request"])
  }
  let elementId = obj["elementId"] as? String ?? ""
  switch op {
  case "readValue": readValue(elementId)
  case "verifyFocus": verifyFocus(elementId)
  default: emit(["type": "error", "message": "unknown op: \(op)"])
  }
}

if !AXIsProcessTrusted() {
  emit(["type": "error", "message": "accessibility permission not granted — add this binary (or your terminal) in System Settings › Privacy & Security › Accessibility, then rerun"])
  exit(1)
}

let activationToken = NSWorkspace.shared.notificationCenter.addObserver(
  forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
) { note in
  guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else { return }
  observe(app)
}
_ = activationToken

if let app = NSWorkspace.shared.frontmostApplication { observe(app) }

Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { _ in
  emit(["type": "heartbeat"])
}

DispatchQueue.global().async {
  while let line = readLine(strippingNewline: true) {
    DispatchQueue.main.async { handleRequest(line) }
  }
  // stdin closed → the parent (Electron main, or your terminal) is gone
  DispatchQueue.main.async { exit(0) }
}

RunLoop.main.run()
