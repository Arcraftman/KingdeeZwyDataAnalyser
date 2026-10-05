"""Pure HTTP accountbook session workflow ported from KingdeeZwyReceiptUploader.

The functions below follow its session reuse, company discovery and accountbook
token-exchange flow. Electron supplies only the cookies from a user-operated
authorization window; this module never controls a browser or accepts a password.
"""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

import requests


def write_private(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    temporary.chmod(0o600)
    temporary.replace(path)


def check_url(url: str):
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or not (
        parsed.hostname == "kdzwy.com" or parsed.hostname.endswith(".kdzwy.com")
    ):
        raise ValueError("授权页面必须属于 kdzwy.com 的 HTTPS 地址")
    return parsed


def session_from_state(state: dict) -> requests.Session:
    cookies = state.get("cookies")
    if not isinstance(cookies, list):
        raise ValueError("授权 Cookie 格式无效")
    session = requests.Session()
    for cookie in cookies:
        if not isinstance(cookie, dict):
            continue
        name, value, domain = cookie.get("name"), cookie.get("value"), str(cookie.get("domain") or "")
        if isinstance(name, str) and isinstance(value, str) and domain.lstrip(".").endswith("kdzwy.com"):
            session.cookies.set(name, value, domain=domain, path=str(cookie.get("path") or "/"))
    session.headers.update({"User-Agent": "Mozilla/5.0 DataAnalyser/0.1", "X-Requested-With": "XMLHttpRequest"})
    return session


def data(response):
    response.raise_for_status()
    try:
        result = response.json()
    except ValueError as exc:
        raise RuntimeError("会话已失效或服务端没有返回 JSON") from exc
    if not isinstance(result, dict):
        raise RuntimeError("服务端响应结构无效")
    for key in ("code", "status", "errorcode", "errcode"):
        if result.get(key) not in (None, 0, 200, "0", "200"):
            raise RuntimeError(f"账无忧拒绝请求：{key}={result[key]}")
    if result.get("success") is False:
        raise RuntimeError("账无忧返回 success=false")
    return result.get("data")


def discover(master: requests.Session, origin: str) -> list[dict]:
    nodes = data(master.get(origin + "/guanjia/acctflow/selfnode", timeout=30))
    service = [node for node in nodes if node.get("nodeName") == "服务管理"]
    if len(service) != 1:
        raise RuntimeError("无法唯一定位账无忧的服务管理节点")
    rows: list[dict] = []
    for page in range(1, 1001):
        result = data(master.get(origin + "/guanjia/acctflow/nodecustomer", params={
            "nodeId": service[0]["id"], "page": page, "limit": 100,
            "orderProperty": "acctCreateDate", "orderDirection": "desc",
        }, timeout=30))
        items = result.get("items") if isinstance(result, dict) else None
        if not isinstance(items, list):
            raise RuntimeError("账套列表格式无效")
        rows.extend(items)
        if not result.get("hasNextPage"):
            if len(rows) != int(result.get("totalCount", -1)):
                raise RuntimeError("账套分页数量与服务端总数不一致")
            return [row for row in rows if row.get("isCreateAccount") and str(row.get("databaseId") or "0") != "0"]
    raise RuntimeError("账套分页超过上限")


def book_session(root: Path, master: requests.Session, origin: str, row: dict, account_key: str = "electron") -> dict:
    session = requests.Session()
    session.headers.update(master.headers)
    for cookie in master.cookies:
        if "-kj." not in cookie.domain:
            session.cookies.set_cookie(copy.copy(cookie))
    company_id = str(row["companyId"])
    data(session.get(origin + "/guanjia/customer/accounturl/before", params={"recycle": 0, "companyId": company_id}, timeout=30))
    target_url = data(session.get(origin + "/guanjia/customer/accounturl", params={"companyId": company_id}, timeout=30))
    target = check_url(target_url)
    response = session.get(target_url, timeout=30)
    response.raise_for_status()
    landed = check_url(response.url)
    if landed.hostname != target.hostname:
        raise RuntimeError("账套跳转到了非预期域名")
    book_origin = f"https://{landed.netloc}"
    auth_code = session.cookies.get("authCode", domain=target.hostname)
    if not auth_code:
        raise RuntimeError("账套登录没有返回 authCode")
    token_result = data(session.post(book_origin + "/auth/exchangeToken", json={"authCode": auth_code}, timeout=30))
    token = token_result.get("access_token") if isinstance(token_result, dict) else None
    if not isinstance(token, str) or not token:
        raise RuntimeError("账套未返回访问令牌")
    session.headers["app-token"] = token
    system = data(session.get(book_origin + "/basedata/initParams?m=getSystemParams", timeout=30))
    if not isinstance(system, dict) or str(system.get("companyId")) != company_id or str(system.get("DBID")) != str(row["databaseId"]):
        raise RuntimeError("账套身份或 DBID 不一致，拒绝保存会话")
    cookies = [{"name": item.name, "value": item.value, "domain": item.domain, "path": item.path, "secure": item.secure}
               for item in session.cookies]
    path = root / "runtime" / "auth" / "sessions" / "accounts" / account_key / "companies" / f"company_{company_id}.accountbook.cookies.json"
    write_private(path, {"target_url": response.url, "cookies": cookies, "dbid": str(system["DBID"]),
                         "access_token": token, "company_name": row["companyName"], "company_id": company_id})
    return {"key": f"company_{company_id}", "name": row["companyName"], "company_id": company_id,
            "login_account": account_key, "enabled": True, "session_file": path.relative_to(root).as_posix()}


def import_electron_authorization(root: Path, origins: list[str], cookies: list[dict]) -> list[dict]:
    """Discover accountbooks through every trusted origin seen during login.

    The official sign-in page and the account-management API may be hosted on
    different subdomains.  Electron supplies each same-site origin it observed;
    a 404 on one of them therefore does not invalidate the user session.
    """
    candidates: list[str] = []
    for origin in origins:
        try:
            parsed = check_url(origin)
        except (TypeError, ValueError):
            continue
        candidate = f"https://{parsed.netloc}"
        if candidate not in candidates:
            candidates.append(candidate)
    if not candidates:
        raise ValueError("没有可用的账无忧授权域名")
    master = session_from_state({"cookies": cookies})
    try:
        records: list[dict] | None = None
        for origin in candidates:
            try:
                rows = discover(master, origin)
                records = [book_session(root, master, origin, row) for row in rows]
                break
            except (requests.RequestException, RuntimeError, ValueError):
                # The sign-in host commonly has no acctflow endpoint.  Keep
                # trying origins reached by the same user-operated login.
                continue
    finally:
        master.close()
    if records is None:
        raise RuntimeError(f"登录已完成，但未找到可读取账套的服务域名（已尝试 {len(candidates)} 个域名）")
    if not records:
        raise RuntimeError("当前账号没有可访问的账套")
    write_private(root / "runtime" / "registry" / "accountbooks.json", {"version": 2, "accountbooks": records})
    return records


def reusable_accountbooks(root: Path, records) -> list:
    """Return only accountbooks whose saved sessions pass the reference reuse check."""
    return [record for record in records if reuse_book_session(root, record)]


def reuse_book_session(root: Path, record) -> bool:
    session_file = getattr(record, "session_file", None) or record.get("session_file")
    company_id = getattr(record, "company_id", None) or record.get("company_id")
    path = root / str(session_file or "")
    if not path.is_file():
        return False
    try:
        state = json.loads(path.read_text(encoding="utf-8-sig"))
        if str(state.get("company_id")) != str(company_id) or not state.get("access_token") or not state.get("dbid"):
            return False
        target = check_url(state["target_url"])
        session = session_from_state(state)
        session.headers["app-token"] = state["access_token"]
    except (OSError, ValueError, KeyError, TypeError):
        return False
    try:
        response = session.get(f"https://{target.netloc}/basedata/initParams?m=getSystemParams", timeout=15, allow_redirects=False)
        if response.status_code in (301, 302, 303, 307, 308, 401, 403):
            return False
        system = data(response)
        return isinstance(system, dict) and str(system.get("companyId")) == str(company_id) and str(system.get("DBID")) == str(state["dbid"])
    except (requests.RequestException, RuntimeError):
        return False
    finally:
        session.close()
