"""Portable authorized login, company discovery and safe setup console.

Install optional login dependencies with: pip install '.[discovery]'
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess

import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

from .project import project_root


def write_private(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    temp.chmod(0o600)
    temp.replace(path)


def check_url(url):
    p = urlsplit(url)
    if p.scheme != 'https' or not p.hostname or not (p.hostname == 'kdzwy.com' or p.hostname.endswith('.kdzwy.com')):
        raise RuntimeError('The server returned a non-Kdzwy HTTPS URL; login stopped')
    return p


def session_from_state(state):
    import requests
    s = requests.Session()
    for c in state['cookies']:
        if c['domain'].lstrip('.').endswith('kdzwy.com'):
            s.cookies.set(c['name'], c['value'], domain=c['domain'], path=c.get('path', '/'))
    s.headers.update({'User-Agent': 'Mozilla/5.0 DataAnalyser/0.1', 'X-Requested-With': 'XMLHttpRequest'})
    return s


def block_login_page_request(method, url):
    path = urlsplit(url).path.lower()
    return path.startswith('/guanjia/') and (
        method not in ('GET', 'HEAD')
        or any(x in path for x in ('/update', '/insert', '/save', '/delete', '/logout', '/record'))
    )


def data(response):
    response.raise_for_status()
    try:
        result = response.json()
    except ValueError:
        raise RuntimeError('Session expired or server returned non-JSON data') from None
    if not isinstance(result, dict):
        raise RuntimeError('Unexpected server response structure')
    for key in ('code', 'status', 'errorcode', 'errcode'):
        if result.get(key) not in (None, 0, 200, '0', '200'):
            raise RuntimeError(f'API rejected the request: {key}={result[key]}; check login or verification on the official website')
    if result.get('success') is False:
        raise RuntimeError('API returned success=false')
    return result.get('data')


def authenticated_user_payload(payload):
    """Reject login HTML, expired sessions and empty success envelopes."""
    return (isinstance(payload, dict)
            and payload.get('success') is not False
            and all(payload.get(key) in (None, 0, 200, '0', '200')
                    for key in ('code', 'status', 'errorcode', 'errcode'))
            and isinstance(payload.get('data'), dict) and bool(payload['data']))


def wait_authenticated_context(context, *, timeout, progress):
    """Check authenticated API state, including redirects and login popup pages."""
    deadline = time.monotonic() + timeout
    next_notice = time.monotonic() + 15
    while time.monotonic() < deadline:
        pages = [page for page in context.pages if not page.is_closed()]
        if not pages:
            raise RuntimeError('登录浏览器已关闭，请重新点击登录。')
        origins = []
        for page in reversed(pages):
            try:
                parsed = check_url(page.url)
            except RuntimeError:
                continue
            origin = 'https://' + parsed.netloc
            if origin not in origins:
                origins.append(origin)
        for origin in origins:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            try:
                response = context.request.get(origin + '/guanjia/user/info',
                                               timeout=min(5000, max(1, int(remaining * 1000))))
                try:
                    if response.ok and authenticated_user_payload(response.json()):
                        return origin
                finally:
                    response.dispose()
            except Exception:
                # A loading page, login HTML or transient network failure is not
                # proof of login. Continue until the bounded deadline.
                pass
        # A rejected credential must end this attempt and release its browser
        # and login lock, rather than waiting three minutes while retry is blocked.
        for page in pages:
            try:
                body = page.locator('body').inner_text(timeout=1000)
            except Exception:
                continue
            if isinstance(body, str) and re.search(
                    r'账号或密码错误|用户名或密码错误|账户或密码错误|密码不正确|密码错误|账号不存在|用户名不存在', body):
                raise RuntimeError('账号或密码错误，请重新点击登录并输入正确的账号密码。')
        if time.monotonic() >= next_notice:
            progress('仍在等待有效登录会话；请在浏览器完成验证码或短信验证。')
            next_notice = time.monotonic() + 15
        pages[-1].wait_for_timeout(1000)
    raise RuntimeError('未能在规定时间内确认有效登录会话。请重新登录；如网页已进入首页，请检查网络或提供地址栏中不含参数的域名和路径。')


def login_account(account, headed=False, reuse=True, progress=None):
    progress = progress or (lambda message: None)
    key = account['key']
    if not re.fullmatch(r'[A-Za-z0-9_-]+', key):
        raise RuntimeError('Account key must contain only letters, digits, underscores and hyphens')
    path = project_root() / 'http_sessions/accounts' / key / 'browser.session.json'
    if reuse and path.exists():
        state = json.loads(path.read_text(encoding='utf-8'))
        origin = state.get('guanjia_origin')
        if origin:
            check_url(origin)
            s = session_from_state(state)
            try:
                data(s.get(origin + '/guanjia/user/info', timeout=30))
                return s, origin, state
            except Exception:
                pass
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(headless=not headed)
        try:
            c = b.new_context(locale='zh-CN')
            # Homepage telemetry/preferences are not needed for login.
            def guard(route):
                r = route.request
                if block_login_page_request(r.method, r.url):
                    route.abort()
                else:
                    route.continue_()
            c.route('**/*', guard)
            page = c.new_page()
            progress('浏览器已启动，正在打开账无忧登录页……')
            page.goto('https://gj.kdzwy.com/', wait_until='domcontentloaded', timeout=60000)
            page.locator('#log-account').fill(account['username'])
            page.locator('#log-pwd').fill(account['password'])
            page.locator('#sub-btn').click()
            progress('已提交登录，正在确认会话；如有验证码，请在浏览器完成。')
            origin = wait_authenticated_context(c, timeout=180 if headed else 45, progress=progress)
            progress('登录会话已确认，正在保存本机会话……')
            state = c.storage_state()
            state['guanjia_origin'] = origin
            write_private(path, state)
            return session_from_state(state), origin, state
        finally:
            b.close()


def discover(s, origin):
    nodes = data(s.get(origin + '/guanjia/acctflow/selfnode', timeout=30))
    service = [n for n in nodes if n.get('nodeName') == '服务管理']
    if len(service) != 1:
        raise RuntimeError('Cannot uniquely identify the service management node')
    rows = []
    page = 1
    while True:
        d = data(s.get(origin + '/guanjia/acctflow/nodecustomer', params={'nodeId': service[0]['id'], 'page': page, 'limit': 100, 'orderProperty': 'acctCreateDate', 'orderDirection': 'desc'}, timeout=30))
        rows.extend(d['items'])
        if not d.get('hasNextPage'):
            if len(rows) != int(d['totalCount']):
                raise RuntimeError('Company page count does not match totalCount')
            break
        page += 1
        if page > 1000:
            raise RuntimeError('Company pagination limit exceeded')
    return [r for r in rows if r.get('isCreateAccount') and str(r.get('databaseId') or '0') != '0']


def book_session(master, origin, row, account_key):
    import requests
    # Separate cookie jars prevent one company's login contaminating another.
    s = requests.Session()
    s.headers.update(master.headers)
    for cookie in master.cookies:
        if '-kj.' not in cookie.domain:
            s.cookies.set_cookie(__import__('copy').copy(cookie))
    cid = str(row['companyId'])
    data(s.get(origin + '/guanjia/customer/accounturl/before', params={'recycle': 0, 'companyId': cid}, timeout=30))
    url = data(s.get(origin + '/guanjia/customer/accounturl', params={'companyId': cid}, timeout=30))
    host = check_url(url).hostname
    response = s.get(url, timeout=30)
    response.raise_for_status()
    parsed = check_url(response.url)
    if parsed.hostname != host:
        raise RuntimeError('Accountbook login redirected to another domain')
    book_origin = 'https://' + parsed.netloc
    code = s.cookies.get('authCode', domain=host)
    if not code:
        raise RuntimeError('Accountbook login did not return authCode')
    token = data(s.post(book_origin + '/auth/exchangeToken', json={'authCode': code}, timeout=30))['access_token']
    s.headers['app-token'] = token
    system = data(s.get(book_origin + '/basedata/initParams?m=getSystemParams', timeout=30))
    if str(system.get('companyId')) != cid or str(system.get('DBID')) != str(row['databaseId']):
        raise RuntimeError('Company ID / DBID mismatch; refusing to save session')
    cookies = [{'name': c.name, 'value': c.value, 'domain': c.domain, 'path': c.path, 'secure': c.secure} for c in s.cookies]
    path = project_root() / 'http_sessions/accounts' / account_key / 'companies' / f'company_{cid}.accountbook.cookies.json'
    payload = {'target_url': response.url, 'cookies': cookies, 'dbid': str(system['DBID']), 'access_token': token, 'company_name': row['companyName'], 'company_id': cid}
    write_private(path, payload)
    return {'key': f'company_{cid}', 'name': row['companyName'], 'company_id': cid, 'login_account': account_key, 'enabled': True, 'session_file': path.relative_to(project_root()).as_posix()}

