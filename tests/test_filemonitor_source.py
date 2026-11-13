"""Custom FileMonitor publication preserves all other source entries."""

import hashlib
import importlib.util
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "filemonitor_source", Path(__file__).parents[1] / "scripts/add_filemonitor_source.py"
)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_filemonitor_package_preserves_existing_plugins(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    for name in module.FILES:
        (source / name).write_text(name)
    output = tmp_path / "output"
    output.mkdir()
    existing = "- id: stash-curator\n  version: keep\n\n- id: whisparr-sync\n  version: keep\n"
    (output / "index.yml").write_text(existing)
    archive = module.build(source, output, "thef4tdaddy/stash-curator")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    text = (output / "index.yml").read_text()
    assert text.startswith(existing)
    assert text.count("- id: filemonitor\n") == 1
    assert f"  sha256: {digest}\n" in text
    with zipfile.ZipFile(archive) as package:
        assert package.testzip() is None
        assert set(package.namelist()) == set(module.FILES)
    module.build(source, output, "thef4tdaddy/stash-curator")
    assert (output / "index.yml").read_text().count("- id: filemonitor\n") == 1
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == digest


def test_workflows_pin_the_reviewed_filemonitor_revision():
    root = Path(__file__).parents[1]
    for workflow in ("stashui-preview.yml", "whisparr-source.yml"):
        text = (root / ".github/workflows" / workflow).read_text()
        assert f"ref: {module.REVISION}" in text
        assert "add_filemonitor_source.py" in text
