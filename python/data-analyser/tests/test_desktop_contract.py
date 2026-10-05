"""The desktop client reaches finance data only through authenticated local APIs."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest


ROOT = Path(__file__).resolve().parents[1]


def test_local_desktop_contract_is_authenticated_and_filtered(tmp_path):
    (tmp_path / "config").mkdir()
    (tmp_path / "config/finance_read_sources.json").write_bytes(
        (ROOT / "config/finance_read_sources.json").read_bytes()
    )
    (tmp_path / "runtime/registry").mkdir(parents=True)
    (tmp_path / "runtime/registry/accountbooks.json").write_text(
        json.dumps({"version": 2, "accountbooks": [
            {"key": "company_1", "name": "可用账套", "company_id": "1",
             "session_file": "http_sessions/one.json", "enabled": True},
            {"key": "company_2", "name": "停用账套", "company_id": "2",
             "session_file": "http_sessions/two.json", "enabled": False},
        ]}, ensure_ascii=False), encoding="utf-8",
    )
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    process = subprocess.Popen(
        [sys.executable, "-m", "data_analyser.serve", "--port", str(port)],
        env={**os.environ, "DATA_ANALYSER_ROOT": str(tmp_path)},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        token_file = tmp_path / "runtime/finance/access.token"
        for _ in range(100):
            if token_file.exists():
                break
            if process.poll() is not None:
                raise AssertionError("local finance service exited before startup")
            time.sleep(0.05)
        else:
            raise AssertionError("local finance service did not start")
        base = f"http://127.0.0.1:{port}"
        with pytest.raises(HTTPError) as denied:
            urlopen(base + "/companies", timeout=3)
        assert denied.value.code == 401
        headers = {"Authorization": "Bearer " + token_file.read_text().strip()}
        with urlopen(Request(base + "/health", headers=headers), timeout=3) as response:
            health = json.load(response)
        assert health["readOnly"] is True
        assert "snapshot-json" in health["capabilities"]
        with urlopen(Request(base + "/companies", headers=headers), timeout=3) as response:
            companies = json.load(response)
        assert companies == {"schema": "2", "companies": [
            {"key": "company_1", "name": "可用账套"}
        ]}
    finally:
        process.terminate()
        process.wait(timeout=5)
