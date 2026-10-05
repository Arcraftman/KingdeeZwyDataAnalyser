"""Small, strict registry for read-only company selection."""
from dataclasses import dataclass
from pathlib import Path
import json
import re


class RegistryError(ValueError):
    pass


@dataclass(frozen=True)
class Accountbook:
    key: str
    name: str
    company_id: str
    session_file: str
    enabled: bool


def normalize_month(value: object) -> str:
    month = str(value or "").strip()
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
        raise RegistryError("月份必须严格使用 YYYY-MM，例如 2026-08")
    return month


def load_accountbooks(path: Path) -> dict[str, Accountbook]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RegistryError("账套注册表不可读取，请先登录") from exc
    if not isinstance(payload, dict) or payload.get("version") != 2 or not isinstance(payload.get("accountbooks"), list):
        raise RegistryError("账套注册表格式无效")
    result = {}
    for row in payload["accountbooks"]:
        if not isinstance(row, dict):
            raise RegistryError("账套记录格式无效")
        key = row.get("key")
        if not isinstance(key, str) or not re.fullmatch(r"company_\d+", key) or key in result:
            raise RegistryError("账套编号无效或重复")
        name, cid, session = row.get("name"), str(row.get("company_id") or ""), row.get("session_file")
        if not isinstance(name, str) or not name or not cid.isdigit() or not isinstance(session, str):
            raise RegistryError("账套身份或会话路径无效")
        relative = Path(session)
        expected = ("runtime", "auth", "sessions")
        if relative.is_absolute() or ".." in relative.parts or relative.parts[:3] != expected:
            raise RegistryError("会话路径必须在项目 runtime/auth/sessions 目录内")
        if type(row.get("enabled")) is not bool:
            raise RegistryError("账套启用标志无效")
        result[key] = Accountbook(key, name, cid, session, row["enabled"])
    if not result:
        raise RegistryError("账套注册表为空")
    return result
