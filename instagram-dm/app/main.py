"""FastAPI service exposing a minimal Instagram DM client.

Endpoints are intentionally small and synchronous (FastAPI offloads sync
handlers to a threadpool, which is what we want since instagrapi is sync).
The static frontend in ../static talks to these JSON endpoints.
"""

import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from instagrapi.exceptions import ClientError
from pydantic import BaseModel

from .instagram import (
    session,
    LoginNeeded,
    TwoFactorNeeded,
    ChallengeNeeded,
)

STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "static")

app = FastAPI(title="Instagram DM Portal")


class LoginBody(BaseModel):
    username: str
    password: str
    verification_code: str | None = None


class SendBody(BaseModel):
    text: str


@app.get("/api/status")
def status():
    return session.status()


@app.post("/api/login")
def login(body: LoginBody):
    try:
        return session.login(
            body.username,
            body.password,
            verification_code=body.verification_code or "",
        )
    except TwoFactorNeeded:
        raise HTTPException(
            status_code=401,
            detail={"code": "2fa_required",
                    "message": "Two-factor code required. Re-submit with verification_code."},
        )
    except ChallengeNeeded:
        raise HTTPException(
            status_code=403,
            detail={"code": "challenge_required",
                    "message": "Instagram requires a security challenge. "
                               "Approve the login in the Instagram app, then retry."},
        )
    except ClientError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "login_failed", "message": str(exc)},
        )


@app.post("/api/logout")
def logout():
    session.logout()
    return {"ok": True}


@app.get("/api/threads")
def threads():
    try:
        return session.list_threads()
    except LoginNeeded:
        raise HTTPException(status_code=401,
                            detail={"code": "login_required",
                                    "message": "Session expired. Please log in again."})
    except ClientError as exc:
        raise HTTPException(status_code=502,
                            detail={"code": "instagram_error", "message": str(exc)})


@app.get("/api/threads/{thread_id}")
def thread_messages(thread_id: str):
    try:
        return session.list_messages(thread_id)
    except LoginNeeded:
        raise HTTPException(status_code=401,
                            detail={"code": "login_required",
                                    "message": "Session expired. Please log in again."})
    except ClientError as exc:
        raise HTTPException(status_code=502,
                            detail={"code": "instagram_error", "message": str(exc)})


@app.post("/api/threads/{thread_id}/send")
def send(thread_id: str, body: SendBody):
    if not body.text.strip():
        raise HTTPException(status_code=400,
                            detail={"code": "empty", "message": "Message is empty."})
    try:
        return session.send_message(thread_id, body.text)
    except LoginNeeded:
        raise HTTPException(status_code=401,
                            detail={"code": "login_required",
                                    "message": "Session expired. Please log in again."})
    except ClientError as exc:
        raise HTTPException(status_code=502,
                            detail={"code": "instagram_error", "message": str(exc)})


@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


# Serve the rest of the static assets (app.js, style.css) under /static.
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
