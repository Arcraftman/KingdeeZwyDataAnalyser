"""Compatibility exports for the authorized-session workflow.

Login is performed by the user in Electron. This module intentionally contains
no browser automation and never accepts an account password.
"""

from .authorized_session import (
    book_session,
    check_url,
    data,
    discover,
    import_electron_authorization,
    reuse_book_session,
    session_from_state,
    write_private,
)


def login_account(*_args, **_kwargs):
    raise RuntimeError("请在 Electron 授权窗口完成登录；不再支持自动化浏览器登录")


__all__ = [
    "book_session", "check_url", "data", "discover", "import_electron_authorization",
    "login_account", "reuse_book_session", "session_from_state", "write_private",
]
