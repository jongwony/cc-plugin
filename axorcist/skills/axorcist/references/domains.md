# Domain bindings

## Find My — observation only

Use the user's selected machine and `com.apple.findmy`. Confirm the actual main
window, Devices tab and device-list region, and resolve the requested device
names exactly. A map annotation and a device-list row may name the same device;
count the intended row domain, not every occurrence of its name in the app.

One installation's device-list rows used `AXIdentifier` beginning
`ListEntityRow` and `AXDescription` beginning the exact device name followed by a
comma; this is not a portable schema. Re-observe the
role, identifier and delimiter on the current app before adopting it. A prefix
without that verified delimiter can include a different device.

The adapter's filter has exact-equality semantics; a prefix predicate belongs in
a target's `match`, not in `filter`. If returned rows cannot be assigned to the
confirmed list region, leave domain uniqueness unresolved. Where an existing
Find My helper already checks tab, window, row multiplicity or session state,
retain those checks and treat this adapter as additional evidence.

Preserve the displayed location and update/offline/paused wording. Separately
state whether the display indicates a current or last-known location, and leave
ambiguous freshness unknown. An AX read cannot refresh or certify Apple's
location service. User observation permission covers only the named devices;
location sharing, sound, lost mode and erasure remain outside this read workflow.
Web Find Devices and the native app have different sessions and UI contracts.
Guest fixture success establishes neither native Find My support in a VM nor
host display-off/locked-session access.

## KakaoTalk — existing helper owns the workflow

Route `com.kakao.KakaoTalkMac` to the **kakao** plugin's `skills/kakao/SKILL.md`
and follow its installed version. That skill owns room discovery/open handshake,
exact-title/window binding, room-scoped reads, draft ownership, send verification,
intervals and uncertain-send recovery. The new adapter rejects that bundle ID.

Use only the fallback steps the kakao skill itself assigns. Generic AX writes,
keyboard events or screenshots do not replace its send/room protections. If the
plugin is unavailable, report the missing dependency; a successful generic read
would not establish those protections.
