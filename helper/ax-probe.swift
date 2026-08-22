// ax-probe — Phase 3 M0 (docs/phase3/anchored-icon.md §Milestones): standalone AX
// probe CLI and the future helper binary's protocol reference implementation.
//
// Build:  xcrun swiftc -O -o ax-probe helper/ax-probe.swift
// Run:    ./ax-probe          (needs the Accessibility grant; prompts nothing itself)
//
// stdout — one JSON event per line (NDJSON), all with a ts (ms epoch):
//   {"type":"focus","bundleId","pid","role","subrole","secure","x","y","width","height","elementId","windowFrame"}
//   {"type":"bounds","elementId","x","y","width","height","windowFrame"}   element/window moved or resized
//   (windowFrame = the owning window's {x,y,width,height}, {} when unresolvable)
//   {"type":"blur"}                                          no focused element
//   {"type":"heartbeat"}                                     every 3s (liveness)
//   {"type":"axEnable","bundleId","method":"manual"|"enhanced"|"already"|"none"}  Chromium AX-tree poke outcome
//   (argv = bundle ids to never poke; pokes are reverted on exit/SIGTERM)
//   {"type":"error","message"}
// stdin — request/response:
//   {"op":"readValue","elementId"}   → {"type":"readValue","elementId","ok","value"|"error"}
//   {"op":"verifyFocus","elementId"} → {"type":"verifyFocus","elementId","match"}
// An elementId is only valid while it is the CURRENT focus — requests against
// any other id answer ok:false / match:false. Do not cache ids across focus events.
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

// Bundle ids passed as argv: apps the consumer will never anchor on (its
// denylist) — don't wake their AX trees; the poke flips screen-reader
// detection in Chromium editors. pokedApps tracks what WE set, per pid, so
// exit can revert exactly that and nothing an assistive client owns.
let deniedBundles = Set(CommandLine.arguments.dropFirst())
var pokedApps: [pid_t: String] = [:]

var observer: AXObserver?
var observedPid: pid_t = 0
var lastPolledFrame = CGRect.zero
var currentBundleId = ""
var currentElement: AXUIElement?
var currentWindow: AXUIElement?
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

func frameDict(_ f: CGRect) -> [String: Any] {
  ["x": Double(f.origin.x), "y": Double(f.origin.y),
   "width": Double(f.size.width), "height": Double(f.size.height)]
}

// The owning window's rect, for the consumer's visible-portion clamp (R4).
// The window element is resolved once per focus (currentWindow); only its
// rect is re-read per emission (the window can move). Empty when unresolvable
// — consumers fall back to the element rect alone.
func currentWindowFrame() -> [String: Any] {
  guard let win = currentWindow, let f = rect(of: win) else { return [:] }
  return frameDict(f)
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
  currentWindow = nil
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
    "elementId": currentElementId,
    "windowFrame": currentWindowFrame()
  ])
}

func emitBounds(_ f: CGRect) {
  lastPolledFrame = f // both emit paths share the poll's change detector
  emit([
    "type": "bounds",
    "elementId": currentElementId,
    "x": Double(f.origin.x),
    "y": Double(f.origin.y),
    "width": Double(f.size.width),
    "height": Double(f.size.height),
    "windowFrame": currentWindowFrame()
  ])
}

func refreshFocus() {
  guard observedPid != 0 else { return blurIfNeeded() }
  clearElementWatches()
  let appEl = AXUIElementCreateApplication(observedPid)
  guard let el = elementAttr(appEl, kAXFocusedUIElementAttribute) else { return blurIfNeeded() }
  currentElement = el
  currentWindow = elementAttr(el, kAXWindowAttribute)
  currentElementId = String(CFHash(el))
  hadFocus = true
  lastPolledFrame = rect(of: el) ?? .zero
  emitFocus(el)
  for n in [kAXMovedNotification, kAXResizedNotification] {
    watch(el, n)
    if let win = currentWindow { watch(win, n) }
  }
}

let axCallback: AXObserverCallback = { _, _, notification, _ in
  if (notification as String) == kAXFocusedUIElementChangedNotification {
    refreshFocus()
  } else if let el = currentElement, let f = rect(of: el) {
    emitBounds(f)
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

// Chromium builds its AX tree only once an assistive client announces itself.
// Electron listens for AXManualAccessibility (its public opt-in, electron#10305)
// but some versions reject it (electron#37465); vanilla Chromium listens for the
// older AXEnhancedUserInterface, hence the fallback. Native apps refuse both
// sets with attributeUnsupported — the harmless "none". An attribute another
// AX client (VoiceOver) already set is left alone ("already") — we only ever
// revert what we set ourselves.
func enableAXTree(_ appEl: AXUIElement, _ pid: pid_t) -> String {
  for (attr, label) in [("AXManualAccessibility", "manual"), ("AXEnhancedUserInterface", "enhanced")] {
    if (copyAttr(appEl, attr) as? Bool) == true { return "already" }
    if AXUIElementSetAttributeValue(appEl, attr as CFString, kCFBooleanTrue) == .success {
      pokedApps[pid] = attr
      return label
    }
  }
  return "none"
}

func revertPokes() {
  for (pid, attr) in pokedApps {
    AXUIElementSetAttributeValue(AXUIElementCreateApplication(pid), attr as CFString, kCFBooleanFalse)
  }
  pokedApps = [:]
}

func observe(_ app: NSRunningApplication) {
  let pid = app.processIdentifier
  if pid == observedPid { return }
  teardownObserver()
  observedPid = pid
  currentBundleId = app.bundleIdentifier ?? ""
  var obs: AXObserver?
  guard AXObserverCreate(pid, axCallback, &obs) == .success, let o = obs else {
    observedPid = 0  // else the pid == observedPid early-return blocks any retry
    return blurIfNeeded()
  }
  observer = o
  CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(o), .defaultMode)
  let appEl = AXUIElementCreateApplication(pid)
  let axMethod = deniedBundles.contains(currentBundleId) ? "none" : enableAXTree(appEl, pid)
  emit(["type": "axEnable", "bundleId": currentBundleId, "method": axMethod])
  AXObserverAddNotification(o, appEl, kAXFocusedUIElementChangedNotification as CFString, nil)
  refreshFocus()
  if axMethod == "manual" || axMethod == "enhanced" {
    // The poked tree builds asynchronously — sometimes past 0.5s — and the
    // immediate read can resolve a pre-poke stub element, so re-resolve on a
    // schedule regardless of what it found (a duplicate focus is harmless).
    for delay in [0.6, 1.8] {
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
        if observedPid == pid { refreshFocus() }
      }
    }
  }
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

// Bound every AX call process-wide: a beachballing target app must never block
// this run loop past the heartbeat budget (the driver kills a silent helper
// after 6s and burns a respawn attempt). 0.5s per call keeps the worst
// poll+emit chain of a few calls well inside one 3s heartbeat interval.
AXUIElementSetMessagingTimeout(AXUIElementCreateSystemWide(), 0.5)

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

// In-page scrolling moves the focused element with NO AX notification (moved/
// resized fire for window changes only) — poll the frame and emit bounds on
// change. The moved/resized observers stay for the crisp window-drag path.
// 60ms so motion-end (scroll stop, Space-slide finish) is detected fast — the
// consumer's settle window sits just above this (contract-tested ordering).
// ponytail: flat poll; event-driven if AX ever grows a scroll notification.
Timer.scheduledTimer(withTimeInterval: 0.06, repeats: true) { _ in
  guard let el = currentElement, let f = rect(of: el) else { return }
  if f != lastPolledFrame { emitBounds(f) }
}

// The driver kills with SIGTERM — revert the pokes before dying so the
// AX-tree flag never outlives us on the target apps.
signal(SIGTERM, SIG_IGN)
let termSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
termSource.setEventHandler {
  revertPokes()
  exit(0)
}
termSource.resume()

DispatchQueue.global().async {
  while let line = readLine(strippingNewline: true) {
    DispatchQueue.main.async { handleRequest(line) }
  }
  // stdin closed → the parent (Electron main, or your terminal) is gone
  DispatchQueue.main.async {
    revertPokes()
    exit(0)
  }
}

RunLoop.main.run()
