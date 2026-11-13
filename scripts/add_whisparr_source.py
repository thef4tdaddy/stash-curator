"""Package the pinned Whisparr Sync checkout and extend preview source indexes."""

from __future__ import annotations

import argparse
import hashlib
import re
import zipfile
from pathlib import Path

REVISION = "542d0c361eb0c34dec0ae94406c8138bf523e600"
VERSION = "1.1-" + REVISION[:7]
DATE = "2026-11-13 14:22:39"
FILES = ("whisparr-sync.py", "whisparr-sync.yml", "config.py", "requirements.txt")


def extend_source(text: str, entry: str) -> str:
    """Preserve other entries verbatim; replace only our companion entry."""
    blocks = re.split(r"(?m)(?=^- id: )", text)
    if not any(block.startswith("- id: stash-curator\n") for block in blocks):
        raise ValueError("Expected an existing Stash Curator source entry")
    preserved = "".join(block for block in blocks if not block.startswith("- id: whisparr-sync\n"))
    return preserved + ("" if preserved.endswith("\n") else "\n") + "\n" + entry


def build(source: Path, output: Path, repository: str) -> Path:
    plugin = source / "plugins" / "whisparr-sync"
    # Read every required file before modifying an index or emitting an archive.
    contents = {name: (plugin / name).read_bytes() for name in FILES}
    contents["config.example.toml"] = (plugin / "config.toml").read_bytes()
    contents["INSTALL.md"] = (
        "# Whisparr Sync preview\n\n"
        f"Source: https://github.com/thef4tdaddy/whisparr-sync/tree/{REVISION}\n\n"
        "Requires Python 3.11+ on Linux/macOS and the packages in requirements.txt "
        "installed in Stash's Python environment. Stash does not install these for you.\n\n"
        "Configure the Whisparr URL/key, enable MOVE_FILES and WHISPARR_RENAME, "
        "and verify container path mappings before identifying a test scene. "
        "Copy config.example.toml to config.toml if you need file-based settings. "
        "PATH_MAPPING maps Whisparr prefixes to Stash container prefixes. "
        "Existing config.toml and state/ are deliberately excluded from this archive.\n\n"
        "Whisparr handles moving and renaming. Existing Whisparr notifications update "
        "Stash. Requires one attached source file per scene; existing Whisparr files "
        "are retained. Exact Whisparr 3.6.6.1943 live compatibility is unverified; "
        "test one scene before bulk use. Preserve state/ across updates.\n"
    ).encode()
    indexes = sorted(output.glob("index*.yml"))
    if not indexes:
        raise ValueError("No existing source indexes found")
    archive = output / "whisparr-sync-building.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as package:
        for name, data in sorted(contents.items()):
            info = zipfile.ZipInfo(name, (2026, 11, 13, 12, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            package.writestr(info, data)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive = archive.rename(output / f"whisparr-sync-{REVISION[:12]}-{digest[:12]}.zip")
    url = f"https://github.com/{repository}/releases/download/stashui-preview/{archive.name}"
    entry = (
        "- id: whisparr-sync\n"
        "  name: Whisparr Sync\n"
        f"  version: {VERSION}\n"
        f"  date: {DATE}\n"
        f"  path: {url}\n"
        f"  sha256: {digest}\n"
        "  metadata:\n"
        "    description: Import identified Stash scenes; Whisparr moves and renames files.\n"
    )
    updates = [(index, extend_source(index.read_text(), entry)) for index in indexes]
    for index, text in updates:
        index.write_text(text)
    return archive


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--repository", default="thef4tdaddy/stash-curator")
    args = parser.parse_args()
    print(build(args.source, args.output, args.repository))
