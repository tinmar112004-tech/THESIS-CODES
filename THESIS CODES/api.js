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
    extractList(payload) {
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload?.items)) return payload.items;
      if (Array.isArray(payload?.value)) return payload.value;
      if (Array.isArray(payload?.data)) return payload.data;
      if (Array.isArray(payload?.result)) return payload.result;
      if (Array.isArray(payload?.$values)) return payload.$values;
      if (Array.isArray(payload?.data?.$values)) return payload.data.$values;
      if (Array.isArray(payload?.result?.$values)) return payload.result.$values;
      return [];
    },
    getComplaints() {
      // New backend route exposes list on /api/Complaints/all.
      // Keep fallback to older route names for compatibility.
      const routes = [
        "/api/Complaints/all",
        "/api/Complaints",
        "/api/complaints/all",
        "/api/complaints"
      ];

      let lastError = null;
      const tryNext = async (idx) => {
        if (idx >= routes.length) {
          throw lastError || new Error("Failed to load complaints");
        }
        try {
          const response = await request(routes[idx]);
          const list = window.CRM_API.extractList(response);
          if (Array.isArray(response) || list.length > 0) {
            return response;
          }
          // If an endpoint responds but has no recognizable list shape,
          // continue trying compatible routes before giving up.
          return await tryNext(idx + 1);
        } catch (err) {
          lastError = err;
          return await tryNext(idx + 1);
        }
      };

      return tryNext(0);
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

