/* Local Market — centralized API client */
(function () {
  "use strict";

  const TOKEN_KEY = "lm_token";
  const USER_KEY = "lm_user";

  class ApiError extends Error {
    constructor(status, message) {
      super(message || "Request failed");
      this.status = status;
    }
  }

  const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
  const getStoredUser = () => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch (e) {
      return null;
    }
  };

  const saveSession = (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    window.dispatchEvent(new CustomEvent("lm:auth"));
  };

  const setStoredUser = (user) => {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    window.dispatchEvent(new CustomEvent("lm:auth"));
  };

  const clearSession = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.dispatchEvent(new CustomEvent("lm:auth"));
  };

  const readError = async (res) => {
    let message = "Something went wrong. Please try again.";
    try {
      const data = await res.json();
      if (data && data.message) message = data.message;
    } catch (e) {
      /* non-JSON error body */
    }
    return new ApiError(res.status, message);
  };

  const request = async (method, path, body) => {
    const headers = { Accept: "application/json" };
    const token = getToken();
    if (token) headers.Authorization = "Bearer " + token;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res;
    try {
      res = await fetch("/api" + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new ApiError(0, "Cannot reach the server. Please check your connection.");
    }

    if (res.status === 401 && token) {
      clearSession();
    }

    if (!res.ok) throw await readError(res);
    if (res.status === 204) return null;

    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  const api = {
    ApiError,
    getToken,
    getStoredUser,
    saveSession,
    setStoredUser,
    clearSession,
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body === undefined ? {} : body),
    put: (path, body) => request("PUT", path, body === undefined ? {} : body),
    patch: (path, body) => request("PATCH", path, body === undefined ? {} : body),
    del: (path) => request("DELETE", path),
  };

  window.LM = window.LM || {};
  window.LM.api = api;
})();
