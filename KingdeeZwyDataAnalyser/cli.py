"""DataAnalyser commands for workbook generation and read-only refresh."""
import argparse
import getpass
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.request import Request, urlopen

from .core.project import project_root
from .service.serve import main as serve


PORT = 18768


def healthy(root: Path) -> bool:
    try:
        token = (root / "runtime/service/finance/access.token").read_text(encoding="ascii").strip()
        request = Request(f"http://127.0.0.1:{PORT}/health", headers={"Authorization": "Bearer " + token})
        with urlopen(request, timeout=2) as response:
            data = json.load(response)
        return data.get("schema") == "2" and data.get("readOnly") is True
    except (OSError, ValueError):
        return False


def do_login(root: Path) -> int:
    raise RuntimeError("请在 Electron 客户端中完成账无忧授权；命令行不再收集账号和密码。")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("login", help="提示使用 Electron 客户端完成授权")
    sub.add_parser("configure-deepseek", help="保存当前用户加密的 DeepSeek 密钥")
    service = sub.add_parser("serve", help="运行本地只读服务")
    service.add_argument("--port", type=int, default=PORT)
    args = parser.parse_args(argv)
    root = project_root()
    if args.command == "serve":
        return serve(["--port", str(args.port)]) or 0
    if args.command == "configure-deepseek":
        from .auth.private_key import protect
        key = getpass.getpass("DeepSeek API Key：").strip()
        if not key:
            raise ValueError("密钥不能为空")
        path = root / "runtime/auth/deepseek.key"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(protect(key.encode("utf-8")))
        print("已保存当前用户加密的密钥")
        return 0
    return do_login(root)


if __name__ == "__main__":
    raise SystemExit(main())
