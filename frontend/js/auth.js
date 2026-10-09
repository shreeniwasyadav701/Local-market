/* Local Market — auth session helpers (uses LM.api) */
(function () {
  "use strict";

  const api = () => window.LM.api;

  const Auth = {
    user() {
      return api().getStoredUser();
    },

    isLoggedIn() {
      return Boolean(api().getToken());
    },

    async login(email, password) {
      const res = await api().post("/auth/login", { email, password });
      api().saveSession(res.data.token, res.data.user);
      return res.data.user;
    },

    async register(payload) {
      const res = await api().post("/auth/register", payload);
      api().saveSession(res.data.token, res.data.user);
      return res.data.user;
    },

    logout() {
      api().clearSession();
      window.location.href = "index.html";
    },

    async refreshMe() {
      if (!this.isLoggedIn()) return null;
      try {
        const res = await api().get("/auth/me");
        api().setStoredUser(res.data);
        return res.data;
      } catch (e) {
        if (e.status === 401) api().clearSession();
        return api().getStoredUser();
      }
    },

    requireAuth(currentPath) {
      if (this.isLoggedIn()) return true;
      const back = currentPath || window.location.pathname + window.location.search;
      window.location.href = "login.html?redirect=" + encodeURIComponent(back);
      return false;
    },
  };

  window.LM = window.LM || {};
  window.LM.auth = Auth;
})();
