"""Thin wrapper around instagrapi that persists the login session.

The wrapper keeps a single logged-in client in memory and mirrors its
settings to a JSON file on disk so a container restart does not force a
fresh login (which Instagram treats as suspicious). Everything here is
synchronous; FastAPI runs the calling endpoints in a threadpool.
"""

import os
import threading

from instagrapi import Client
from instagrapi.exceptions import (
    LoginRequired,
    TwoFactorRequired,
    ChallengeRequired,
    ClientError,
)

SESSION_FILE = os.environ.get("SESSION_FILE", "/data/session.json")


class LoginNeeded(Exception):
    """Raised when there is no usable session and the user must log in."""


class TwoFactorNeeded(Exception):
    """Raised when Instagram wants a 2FA code to finish logging in."""


class ChallengeNeeded(Exception):
    """Raised when Instagram issues a checkpoint/challenge we can't clear."""


class InstagramSession:
    def __init__(self):
        self._lock = threading.Lock()
        self._client = None
        self._username = None
        self._restored = False  # session loaded from disk, not yet verified
        self._load_from_disk()

    # -- session lifecycle ------------------------------------------------

    def _load_from_disk(self):
        if not os.path.exists(SESSION_FILE):
            return
        try:
            client = Client()
            client.load_settings(SESSION_FILE)
            self._client = client
            self._restored = True
            settings = client.get_settings() or {}
            # username is not always in settings; best effort only
            self._username = settings.get("username")
        except Exception:
            # A corrupt session file should not crash startup.
            self._client = None
            self._restored = False

    def _persist(self):
        if self._client is None:
            return
        os.makedirs(os.path.dirname(SESSION_FILE), exist_ok=True)
        self._client.dump_settings(SESSION_FILE)

    def login(self, username, password, verification_code=""):
        """Log in with username/password, reusing an existing session when
        possible. Raises TwoFactorNeeded / ChallengeNeeded when Instagram
        asks for more."""
        with self._lock:
            client = self._client or Client()
            # Reuse device/session settings we already have for this user so
            # we look like the same device across logins.
            try:
                if self._restored:
                    client.load_settings(SESSION_FILE)
            except Exception:
                pass

            try:
                client.login(
                    username,
                    password,
                    verification_code=verification_code or "",
                )
            except TwoFactorRequired as exc:
                raise TwoFactorNeeded(str(exc)) from exc
            except ChallengeRequired as exc:
                raise ChallengeNeeded(str(exc)) from exc
            except ClientError as exc:
                raise ClientError(str(exc)) from exc

            self._client = client
            self._username = username
            self._restored = True
            self._persist()
            return {"username": username, "user_id": str(client.user_id)}

    def logout(self):
        with self._lock:
            self._client = None
            self._username = None
            self._restored = False
            try:
                if os.path.exists(SESSION_FILE):
                    os.remove(SESSION_FILE)
            except OSError:
                pass

    def status(self):
        return {
            "logged_in": self._client is not None,
            "username": self._username,
        }

    # -- helpers ----------------------------------------------------------

    def _require_client(self):
        if self._client is None:
            raise LoginNeeded("Not logged in")
        return self._client

    def _current_user_id(self):
        client = self._require_client()
        try:
            return str(client.user_id)
        except Exception:
            return None

    # -- direct messages --------------------------------------------------

    def list_threads(self, amount=20):
        client = self._require_client()
        try:
            threads = client.direct_threads(amount=amount)
        except LoginRequired as exc:
            self._restored = True
            raise LoginNeeded(str(exc)) from exc

        me = self._current_user_id()
        out = []
        for t in threads:
            users = [
                {
                    "user_id": str(u.pk),
                    "username": u.username,
                    "full_name": u.full_name,
                    "profile_pic_url": str(u.profile_pic_url)
                    if u.profile_pic_url
                    else None,
                }
                for u in t.users
            ]
            # Title: thread's own title, else the other participants' names.
            others = [u["username"] for u in users if u["user_id"] != me]
            title = t.thread_title or ", ".join(others) or "(unknown)"

            last_text = None
            if t.messages:
                last = t.messages[0]
                last_text = last.text or f"[{last.item_type}]"

            out.append(
                {
                    "thread_id": str(t.id),
                    "title": title,
                    "users": users,
                    "last_message": last_text,
                }
            )
        return {"me": me, "threads": out}

    def list_messages(self, thread_id, amount=30):
        client = self._require_client()
        try:
            messages = client.direct_messages(thread_id, amount=amount)
        except LoginRequired as exc:
            raise LoginNeeded(str(exc)) from exc

        me = self._current_user_id()
        out = []
        # instagrapi returns newest-first; reverse for natural chat order.
        for m in reversed(messages):
            out.append(
                {
                    "id": str(m.id),
                    "user_id": str(m.user_id),
                    "text": m.text or f"[{m.item_type}]",
                    "item_type": m.item_type,
                    "timestamp": m.timestamp.isoformat() if m.timestamp else None,
                    "is_me": str(m.user_id) == me,
                }
            )
        return {"me": me, "messages": out}

    def send_message(self, thread_id, text):
        client = self._require_client()
        try:
            msg = client.direct_send(text, thread_ids=[int(thread_id)])
        except LoginRequired as exc:
            raise LoginNeeded(str(exc)) from exc
        return {"id": str(msg.id), "text": msg.text}


# Module-level singleton used by the FastAPI app.
session = InstagramSession()
