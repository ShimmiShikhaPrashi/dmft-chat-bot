// DMFT Sahayak admin sign-in page. On success the server has set the session cookie; go to the admin app.
(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const params = new URLSearchParams(location.search);
  const next = (() => {
    // The server redirect from /admin keeps the #section, so fall back to it when there is no ?next.
    const target = params.get("next") || (location.hash ? "/admin" + location.hash : "");
    return target.startsWith("/admin") && !target.startsWith("/admin/login") ? target : "/admin";
  })();

  const NOTICES = {
    signed_out: "You have been signed out.",
    expired: "Your session has ended. Please sign in again.",
  };
  const reason = params.get("reason");
  if (NOTICES[reason]) {
    $("#loginNotice").textContent = NOTICES[reason];
    $("#loginNotice").hidden = false;
  }

  // Opened from an external link the SameSite cookie is not sent to the page itself, but it is sent
  // to this same-site request: if a session already exists, go straight in.
  fetch("/api/admin/me", { credentials: "same-origin" })
    .then((r) => { if (r.ok) location.replace(next); })
    .catch(() => {});

  $("#togglePass").addEventListener("click", (event) => {
    const input = $("#loginPass");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    event.currentTarget.textContent = show ? "Hide" : "Show";
    event.currentTarget.setAttribute("aria-pressed", String(show));
    input.focus();
  });

  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = $("#loginUser").value.trim();
    const password = $("#loginPass").value;
    const error = $("#loginError");
    error.textContent = "";
    if (!username || !password) {
      error.textContent = "Enter your username and password.";
      (username ? $("#loginPass") : $("#loginUser")).focus();
      return;
    }
    const button = $("#loginSubmit");
    button.disabled = true;
    button.textContent = "Signing in…";
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });
      if (response.ok) {
        try { localStorage.setItem("dmft.admin.session", String(Date.now())); } catch { /* storage blocked */ }
        location.replace(next);
        return;
      }
      const data = await response.json().catch(() => ({}));
      error.textContent = response.status === 401 ? "Incorrect username or password."
        : typeof data.detail === "string" ? data.detail : `Sign-in failed (${response.status}).`;
      $("#loginPass").select();
    } catch {
      error.textContent = "Cannot reach the server. Check your connection and try again.";
    }
    button.disabled = false;
    button.textContent = "Sign in";
  });

  $("#loginUser").focus();
})();
