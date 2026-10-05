"""DataAnalyser commands for workbook generation and read-only refresh."""
import argparse
import getpass
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
from urllib.request import Request, urlopen

from .project import project_root
from .build_template import save_template
from .serve import main as serve
from .login import login_account, discover, book_session, write_private


PORT = 18768


def healthy(root: Path) -> bool:
    try:
        token = (root / "runtime/finance/access.token").read_text(encoding="ascii").strip()
        request = Request(f"http://127.0.0.1:{PORT}/health", headers={"Authorization": "Bearer " + token})
        with urlopen(request, timeout=2) as response:
            data = json.load(response)
        return data.get("schema") == "2" and data.get("readOnly") is True
    except (OSError, ValueError):
        return False


def do_login(root: Path) -> int:
    username = input("账无忧账号：").strip()
    password = getpass.getpass("密码：")
    if not username or not password:
        raise ValueError("账号和密码不能为空")
    account = {"key": "account_" + secrets.token_hex(8), "username": username, "password": password}
    session, origin, _ = login_account(account, headed=True, reuse=False, progress=lambda message: print(message, flush=True))
    rows = discover(session, origin)
    records = [book_session(session, origin, row, account["key"]) for row in rows]
    if not records:
        raise ValueError("没有可访问的账套")
    write_private(root / "runtime/registry/accountbooks.json", {"version": 2, "accountbooks": records})
    if not healthy(root):
        log = root / "runtime/finance/service-start.log"
        log.parent.mkdir(parents=True, exist_ok=True)
        with log.open("ab") as output:
            creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            child = subprocess.Popen([sys.executable, str(root / "scripts/launch.py"), "serve"], cwd=root,
                                     stdin=subprocess.DEVNULL, stdout=output, stderr=output,
                                     creationflags=creationflags)
        for _ in range(40):
            if healthy(root):
                break
            if child.poll() is not None:
                raise RuntimeError(f"本地服务启动失败，查看 {log}")
            time.sleep(.25)
        else:
            child.terminate()
            raise RuntimeError(f"本地服务启动超时，查看 {log}")
    print("登录完成，账套：")
    for record in records:
        print(record["key"], record["name"])
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    template = sub.add_parser("template", help="生成空白 Excel 看板")
    template.add_argument("--output", type=Path)
    template.add_argument("--overwrite", action="store_true")
    sub.add_parser("login", help="交互登录并启动本地只读服务")
    sub.add_parser("configure-deepseek", help="保存当前用户加密的 DeepSeek 密钥")
    service = sub.add_parser("serve", help="运行本地只读服务")
    service.add_argument("--port", type=int, default=PORT)
    args = parser.parse_args(argv)
    root = project_root()
    if args.command == "template":
        output = args.output or root / "excel/finance-template.xlsx"
        print(save_template(output, overwrite=args.overwrite))
        return 0
    if args.command == "serve":
        return serve(["--port", str(args.port)]) or 0
    if args.command == "configure-deepseek":
        from .private_key import protect
        key = getpass.getpass("DeepSeek API Key：").strip()
        if not key:
            raise ValueError("密钥不能为空")
        path = root / "runtime/finance/deepseek.key"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(protect(key.encode("utf-8")))
        print("已保存当前用户加密的密钥")
        return 0
    return do_login(root)


if __name__ == "__main__":
    raise SystemExit(main())
