"""Admin sign-in: protected /admin page, separate /admin/login page, server-side session revocation."""

import pytest

from app.models import AdminSession, AdminUser

USER, PASSWORD = "session-tester", "session-password-123"


@pytest.fixture(autouse=True)
def fresh_user(client):
    from app.auth import hash_password
    from app.db import SessionLocal
    from app.limiter import limiter

    limiter.reset()  # these tests sign in more often than the 10/minute login limit
    with SessionLocal() as db:
        user = db.query(AdminUser).filter_by(username=USER).one_or_none()
        if user is None:
            db.add(AdminUser(username=USER, password_hash=hash_password(PASSWORD), role="admin"))
        else:
            user.active = True
        db.commit()
    client.post("/api/admin/logout")
    client.cookies.clear()
    yield
    client.post("/api/admin/logout")
    client.cookies.clear()


def sign_in(client):
    response = client.post("/api/admin/login", json={"username": USER, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.cookies["dmft_admin"]


def test_admin_page_requires_session(client):
    response = client.get("/admin", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"] == "/admin/login"

    page = client.get("/admin/login")
    assert page.status_code == 200
    assert 'id="loginForm"' in page.text
    assert page.headers["cache-control"] == "no-store"


def test_sign_in_routes_to_admin_and_login_page_redirects_back(client):
    sign_in(client)
    page = client.get("/admin", follow_redirects=False)
    assert page.status_code == 200
    assert 'id="appView"' in page.text and 'id="loginForm"' not in page.text
    assert page.headers["cache-control"] == "no-store"

    again = client.get("/admin/login?next=/admin%23documents", follow_redirects=False)
    assert again.status_code == 303 and again.headers["location"] == "/admin#documents"
    # No open redirect off the admin area.
    evil = client.get("/admin/login?next=https://evil.example/", follow_redirects=False)
    assert evil.headers["location"] == "/admin"


def test_sign_out_revokes_the_session(client):
    token = sign_in(client)
    assert client.get("/api/admin/me").status_code == 200
    assert client.post("/api/admin/logout").status_code == 200

    # A copy of the old cookie no longer works: the session row is revoked, not just the cookie deleted.
    client.cookies.set("dmft_admin", token)
    assert client.get("/api/admin/me").status_code == 401
    assert client.get("/admin", follow_redirects=False).status_code == 303


def test_wrong_password_and_deactivated_user(client):
    assert client.post("/api/admin/login", json={"username": USER, "password": "wrong-password"}).status_code == 401

    sign_in(client)
    from app.db import SessionLocal

    with SessionLocal() as db:
        user = db.query(AdminUser).filter_by(username=USER).one()
        user.active = False
        db.commit()
    assert client.get("/api/admin/me").status_code == 401


def test_each_sign_in_creates_a_session_row(client):
    from app.db import SessionLocal

    sign_in(client)
    with SessionLocal() as db:
        user = db.query(AdminUser).filter_by(username=USER).one()
        live = db.query(AdminSession).filter_by(user_id=user.id, revoked=False).count()
    assert live == 1  # signing in again from the same browser closes the previous session
    sign_in(client)
    with SessionLocal() as db:
        assert db.query(AdminSession).filter_by(user_id=user.id, revoked=False).count() == 1
