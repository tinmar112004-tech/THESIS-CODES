// Shared CRM API helper for CDN-style Vue pages.
// Keep this file framework-agnostic (plain JS).
(() => {
  const DEFAULT_BASE_URL = "https://unheady-unilluminated-yanira.ngrok-free.dev";

  function joinUrl(base, path) {
    const b = String(base || "").replace(/\/+$/, "");
    const p = String(path || "").replace(/^\/+/, "");
    return `${b}/${p}`;
  }

  function shouldUseNgrokSkipHeader(baseUrl) {
    // This header is useful for ngrok, but it also triggers a CORS preflight (OPTIONS).
    // Some backends respond 405 to OPTIONS, causing browser requests to fail.
    // Default to OFF; enable by setting: window.CRM_API_USE_NGROK_SKIP_HEADER = true
    return Boolean(window.CRM_API_USE_NGROK_SKIP_HEADER) && String(baseUrl || "").includes("ngrok");
  }

  async function request(path, options = {}) {
    const baseUrl = window.CRM_API_BASE_URL || DEFAULT_BASE_URL;
    const url = joinUrl(baseUrl, path);

    const isBodyProvided = options.body !== undefined && options.body !== null;
    const isJsonBody =
      isBodyProvided &&
      typeof options.body === "object" &&
      !(options.body instanceof FormData) &&
      !(options.body instanceof Blob) &&
      !(options.body instanceof ArrayBuffer);

    // Default: send JSON as application/json (most ASP.NET APIs require this; otherwise you get 415).
    // If you need to avoid CORS preflight on a backend that doesn't allow OPTIONS, set:
    // window.CRM_API_SEND_JSON_AS_TEXT = true
    const sendJsonAsApplicationJson = !Boolean(window.CRM_API_SEND_JSON_AS_TEXT);

    const headers = {
      Accept: "application/json",
      ...(options.headers || {}),
    };

    if (shouldUseNgrokSkipHeader(baseUrl)) {
      headers["ngrok-skip-browser-warning"] = "true";
    }

    if (isBodyProvided && isJsonBody) {
      headers["Content-Type"] = sendJsonAsApplicationJson ? "application/json" : "text/plain;charset=UTF-8";
    }

    const body = !isBodyProvided ? undefined : isJsonBody ? JSON.stringify(options.body) : options.body;

    const timeoutMs =
      Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) :
      Number.isFinite(Number(window.CRM_API_TIMEOUT_MS)) ? Number(window.CRM_API_TIMEOUT_MS) :
      20000;

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId =
      controller && timeoutMs > 0
        ? setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs)
        : null;

    let res;
    try {
      res = await fetch(url, {
        method: options.method || "GET",
        headers,
        body,
        credentials: options.credentials, // set to "include" if your API uses cookies
        ...(controller ? { signal: controller.signal } : {}),
      });
    } catch (e) {
      // Normalize abort/timeouts into a useful message
      const name = String(e?.name || "");
      const isAbort = name === "AbortError";
      if (isAbort) {
        const err = new Error(`408 Request Timeout @ ${url}`);
        err.status = 408;
        err.url = url;
        throw err;
      }
      throw e;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const contentType = res.headers.get("content-type") || "";
      let details = "";

      if (contentType.toLowerCase().includes("application/json")) {
        const json = await res.json().catch(() => null);
        if (json) {
          // Common ASP.NET validation shapes:
          // - { errors: { Field: ["msg"] }, title, status, traceId }
          // - { message: "...", ... }
          // - { error: "...", ... }
          const errors = json.errors || json.Errors;
          if (errors && typeof errors === "object") {
            const lines = [];
            for (const [field, msgs] of Object.entries(errors)) {
              if (Array.isArray(msgs)) {
                for (const m of msgs) lines.push(`${field}: ${m}`);
              } else if (msgs) {
                lines.push(`${field}: ${String(msgs)}`);
              }
            }
            details = lines.join("\n");
          } else if (typeof json.message === "string") {
            details = json.message;
          } else if (typeof json.error === "string") {
            details = json.error;
          } else {
            details = JSON.stringify(json);
          }
        }
      } else {
        details = await res.text().catch(() => "");
      }

      const msg = details
        ? `${res.status} ${res.statusText} @ ${url}\n${details}`
        : `${res.status} ${res.statusText} @ ${url}`;

      const err = new Error(msg);
      err.status = res.status;
      err.url = url;
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
    postWithFallback(paths, body, options = {}) {
      const routes = Array.isArray(paths) ? paths : [];
      let lastError = null;

      const tryNext = async (idx) => {
        if (idx >= routes.length) {
          throw lastError || new Error("Request failed");
        }
        try {
          return await request(routes[idx], {
            method: "POST",
            body,
            timeoutMs: options.timeoutMs,
          });
        } catch (err) {
          lastError = err;
          const status = Number(err?.status);

          // If the endpoint exists but rejects the request (validation/auth/media-type),
          // don't continue trying other routes — it just adds noise (405/404 spam).
          const stopOnStatuses = options.stopOnStatuses || [400, 401, 403, 415, 422];
          if (Number.isFinite(status) && stopOnStatuses.includes(status)) {
            throw err;
          }
          return await tryNext(idx + 1);
        }
      };

      return tryNext(0);
    },
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
    createEmployee(employee) {
      // Try common route variants to stay compatible with backend updates.
      const routes = [
        "/api/Employees",
        "/api/Employees/create",
        "/api/Employee",
        "/api/Employee/create",
        "/api/Auth/register-employee",
      ];
      return this.postWithFallback(routes, employee);
    },
    createComplaint(complaint) {
      const routes = [
        // Primary: matches most ASP.NET controllers with just [HttpPost]
        "/api/Complaints",
        "/api/complaints",
        // Newer backend action name seen in controller screenshots
        "/api/Complaints/AddComplaint",
        "/api/Complaints/addComplaint",
        "/api/Complaints/add",
        "/api/complaints/AddComplaint",
        "/api/complaints/addComplaint",
        "/api/complaints/add",
        // Controller name variants some projects use
        "/api/Complaint/AddComplaint",
        "/api/Complaint/addComplaint",
        "/api/Complaint/add",
        "/api/complaint/AddComplaint",
        "/api/complaint/addComplaint",
        "/api/complaint/add",
        // Common REST-ish endpoints (older compatibility)
        "/api/Complaints/create",
        "/api/complaints/create",
      ];
      return this.postWithFallback(routes, complaint, { stopOnStatuses: [400, 401, 403, 415, 422] });
    },
  };
})();

