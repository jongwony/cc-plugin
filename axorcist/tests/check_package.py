"""Check marketplace delivery and instruction references without installing plugins."""
import json
import pathlib
import re

root = pathlib.Path(__file__).resolve().parents[2]
manifest = json.loads((root / '.claude-plugin/marketplace.json').read_text())
entries = [p for p in manifest['plugins'] if p['name'] == 'axorcist']
assert len(entries) == 1 and entries[0]['source'] == './axorcist'
plugin = json.loads((root / 'axorcist/.claude-plugin/plugin.json').read_text())
assert plugin['name'] == 'axorcist' and re.fullmatch(r'\d+\.\d+\.\d+', plugin['version'])
skill = root / 'axorcist/skills/axorcist/SKILL.md'
text = skill.read_text()
assert text.startswith('---\nname: axorcist\ndescription:')
assert len(text.splitlines()) < 150
for rel in re.findall(r'\]\((references/[^)]+)\)', text):
    assert (skill.parent / rel).is_file(), rel
skip = re.search(r'^SKIP_PLUGINS="([^"]+)"', (root / 'scripts/install.sh').read_text(), re.M)
assert skip and 'axorcist' in skip[1].split()
print('marketplace, opt-in installation, manifest and skill references: OK')
