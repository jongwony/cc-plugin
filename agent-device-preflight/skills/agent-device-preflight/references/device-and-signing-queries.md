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

Run this before registering a device, to check whether an existing profile already covers
it for the target team.

```bash
UDID=<target udid>
TEAM=<the OU value from step 5>
for f in ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/*.mobileprovision; do
  security cms -D -i "$f" > /tmp/p.plist 2>/dev/null && python3 -c "
import plistlib
d = plistlib.load(open('/tmp/p.plist','rb'))
devs = d.get('ProvisionedDevices') or []
team = (d.get('TeamIdentifier') or [None])[0]
print(d.get('Name'), '| team:', team, '| devices:', len(devs),
      '| covers target:', '$UDID' in devs and team == '$TEAM')
"
done
```

A profile that lists the device but reports a different `team` does not help you: coverage is
per team. Read `covers target` as false unless both columns agree.

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
