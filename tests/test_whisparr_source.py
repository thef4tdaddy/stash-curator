"""The companion source must preserve Curator and exclude user configuration."""

import hashlib
import importlib.util
import zipfile
from pathlib import Path

import pytest

SCRIPT = Path(__file__).parents[1] / "scripts" / "add_whisparr_source.py"
spec = importlib.util.spec_from_file_location("whisparr_source", SCRIPT)
assert spec and spec.loader
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)


def test_package_preserves_all_curator_entries_and_configuration(tmp_path):
    plugin = tmp_path / "checkout" / "plugins" / "whisparr-sync"
    plugin.mkdir(parents=True)
    for name in (*source.FILES, "config.toml"):
        (plugin / name).write_text(name)
    (plugin / "state").mkdir()
    (plugin / "state" / "private.json").write_text("private checkpoint")
    output = tmp_path / "preview"
    output.mkdir()
    original = (
        "- id: stash-curator\n  version: existing\n"
        "  path: https://example.test/curator.zip\n  sha256: unchanged\n"
    )
    for name in ("index.yml", "index-linux-amd64.yml"):
        (output / name).write_text(original)
    archive = source.build(tmp_path / "checkout", output, "thef4tdaddy/stash-curator")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    for index in output.glob("index*.yml"):
        text = index.read_text()
        assert text.startswith(original)
        assert text.count("- id: stash-curator\n") == 1
        assert text.count("- id: whisparr-sync\n") == 1
        assert f"  sha256: {digest}\n" in text
        assert f"/stashui-preview/{archive.name}\n" in text
    with zipfile.ZipFile(archive) as package:
        assert package.testzip() is None
        assert set(package.namelist()) == {*source.FILES, "config.example.toml", "INSTALL.md"}
    # Running the companion publisher again neither duplicates entries nor changes bytes.
    source.build(tmp_path / "checkout", output, "thef4tdaddy/stash-curator")
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == digest
    assert (output / "index.yml").read_text().count("- id: whisparr-sync\n") == 1


def test_refuse_source_without_curator():
    with pytest.raises(ValueError, match="existing Stash Curator"):
        source.extend_source("- id: unrelated\n", "new entry\n")


def test_workflows_pin_the_same_reviewed_plugin_commit():
    root = Path(__file__).parents[1]
    for workflow in ("stashui-preview.yml", "whisparr-source.yml"):
        text = (root / ".github" / "workflows" / workflow).read_text()
        assert f"ref: {source.REVISION}" in text
        assert "group: stashui-preview" in text
