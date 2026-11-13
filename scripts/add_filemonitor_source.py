"""Add the pinned custom FileMonitor host package to existing plugin indexes."""

import argparse
import hashlib
import re
import zipfile
from pathlib import Path

REVISION = "ce0e41149c6c0475e5039f1650b217c26776c507"
VERSION = "1.1.0-" + REVISION[:7]
DATE = "2026-11-13 17:58:23"
FILES = (
    "filemonitor.py",
    "identify_after_scan.py",
    "upgrade_host.py",
    "filemonitor.yml",
    "filemonitor.js",
    "filemonitor_config.py",
    "filemonitor_task_examples.py",
    "filemonitor_self_unit_test.py",
    "StashPluginHelper.py",
    "ModulesValidate.py",
    "requirements.txt",
    "README.md",
    "UPSTREAM_README.md",
    "LICENSE",
)


def build(source: Path, output: Path, repository: str) -> Path:
    content = {name: (source / name).read_bytes() for name in FILES}
    indexes = sorted(output.glob("index*.yml"))
    if not indexes:
        raise ValueError("No existing plugin indexes found")
    archive = output / "filemonitor-building.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as package:
        for name, data in sorted(content.items()):
            info = zipfile.ZipInfo(name, (2026, 11, 13, 17, 58, 24))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            package.writestr(info, data)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive = archive.rename(output / f"filemonitor-{REVISION[:12]}-{digest[:12]}.zip")
    url = f"https://github.com/{repository}/releases/download/stashui-preview/{archive.name}"
    entry = (
        "- id: filemonitor\n"
        "  name: FileMonitor (Custom Host)\n"
        f"  version: {VERSION}\n"
        f"  date: {DATE}\n"
        f"  path: {url}\n"
        f"  sha256: {digest}\n"
        "  metadata:\n"
        "    description: Host polling, targeted media scans, and optional Identify after scan.\n"
    )
    updates = []
    for index in indexes:
        text = index.read_text()
        if "- id: stash-curator\n" not in text:
            raise ValueError("Missing Curator entry; refusing to replace this index")
        blocks = re.split(r"(?m)(?=^- id: )", text)
        preserved = "".join(
            block for block in blocks if not block.startswith("- id: filemonitor\n")
        )
        updates.append((index, preserved.rstrip() + "\n\n" + entry))
    for index, text in updates:
        index.write_text(text)
    return archive


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--repository", default="thef4tdaddy/stash-curator")
    args = parser.parse_args()
    print(build(args.source, args.output, args.repository))
