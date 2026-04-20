// Shared CRM API helper for CDN-style Vue pages.
// Keep this file framework-agnostic (plain JS).
(() => {
  const DEFAULT_BASE_URL = "https://unheady-unilluminated-yanira.ngrok-free.dev";

  function joinUrl(base, path) {
    const b = String(base || "").replace(/\/+$/, "");
    const p = String(path || "").replace(/^\/+/, "");
    return `${b}/${p}`;
  }

  async function request(path, options = {}) {
    const baseUrl = window.CRM_API_BASE_URL || DEFAULT_BASE_URL;
    const url = joinUrl(baseUrl, path);

    const res = await fetch(url, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        // ngrok often serves an interstitial HTML warning page in browsers.
        // This header tells ngrok to skip that page and pass through to your API.
        "ngrok-skip-browser-warning": "true",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: options.credentials, // set to "include" if your API uses cookies
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const msg = text ? `${res.status} ${res.statusText}: ${text}` : `${res.status} ${res.statusText}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }

    // Some endpoints may return 204 No Content
    if (res.status === 204) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      const text = await res.text().catch(() => "");
      const preview = text.slice(0, 200);
      throw new Error(
        `Expected JSON but received ${contentType || "unknown content-type"}.\n` +
          `Response preview: ${preview}`
      );
    }

    return await res.json();
  }

  window.CRM_API = {
    request,
    getComplaints() {
      // New backend route exposes list on /api/Complaints/all.
      // Keep fallback to older route names for compatibility.
      return request("/api/Complaints/all").catch(async (firstErr) => {
        try {
          return await request("/api/Complaints");
        } catch (_) {
          try {
            return await request("/api/complaints/all");
          } catch (_) {
            throw firstErr;
          }
        }
      });
    },
    login(email, password) {
      return request("/api/Auth/login", {
        method: "POST",
        body: { email, password },
      });
    },
    verifyOtp(email, otp) {
      return request("/api/Auth/verify-otp", {
        method: "POST",
        body: { email, otp },
      });
    },
  };
})();

