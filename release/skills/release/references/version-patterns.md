# Version File Patterns

Patterns for detecting and updating version strings in common project types.

## Detection Priority

Search files in this order (first match wins):

1. `package.json` - Node.js/npm projects
2. `Cargo.toml` - Rust projects
3. `pyproject.toml` - Python (PEP 621)
4. `setup.py` - Python (legacy)
5. `init.lua` - Hammerspoon Spoons

## Pattern Specifications

### package.json (Node.js)

```json
{
  "version": "1.2.3"
}
```

**Detection**: `jq -r .version package.json`

**Update**: `jq --arg v "$NEW_VERSION" '.version = $v' package.json > tmp && mv tmp package.json`

**Notes**:
- Also updates `package-lock.json` if exists (use `npm version $NEW_VERSION --no-git-tag-version`)
- Prefer `npm version` command when available

### Cargo.toml (Rust)

```toml
[package]
name = "my-crate"
version = "1.2.3"
```

**Detection**: `grep '^version = ' Cargo.toml | head -1 | sed 's/version = "\(.*\)"/\1/'`

**Update**: `sed -i '' 's/^version = ".*"/version = "'$NEW_VERSION'"/' Cargo.toml`

**Notes**:
- Updates `Cargo.lock` automatically on next build
- May have workspace version in root `Cargo.toml`

### pyproject.toml (Python PEP 621)

```toml
[project]
name = "my-package"
version = "1.2.3"
```

**Detection**: `grep '^version = ' pyproject.toml | head -1 | sed 's/version = "\(.*\)"/\1/'`

**Update**: `sed -i '' 's/^version = ".*"/version = "'$NEW_VERSION'"/' pyproject.toml`

**Notes**:
- May use dynamic version from `__version__.py`
- Check for `[tool.poetry]` section for Poetry projects

### setup.py (Python Legacy)

```python
setup(
    name="my-package",
    version="1.2.3",
)
```

**Detection**: `grep "version=" setup.py | sed "s/.*version=['\"]\\([^'\"]*\\)['\"].*/\\1/"`

**Update**: `sed -i '' "s/version=['\"][^'\"]*['\"]/version='$NEW_VERSION'/" setup.py`

**Notes**:
- Quote style varies (`'` or `"`)
- May reference `__version__` variable

### init.lua (Hammerspoon Spoons)

```lua
obj.version = "1.2.3"
```

**Detection**: `grep 'obj.version = ' init.lua | sed 's/obj.version = "\(.*\)"/\1/'`

**Update**: `sed -i '' 's/obj.version = ".*"/obj.version = "'$NEW_VERSION'"/' init.lua`

**Notes**:
- Also update `docs.json` if present:
  ```json
  { "version": "1.2.3" }
  ```

## Version String Format

All versions follow Semantic Versioning (semver):

```
MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]
```

**Examples**:
- `1.0.0` - Release
- `1.0.0-alpha.1` - Prerelease
- `1.0.0-rc.1` - Release candidate
- `1.0.0+build.123` - Build metadata

## Bump Calculations

| Current | Type | Result |
|---------|------|--------|
| 1.2.3 | patch | 1.2.4 |
| 1.2.3 | minor | 1.3.0 |
| 1.2.3 | major | 2.0.0 |
| 1.2.3-alpha | patch | 1.2.3 |
| 1.2.3-alpha | minor | 1.3.0 |
| 1.2.3-alpha | major | 2.0.0 |

## Multiple Version Files

Some projects have multiple version sources:

### Node.js + package-lock.json

```bash
npm version $TYPE --no-git-tag-version
```

### Python with __version__.py

Update both `pyproject.toml` and `src/package/__version__.py`:
```python
__version__ = "1.2.3"
```

### Hammerspoon with docs.json

Update both `init.lua` and `docs.json`.

## Validation

Before updating, verify:

1. File exists and is readable
2. Current version matches expected pattern
3. New version is greater than current (semver comparison)
4. No uncommitted changes to version file (optional warning)
