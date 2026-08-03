# Android Preflight

Attachment prerequisites for a physical Android device.

Read `SKILL.md` first. The CLI-version check, the sandbox note, session naming, stale
device claims, and the daemon restart all live there and are not repeated here.

**If you came from `ios-preflight.md`, read item 3 before you run anything.** Every item
below that has an iOS counterpart inverts it — which selector works, whether signing is
needed, how a locked device announces itself, and what a slow-snapshot warning means.
Carrying an iOS habit across is the fastest way to lose a session here.

## 1. Toolchain — `adb` on `PATH`, and nothing else

No Android Studio and no full SDK. `platform-tools` is an SDK component, but it is the only
one needed, and it can be installed on its own.

Check before installing anything:

```bash
adb version
```

If that answers, this item is done — skip the install. If `adb` is not found, the smallest
thing that satisfies the requirement is:

```bash
brew install --cask android-platform-tools   # WRITES: links adb, fastboot et al. into PATH
```

**Ask the user before running it and wait for their answer.** It needs no password and is
reversible (`brew uninstall --cask android-platform-tools`), so this is a lighter gate than
the iOS `sudo` and device-registration steps — but it still installs software on their
machine, and choosing a package manager is theirs to make.

The CLI resolves adb two ways and the second one is enough. `dist/src/manifest.js` looks
under `ANDROID_HOME` / `ANDROID_SDK_ROOT` for `platform-tools`, and otherwise falls back to
`adb` on `PATH`. With no SDK present at all, `doctor` reports

```
- toolchain: Android toolchain: Android Debug Bridge version 1.0.41; ANDROID_HOME unset.
```

and still passes. **`ANDROID_HOME unset` is a note, not a blocker** — do not go install an
SDK because you saw it.

## 2. USB debugging, and the authorization handshake

On the device: Developer options → USB debugging. Then connect by cable and accept the
on-device prompt ("Allow USB debugging?"), with "Always allow from this computer" checked.

```bash
adb devices -l
```

Declining that prompt — or never seeing it — does not produce an empty list. It produces:

```
<adb-serial>   unauthorized   usb:34603008X   transport_id:1
```

**Read the `usb:` and `transport_id:` fields before suspecting hardware.** Their presence
means the transport is already working and only the authorization is outstanding; the cable,
the port, and the USB-debugging toggle are all accounted for. `unauthorized` is a pending
handshake, not a connection problem.

The prompt only renders on an unlocked screen. A device plugged in while locked sits at
`unauthorized` with no dialog to accept. Unlock, then re-plug.

## 3. The selector is the display name, not the id — the inverse of iOS

```bash
agent-device devices --platform android --json
```

```json
{ "platform": "android", "id": "<adb-serial>", "name": "Pixel 7", ... }
```

`id` is the adb serial. **`--device` rejects it and accepts `name`.** Verified on both
`doctor` and `open`:

| Passed | Result |
|---|---|
| `--device "Pixel 7"` | works |
| `--device` omitted | works |
| `--device <adb serial>` | fails |
| `--udid <adb serial>` | fails |

The failure is reported as:

```
⨯ device: No Android devices found.
  run: agent-device devices --platform android
```

Both halves mislead. It reads as *no device is present* when one is connected and
authorized, and the command it prescribes as the remedy is the one that disproves it —
run it and the device is listed. Nothing about the message points at the selector, which
is the actual cause.

This is where an iOS reader lands hardest. `ios-preflight.md` item 1 says **always pass
`--udid`**, because on iOS the on-screen Identifier is not the selector and omitting the
flag silently targets a simulator. Both halves of that habit fail here: the serial-shaped
id is the wrong thing to pass, and omitting the selector is fine.

## 4. Device is unlocked — read it, do not assume it

```bash
adb shell dumpsys power | grep mWakefulness=
adb shell dumpsys window | grep mDreamingLockscreen
```

On a working run:

```
mWakefulness=Awake
mShowingDream=false mDreamingLockscreen=false
```

Unlike iOS — where a locked device lets `open` report success and only surfaces as a
timeout several steps later — Android names the problem at the first command that needs
the device. That makes the readout above a confirmation step rather than the diagnosis of
an otherwise-silent failure.

## 5. The snapshot helper is installed on the device

A plain `snapshot` installs one package:

```
com.callstack.agentdevice.snapshothelper
```

`com.callstack.agentdevice.imehelper` did **not** appear after `open` + `snapshot` + `close`.
That is the whole observation — the ordinary path did not install it. Why it did not, and
what would, is untested here; `--test-ime` was never run (see *Scope not covered*). Both APKs
ship inside the installed CLI at `android/{snapshot-helper,ime-helper}/dist/`.

Tell the user before the first run — this puts an app on their device. Removal:

```bash
adb shell pm list packages | grep agentdevice
adb uninstall com.callstack.agentdevice.snapshothelper
```

**No signing setup exists on Android.** callstack's own package ids are installed as-is.
There is no counterpart to `AGENT_DEVICE_IOS_BUNDLE_ID`, no team id to derive, and no
provisioning profile to cover the device — items 4 and 5 of the iOS preflight have no
Android analogue at all.

## 6. The first-snapshot slowness warning is noise

A 2.1-second capture still printed:

```
Warning: android snapshots are slow in this run: p95 1925ms over 1 captures.
Possible causes: device load, app or dev server stuck, helper fallback, or stale daemon.
```

A p95 over one sample is not a p95. On the first capture of a session there is no
distribution to take a percentile of, so the warning fires on a healthy run and its list of
"possible causes" sends you looking for a problem that is not there.

Inverted from iOS again: there a first snapshot genuinely takes 20–30s and the CLI
pre-announces it. Here the capture is roughly ten times faster and the CLI complains anyway.

## 7. Choose the verification target deliberately

`agent-device open com.android.settings` resumes the Settings screen that was last viewed
rather than opening the root list, so the starting state is not deterministic between runs.

In this session it resumed the device-information page, and the snapshot captured the
device's IMEI, IP addresses, Wi-Fi MAC address, and Bluetooth address. **Snapshot output is
transcript-visible**, so a verification target should be chosen for content that is not
identifying — `com.android.settings` is not the neutral choice its iOS counterpart
(`com.apple.Preferences`) is.

## Verify

```bash
agent-device doctor --platform android --device "<display name>"
agent-device open <package> --platform android --device "<display name>" --session preflight
agent-device snapshot -i --session preflight
agent-device close --session preflight
```

The snapshot is the gate. `doctor` passing tells you the device resolved and adb answered;
it does not tell you the helper installed or that the accessibility capture works.

Once this passes, hand off: `agent-device help workflow`.

## Failure → cause

Each row names the cause this file has evidence for, not the only cause the symptom can have.

| Symptom | Cause | Section |
|---|---|---|
| `adb devices -l` reports `unauthorized`, with `usb:` and `transport_id:` present | RSA prompt never accepted; screen was locked when plugged in | 2 |
| `⨯ device: No Android devices found.` while `agent-device devices --platform android` lists the device | adb serial passed as the selector — pass the display name | 3 |
| `⨯ device: No Android devices found.` and `adb devices` is also empty | not connected, or USB debugging off | 1, 2 |
| `p95 ... over 1 captures` on the first snapshot | statistic over a single sample; not a signal | 6 |
| Snapshot contains IMEI / MAC / IP | Settings resumed a device-information page | 7 |
| `ANDROID_HOME unset` in `doctor` output | a note; adb on `PATH` already satisfies the toolchain | 1 |

## Scope not covered

Named rather than guessed at — none of these were exercised:

- **Emulator / AVD.** No emulator was installed, so the iOS hazard where virtual devices
  win device resolution is **untested** on Android. Do not assume it does or does not apply.
- **`--test-ime`** and the IME helper install path.
- **React Native / Expo Metro reachability** (`adb reverse`).
- **Whether the beta OS build affects any of the above** — see the verification domain below.

## Verification domain

Verified against a Pixel 7 (`panther_beta`) on Android 17 / API 37, with agent-device 0.20.3
and adb 37.0.1, through `devices`, `doctor`, `open`, `snapshot`, and `close`. One device, one
OS build, one CLI version — nothing here is claimed beyond that.
