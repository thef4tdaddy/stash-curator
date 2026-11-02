from pathlib import Path

import pytest

from scripts.install_stashui import install, with_assets


def test_installer_preserves_version_settings_and_database(tmp_path: Path):
    plugin = tmp_path / "stash-curator"
    plugin.mkdir()
    manifest = plugin / "stash-curator.yml"
    original = (
        "name: Stash Curator\nversion: 0.52.0\nui:\n  javascript:\n"
        "    - stash-curator.js\nsettings:\n  databasePath:\n    type: STRING\n"
    )
    manifest.write_text(original)
    frontend = plugin / "stash-curator.js"
    frontend.write_text("existing frontend")
    database = plugin / "data" / "curator.sqlite3"
    database.parent.mkdir()
    database.write_bytes(b"unchanged test database")
    adapter = (Path(__file__).parents[2] / "plugin" / "assets" / "stashui.js").read_bytes()
    backup = install(plugin, adapter)
    assert backup is not None
    assert (backup / (manifest.name + ".bak")).read_text() == original
    assert not list(backup.rglob("*.yml"))
    assert "version: 0.52.0" in manifest.read_text()
    assert "settings:\n  databasePath:" in manifest.read_text()
    assert "  assets:\n    /: assets\n" in manifest.read_text()
    assert frontend.read_text() == "existing frontend"
    assert database.read_bytes() == b"unchanged test database"
    assert (plugin / "assets" / "stashui.js").read_bytes() == adapter
    assert install(plugin, adapter) is None


def test_installer_refuses_bad_download_before_writes(tmp_path: Path):
    (tmp_path / "stash-curator.yml").write_text("ui:\n  javascript:\n    - stash-curator.js\n")
    (tmp_path / "stash-curator.js").write_text("existing")
    before = (tmp_path / "stash-curator.yml").read_bytes()
    with pytest.raises(ValueError, match="checksum"):
        install(tmp_path, b"wrong download")
    assert (tmp_path / "stash-curator.yml").read_bytes() == before
    assert not (tmp_path / "assets").exists()


def test_asset_mount_preserves_crlf_and_rejects_conflicts():
    text = "ui:\r\n  javascript:\r\n    - stash-curator.js\r\nsettings:\r\n"
    updated = with_assets(text)
    assert "  assets:\r\n    /: assets\r\n" in updated
    assert with_assets(updated) == updated
    with pytest.raises(ValueError, match="differs"):
        with_assets("ui:\n  assets:\n    /: another-folder\nsettings:\n")
