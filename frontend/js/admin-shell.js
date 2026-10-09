/* Local Market — shared admin shell: access guard, sidebar nav, table pager.
   Every admin page loads api.js, auth.js, ui.js, admin.js, then admin-shell.js,
   then calls LM.adminShell.init({ active, title, subtitle }). */
(function () {
  "use strict";

  const LINKS = [
    { href: "admin.html", label: "Overview", icon: "📊", match: /^admin\.html$/ },
    { href: "admin-orders.html", label: "Orders", icon: "📦", match: /^admin-orders(\.html|-detail\.html)$/ },
    { href: "admin-restaurants.html", label: "Restaurants", icon: "🏪", match: /^admin-restaurants(\.html|-detail\.html)$/ },
    { href: "admin-foods.html", label: "Foods", icon: "🍽️", match: /^admin-foods\.html$/ },
    { href: "admin-payments.html", label: "Payments", icon: "💳", match: /^admin-payments\.html$/ },
  ];

  const esc = (v) =>
    String(v === null || v === undefined ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const initials = (name) =>
    String(name || "?")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("");

  const renderNav = (activeHref) => {
    const host = document.getElementById("admin-nav-root");
    if (!host) return;
    const user = window.LM.admin.user();
    const links = LINKS.map((l) => {
      const isActive = l.match.test(activeHref) || activeHref === l.href;
      return (
        '<a href="' + l.href + '"' + (isActive ? ' class="active" aria-current="page"' : "") + ">" +
        '<span aria-hidden="true">' + l.icon + "</span>" + l.label + "</a>"
      );
    }).join("");

    host.innerHTML =
      '<aside class="admin-nav">' +
      '<div class="an-brand"><span class="brand-mark" aria-hidden="true">LM</span> Admin</div>' +
      links +
      '<div class="sep"></div>' +
      '<a href="index.html"><span aria-hidden="true">🛍️</span> Back to store</a>' +
      '<a href="#" data-admin-logout><span aria-hidden="true">🚪</span> Log out</a>' +
      '<div class="an-user" style="padding:10px 12px;font-size:.82rem;color:var(--ink-500)">' +
      esc((user && user.name) || "Admin") + "</div>" +
      "</aside>";

    host.querySelector("[data-admin-logout]").addEventListener("click", (e) => {
      e.preventDefault();
      window.LM.auth.logout();
    });
  };

  /* Renders the standard pager control into a container element.
     opts: { page, totalPages, onPage }. */
  const pager = (container, opts) => {
    const page = opts.page || 1;
    const totalPages = opts.totalPages || 1;
    if (!container) return;
    if (totalPages <= 1) {
      container.innerHTML = "";
      return;
    }
    let btns = "";
    for (let i = 1; i <= totalPages; i++) {
      btns +=
        '<button class="' + (i === page ? "cur" : "") + '" data-pg="' + i + '"' +
        (i === page ? ' aria-current="page"' : "") + ">" + i + "</button>";
    }
    container.innerHTML =
      '<nav class="pager" aria-label="Pagination">' +
      '<button data-pg="' + (page - 1) + '"' + (page <= 1 ? " disabled" : "") + ">‹</button>" +
      btns +
      '<button data-pg="' + (page + 1) + '"' + (page >= totalPages ? " disabled" : "") + ">›</button>" +
      '<span class="info">Page ' + page + " of " + totalPages + "</span></nav>";

    container.querySelectorAll("[data-pg]").forEach((b) => {
      b.addEventListener("click", () => {
        if (b.disabled) return;
        const next = Number(b.dataset.pg);
        if (!next || next === page || next < 1 || next > totalPages) return;
        opts.onPage(next);
      });
    });
  };

  const init = (opts) => {
    opts = opts || {};
    if (!window.LM.admin.guard()) return false;
    renderNav(opts.active || "");
    const h1 = document.getElementById("admin-title");
    const sub = document.getElementById("admin-subtitle");
    if (h1 && opts.title) h1.textContent = opts.title;
    if (sub) sub.textContent = opts.subtitle || "";
    return true;
  };

  window.LM = window.LM || {};
  window.LM.adminShell = { init, pager, esc, LINKS };
})();
