"""Read-only session loader."""
import json
from pathlib import Path
from urllib.parse import urlparse, parse_qs

def load_session(path: Path) -> tuple[str, str, str | None, str | None, str | None, str | None]:
        try:
            payload = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError(f"无法读取账簿会话文件：{exc}") from exc
        if not isinstance(payload, dict):
            raise ValueError("账簿会话文件结构无效")
        target_url = payload.get("target_url")
        cookies = payload.get("cookies")
        if not isinstance(target_url, str) or not isinstance(cookies, list):
            raise ValueError("账簿会话文件结构无效")
        parsed = urlparse(target_url)
        if parsed.scheme != "https" or not parsed.hostname:
            raise ValueError("账簿会话文件不是有效 HTTPS 地址")
        host = parsed.hostname
        path = parsed.path or "/"
        pairs: list[str] = []
        for cookie in cookies:
            if not isinstance(cookie, dict):
                continue
            name, value = cookie.get("name"), cookie.get("value")
            domain = str(cookie.get("domain") or "").lstrip(".")
            cookie_path = str(cookie.get("path") or "/")
            if not name or value is None or not domain:
                continue
            if (host == domain or host.endswith("." + domain)) and path.startswith(cookie_path):
                pairs.append(f"{name}={value}")
        if not pairs:
            raise ValueError("账簿域没有可用 Cookie")
        return (
            f"{parsed.scheme}://{parsed.netloc}",
            "; ".join(pairs),
            str(payload.get("dbid") or parse_qs(parsed.query).get("dbId", parse_qs(parsed.query).get("dbid", [None]))[0] or "") or None,
            payload.get("access_token") if isinstance(payload.get("access_token"), str) else None,
            payload.get("company_name") if isinstance(payload.get("company_name"), str) else None,
            str(payload.get("company_id") or "") or None,
        )

