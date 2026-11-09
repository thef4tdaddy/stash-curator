#!/usr/bin/env python3
"""Add this fork's Stash UI adapter to an existing Curator installation."""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ADAPTER_COMMIT = "5926aff91e164ab06090ab0d2669538f67c40c92"
ADAPTER_SHA256 = "bca5d670b9b13b98dd34105d6caf7e40700c4b81d7cbd0dddd292586e07d476c"
ADAPTER_URL = (
    "https://raw.githubusercontent.com/thef4tdaddy/stash-curator/"
    f"{ADAPTER_COMMIT}/plugin/assets/stashui.js"
)


def with_assets(text: str) -> str:
    """Preserve the installed version and every setting; expose only assets/."""
    newline = "\r\n" if "\r\n" in text else "\n"
    lines = text.splitlines(keepends=True)
    positions = [i for i, line in enumerate(lines) if line.strip() == "ui:"]
    if len(positions) != 1:
        raise ValueError("Expected one ui: section in stash-curator.yml")
    start = positions[0]
    end = next(
        (i for i in range(start + 1, len(lines)) if re.match(r"^[A-Za-z_]", lines[i])),
        len(lines),
    )
    block = "".join(lines[start + 1 : end])
    assets = re.search(r"(?m)^  assets:[ \t]*\r?$", block)
    if assets:
        remaining = block[assets.end() :]
        mapping = re.split(r"(?m)^  [A-Za-z_]", remaining, maxsplit=1)[0]
        root = re.search(r"(?m)^    /:\s*(.*?)\s*$", mapping)
        if root:
            if root.group(1).strip("\"'") != "assets":
                raise ValueError("Existing ui.assets root mapping differs; no files changed")
            return text
        raise ValueError("Custom ui.assets mapping found; no files changed")
    lines.insert(start + 1, f"  assets:{newline}    /: assets{newline}")
    return "".join(lines)


def find_plugin() -> Path:
    roots = {
        Path.home() / ".stash" / "plugins",
        Path("/root/.stash/plugins"),
        Path("/config/plugins"),
    }
    matches = {
        path.parent.resolve()
        for root in roots
        if root.is_dir()
        for path in root.rglob("stash-curator.yml")
        if "curator-stashui-backups" not in path.parts
        and (path.parent / "stash-curator.js").is_file()
    }
    if len(matches) != 1:
        raise ValueError(
            "Pass the installed Curator folder as the argument "
            "(the folder containing stash-curator.yml)"
        )
    return matches.pop()


def atomic_write(path: Path, content: bytes) -> None:
    mode = path.stat().st_mode & 0o777 if path.exists() else 0o644
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
        staged = Path(temporary.name)
        temporary.write(content)
    try:
        staged.chmod(mode)
        os.replace(staged, path)
    finally:
        staged.unlink(missing_ok=True)


def install(
    directory: Path, adapter: bytes, *, expected_sha256: str | None = ADAPTER_SHA256
) -> Path | None:
    directory = directory.resolve()
    manifest = directory / "stash-curator.yml"
    if not manifest.is_file() or not (directory / "stash-curator.js").is_file():
        raise ValueError("This is not an installed Curator folder; install Curator first")
    if expected_sha256 is not None and hashlib.sha256(adapter).hexdigest() != expected_sha256:
        raise ValueError("Adapter checksum mismatch; no files changed")
    original = manifest.read_bytes()
    replacement = with_assets(original.decode("utf-8")).encode("utf-8")
    target = directory / "assets" / "stashui.js"
    if original == replacement and target.is_file() and target.read_bytes() == adapter:
        return None
    # Back up only the two affected files, outside the installed plugin folder.
    # Keep the standalone installer compatible with Python older than 3.11.
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")  # noqa: UP017
    backup = directory.parent / "curator-stashui-backups" / stamp
    backup.mkdir(parents=True)
    # A .bak suffix prevents Stash discovering the backup as another plugin.
    shutil.copy2(manifest, backup / (manifest.name + ".bak"))
    if target.exists():
        shutil.copy2(target, backup / "stashui.js")
    target.parent.mkdir(exist_ok=True)
    atomic_write(target, adapter)
    atomic_write(manifest, replacement)
    return backup


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "plugin_dir", nargs="?", type=Path, help="Installed folder containing stash-curator.yml"
    )
    parser.add_argument(
        "--adapter-file", type=Path, help="Use a local adapter instead of downloading"
    )
    args = parser.parse_args()
    try:
        directory = args.plugin_dir or find_plugin()
        if args.adapter_file is None:
            # Download and verify before changing any installed file.
            with urllib.request.urlopen(ADAPTER_URL, timeout=60) as response:
                adapter = response.read()
            backup = install(directory, adapter)
        else:
            backup = install(directory, args.adapter_file.read_bytes(), expected_sha256=None)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Installation stopped: {error}\n")
    print("Stash UI adapter installed." if backup else "Stash UI adapter is already installed.")
    if backup:
        print(f"Backup: {backup}")
    print("Reload plugins in Stash, then refresh Stash UI.")
    print(
        "If Curator still opens the old view, run this in the Stash UI browser console, "
        "then refresh:"
    )
    print('localStorage.removeItem("stashui.extMods1")')
    print("Open Extensions → Stash Curator.")
    print("Upstream Curator updates may replace this adapter; rerun this installer afterward.")


if __name__ == "__main__":
    main()
