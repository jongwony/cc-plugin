# Device and Signing Queries

Read-only queries the preflight steps call for.

## Deriving the device UDID

Run this to get the selector `--udid` actually takes, rather than the Identifier column
`xcrun devicectl list devices` prints on screen.

```bash
xcrun devicectl list devices --json-output /tmp/dev.json >/dev/null
python3 -c "
import json
for d in json.load(open('/tmp/dev.json'))['result']['devices']:
    p, h = d['deviceProperties'], d['hardwareProperties']
    c = d['connectionProperties']
    print(p.get('name'), h.get('udid'), '|', h.get('marketingName'),
          '| transport:', c.get('transportType'), '| tunnel:', c.get('tunnelState'),
          '| devMode:', p.get('developerModeStatus'))
"
```

## Checking provisioning-profile coverage

Run this before registering a device, to check whether an existing profile already covers it —
for the target team, and for both App IDs the runner needs.

```bash
UDID=<target udid>
TEAM=<the OU value from step 5>
BUNDLE=<the AGENT_DEVICE_IOS_BUNDLE_ID value from step 5>
for f in ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/*.mobileprovision; do
  security cms -D -i "$f" > /tmp/p.plist 2>/dev/null && python3 -c "
import plistlib, fnmatch
d = plistlib.load(open('/tmp/p.plist','rb'))
devs = d.get('ProvisionedDevices') or []
team = (d.get('TeamIdentifier') or [None])[0]
appid = (d.get('Entitlements') or {}).get('application-identifier') or ''
def ok(w): return '$UDID' in devs and team == '$TEAM' and fnmatch.fnmatch(w, appid)
print(d.get('Name'), '| team:', team, '| app id:', appid, '| devices:', len(devs),
      '| runner:', ok('$TEAM.$BUNDLE'), '| uitests:', ok('$TEAM.$BUNDLE.uitests'))
"
done
```

Three things have to line up, and the device UDID alone is none of them. A profile that lists
the device but reports a different `team` does not help you — coverage is per team. A same-team
profile issued for an unrelated App ID does not help either, which is why the `app id` column
is printed: it is the pattern the runner's identifier has to match.

You need **both** the `runner` and `uitests` columns true, across the profiles you have. One
wildcard profile (`app id` ending in `.*`) satisfies both at once; an explicit profile names a
single App ID, so two of them are needed between them. Nothing covering both means the
registration step below is still owed.

## Confirming what a built runner is signed for

Run this after a cache clear or a signing change, to confirm which device and team a built
runner is actually signed for.

```bash
# There is one of these per cache dir — inspect every one, not the first found.
find ~/.agent-device/apple-runner/derived/ios-device \
     -name "AgentDeviceRunnerUITests-Runner.app" -maxdepth 5 | while read -r APP; do
  security cms -D -i "$APP/embedded.mobileprovision" > /tmp/emb.plist 2>/dev/null || continue
  python3 -c "
import plistlib, sys
d = plistlib.load(open('/tmp/emb.plist','rb'))
print('$APP')
print('  UUID:', d.get('UUID'), '| team:', (d.get('TeamIdentifier') or [None])[0],
      '| devices:', d.get('ProvisionedDevices'))
"
done
```
