/* Local Market — shared UI components, states and formatters */
(function () {
  "use strict";

  const FOOD_EMOJI = {
    Pizza: "🍕",
    Biryani: "🍚",
    Starters: "🍢",
    "Main Course": "🍛",
    Breads: "🫓",
    Rice: "🍚",
    Desserts: "🍰",
    Beverages: "🥤",
    Snacks: "🍘",
    Chinese: "🥡",
  };

  /* Canonical food categories. Must stay byte-identical to backend
     FOOD_CATEGORIES (backend/utils/constants.js): GET /api/foods?category=
     rejects anything else with HTTP 400, which would blank a whole page. */
  const FOOD_CATEGORIES = [
    "Starters", "Main Course", "Breads", "Rice", "Biryani",
    "Desserts", "Beverages", "Snacks", "Pizza",
  ];

  const CATEGORY_EMOJI = {
    Pizza: "🍕",
    Burger: "🍔",
    Biryani: "🍛",
    Chinese: "🥡",
    Desserts: "🍰",
    Beverages: "🥤",
    Starters: "🍢",
    "Main Course": "🍲",
    Breads: "🫓",
    Rice: "🍚",
    Snacks: "🍘",
    "Fast Food": "🍔",
    Sweets: "🍬",
    "Ice Cream": "🍨",
  };

  const ORDER_STEPS = [
    { key: "placed", label: "Order placed", icon: "🧾", note: "We have received your order" },
    { key: "confirmed", label: "Confirmed", icon: "✅", note: "Restaurant accepted your order" },
    { key: "preparing", label: "Preparing", icon: "👨‍🍳", note: "Your food is being cooked" },
    { key: "out_for_delivery", label: "Out for delivery", icon: "🛵", note: "Rider is on the way" },
    { key: "delivered", label: "Delivered", icon: "🎉", note: "Enjoy your meal!" },
  ];

  const esc = (value) =>
    String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const money = (n) => "₹" + (Math.round(Number(n) * 100) / 100).toLocaleString("en-IN");

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const shortId = (id) => (id ? "#" + String(id).slice(-6).toUpperCase() : "");

  const getParam = (name) => new URLSearchParams(window.location.search).get(name);

  const debounce = (fn, wait) => {
    let t;
    return function () {
      const args = arguments;
      const self = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(self, args), wait);
    };
  };

  const categoryEmoji = (category) =>
    CATEGORY_EMOJI[category] || FOOD_EMOJI[category] || "🍴";

  const foodEmoji = (name) => {
    const n = String(name || "").toLowerCase();
    if (n.includes("pizza")) return "🍕";
    if (n.includes("burger")) return "🍔";
    if (n.includes("biryani") || n.includes("rice")) return "🍚";
    if (n.includes("dosa") || n.includes("idli")) return "🥞";
    if (n.includes("cake") || n.includes("brownie") || n.includes("scoop")) return "🍰";
    if (n.includes("coffee") || n.includes("cold")) return "🥤";
    if (n.includes("noodle") || n.includes("manchurian") || n.includes("chilli")) return "🥡";
    if (n.includes("chicken") || n.includes("tandoori")) return "🍗";
    if (n.includes("paneer") || n.includes("curry")) return "🍛";
    if (n.includes("naan") || n.includes("bread")) return "🫓";
    return "🍴";
  };

  /* ---------- images with fallback ---------- */
  const imgFallback = (el, emoji) => {
    const wrap = el.parentElement;
    el.style.display = "none";
    if (wrap && !wrap.querySelector(".img-fb")) {
      const fb = document.createElement("span");
      fb.className = "img-fb food-emoji-fb";
      fb.setAttribute("aria-hidden", "true");
      fb.textContent = emoji || "🍴";
      wrap.appendChild(fb);
    }
  };

  const usableSrc = (src) => {
    const s = String(src || "").trim();
    if (!s) return "";
    return /^(https?:\/\/|\/|\.\/|data:image\/)/i.test(s) ? s : "";
  };

  const imageTag = (src, alt, emoji) => {
    const safeSrc = esc(usableSrc(src));
    const fb = emoji ? esc(emoji) : "🍴";
    if (!safeSrc) {
      return '<span class="food-emoji-fb" aria-hidden="true">' + fb + "</span>";
    }
    return (
      '<img src="' +
      safeSrc +
      '" alt="' +
      esc(alt) +
      '" loading="lazy" onerror="this.parentElement && window.LM.ui.imgFallback(this,\'' +
      fb +
      "')\">"
    );
  };

  /* ---------- toasts ---------- */
  const toast = (message, type) => {
    let host = document.querySelector(".toasts");
    if (!host) {
      host = document.createElement("div");
      host.className = "toasts";
      document.body.appendChild(host);
    }
    const el = document.createElement("div");
    el.className = "toast " + (type || "");
    el.setAttribute("role", "status");
    el.innerHTML =
      "<span>" + esc(message) + '</span><button class="t-close" aria-label="Dismiss">✕</button>';
    el.querySelector(".t-close").addEventListener("click", () => el.remove());
    host.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  };

  /* ---------- confirm modal ---------- */
  const confirmModal = (opts) =>
    new Promise((resolve) => {
      const title = opts.title || "Are you sure?";
      const text = opts.message || "";
      const okLabel = opts.okLabel || "Confirm";
      const danger = opts.danger !== false;

      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="cm-title">' +
        '<h3 id="cm-title">' + esc(title) + "</h3>" +
        '<p class="muted">' + esc(text) + "</p>" +
        '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
        '<button class="btn ' + (danger ? "btn-danger" : "btn-primary") + '" data-act="ok">' +
        esc(okLabel) +
        "</button></div></div>";

      const done = (val) => {
        backdrop.remove();
        document.removeEventListener("keydown", onKey);
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === "Escape") done(false);
      };

      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) done(false);
        const act = e.target.closest("[data-act]");
        if (!act) return;
        done(act.dataset.act === "ok");
      });
      document.addEventListener("keydown", onKey);
      document.body.appendChild(backdrop);
      backdrop.querySelector('[data-act="ok"]').focus();
    });

  /* ---------- state blocks ---------- */
  const spinnerBlock = (label) =>
    '<div class="loading-block"><div class="spinner" role="status" aria-label="' +
    esc(label || "Loading") +
    '"></div><p>' +
    esc(label || "Loading...") +
    "</p></div>";

  const skeletonGrid = (n, kind) => {
    let html = "";
    for (let i = 0; i < (n || 6); i++) {
      html +=
        '<div class="sk-card" aria-hidden="true">' +
        '<div class="skeleton sk-media"></div>' +
        '<div class="skeleton sk-line w60"></div>' +
        '<div class="skeleton sk-line w40"></div></div>';
    }
    return '<div class="grid ' + (kind === "food" ? "grid-food" : "grid-rest") + '">' + html + "</div>";
  };

  const emptyState = (opts) =>
    '<div class="state-box"><div class="state-icon" aria-hidden="true">' +
    esc(opts.icon || "🍽️") +
    "</div><h3>" +
    esc(opts.title || "Nothing here yet") +
    "</h3><p>" +
    esc(opts.text || "") +
    "</p>" +
    (opts.actionHtml || "") +
    "</div>";

  const errorState = (message, retryAttr) =>
    '<div class="state-box error"><div class="state-icon" aria-hidden="true">⚠️</div>' +
    "<h3>Something went wrong</h3><p>" +
    esc(message || "Please try again in a moment.") +
    '</p><button class="btn btn-primary" ' +
    (retryAttr || 'data-retry="1"') +
    ">Try again</button></div>";

  const unauthorizedState = () =>
    '<div class="state-box"><div class="state-icon" aria-hidden="true">🔐</div>' +
    "<h3>Please sign in</h3><p>You need an account to view this page.</p>" +
    '<a class="btn btn-primary" href="login.html?redirect=' +
    esc(window.location.pathname + window.location.search) +
    '">Login or Register</a></div>';

  /* ---------- badges ---------- */
  const statusBadge = (status) => {
    const s = String(status || "").toLowerCase();
    const map = {
      placed: ["badge-info", "Placed"],
      confirmed: ["badge-brand", "Confirmed"],
      preparing: ["badge-warning", "Preparing"],
      out_for_delivery: ["badge-warning", "Out for delivery"],
      delivered: ["badge-success", "Delivered"],
      cancelled: ["badge-danger", "Cancelled"],
      pending: ["badge-warning", "Pending"],
      paid: ["badge-success", "Paid"],
      success: ["badge-success", "Success"],
      failed: ["badge-danger", "Failed"],
      refunded: ["badge-info", "Refunded"],
      /* Payment collection statuses are stored UPPERCASE (Payment model). */
      PENDING: ["badge-warning", "Pending"],
      SUCCESS: ["badge-success", "Success"],
      FAILED: ["badge-danger", "Failed"],
      REFUNDED: ["badge-info", "Refunded"],
      cod: ["badge-dark", "COD"],
      mock_card: ["badge-brand", "Card"],
      mock_upi: ["badge-brand", "UPI"],
      /* Payment methods are stored UPPERCASE (Payment model). */
      COD: ["badge-dark", "COD"],
      MOCK_CARD: ["badge-brand", "Card"],
      MOCK_UPI: ["badge-brand", "UPI"],
      home: ["badge-brand", "Home"],
      work: ["badge-info", "Work"],
      other: ["badge", "Other"],
    };
    const found = map[s] || ["badge", String(status || "")];
    const label = found[1];
    return '<span class="badge ' + found[0] + '">' + esc(label) + "</span>";
  };

  const vegMark = (isVeg) =>
    '<span class="veg-mark ' + (isVeg ? "" : "nonveg") + '" title="' +
    (isVeg ? "Vegetarian" : "Non-vegetarian") +
    '" role="img" aria-label="' +
    (isVeg ? "Vegetarian" : "Non-vegetarian") +
    '"></span>';

  /* ---------- shared cards ---------- */
  const restaurantCard = (r) => {
    const cuisine = Array.isArray(r.cuisine) ? r.cuisine.join(", ") : r.cuisine || "";
    const closed = r.isOpen === false;
    return (
      '<article class="card">' +
      '<div class="card-media">' +
      imageTag(r.image, r.name, "🏪") +
      (closed ? '<div class="closed-shade"></div>' : "") +
      '<div class="overlay-badges">' +
      (closed ? '<span class="badge badge-danger">Closed</span>' : "") +
      (r.foodCount ? '<span class="badge badge-dark">' + r.foodCount + " items</span>" : "") +
      "</div></div>" +
      '<div class="card-body">' +
      '<div class="card-title-row"><h3 class="card-title">' +
      '<a href="restaurant.html?id=' + encodeURIComponent(r._id) + '">' + esc(r.name) + "</a></h3>" +
      (r.rating ? '<span class="rating-pill">★ ' + esc(r.rating) + "</span>" : "") +
      "</div>" +
      '<div class="card-meta">' + (cuisine ? esc(cuisine) : "Local marketplace") + "</div>" +
      '<div class="card-meta">🛵 ' + esc(r.deliveryTime || "30 min") +
      (r.deliveryFee !== undefined && r.deliveryFee !== null
        ? " · " + (Number(r.deliveryFee) === 0 ? "Free delivery" : money(r.deliveryFee) + " delivery")
        : "") +
      (r.minOrder ? " · Min " + money(r.minOrder) : "") +
      "</div>" +
      '<div class="card-foot"><span class="muted small">' +
      esc(r.address || "") +
      '</span><a class="btn btn-sm btn-outline" href="restaurant.html?id=' +
      encodeURIComponent(r._id) +
      '">View menu</a></div>' +
      "</div></article>"
    );
  };

  const foodCard = (food, opts) => {
    opts = opts || {};
    const restName =
      food.restaurant && typeof food.restaurant === "object"
        ? food.restaurant.name
        : opts.restaurantName || "";
    const fav = opts.favorite ? " on" : "";
    const favLabel = opts.favorite ? "Remove from favorites" : "Add to favorites";
    const unavailable = food.isAvailable === false;
    return (
      '<article class="card food-card">' +
      '<div class="card-media">' +
      imageTag(food.image, food.name, foodEmoji(food.name)) +
      '<div class="overlay-badges">' +
      (unavailable ? '<span class="badge badge-danger">Unavailable</span>' : "") +
      "</div>" +
      (opts.showFav
        ? '<button class="fav-btn' + fav + '" data-fav="' +
          esc(food._id) +
          '" aria-label="' + favLabel + '" title="' + favLabel + '">' +
          (opts.favorite ? "♥" : "♡") +
          "</button>"
        : "") +
      "</div>" +
      '<div class="card-body">' +
      '<div class="flex-center" style="gap:6px">' +
      vegMark(food.isVeg) +
      '<span class="badge">' + esc(food.category || "Item") + "</span></div>" +
      '<h3 class="card-title"><a href="food.html?id=' + encodeURIComponent(food._id) + '">' +
      esc(food.name) +
      "</a></h3>" +
      (restName ? '<div class="card-meta">' + esc(restName) + "</div>" : "") +
      '<div class="card-foot"><span class="price"><span class="cur">₹</span>' +
      esc(food.price) +
      "</span>" +
      (opts.hideAdd
        ? ""
        : '<button class="btn btn-sm btn-primary" data-add="' +
          esc(food._id) +
          '" data-name="' +
          esc(food.name) +
          '"' +
          (unavailable ? " disabled" : "") +
          ">" +
          (unavailable ? "Unavailable" : "+ Add") +
          "</button>") +
      "</div></div></article>"
    );
  };

  const pager = (pagination, attr) => {
    const p = pagination || {};
    const page = p.page || 1;
    const pages = p.totalPages || 1;
    if (pages <= 1) return "";
    let btns = "";
    for (let i = 1; i <= pages; i++) {
      btns +=
        '<button class="' + (i === page ? "cur" : "") + '" ' +
        (i === page ? 'aria-current="page" ' : "") +
        attr + '="' + i + '">' + i + "</button>";
    }
    return (
      '<nav class="pager" aria-label="Pagination">' +
      '<button ' + attr + '="' + (page - 1) + '"' + (page <= 1 ? " disabled" : "") + ">‹</button>" +
      btns +
      '<button ' + attr + '="' + (page + 1) + '"' + (page >= pages ? " disabled" : "") + ">›</button>" +
      '<span class="info">Page ' + page + " of " + pages + "</span></nav>"
    );
  };

  /* ---------- navbar ---------- */
  const NAV_LINKS = [
    { href: "index.html", label: "Home", match: /^index\.html$|^$/ },
    { href: "restaurants.html", label: "Restaurants", match: /^restaurants\.html$/ },
    { href: "search.html", label: "Search", match: /^search\.html$/ },
    { href: "favorites.html", label: "Favorites", match: /^favorites\.html$/ },
    { href: "orders.html", label: "My Orders", match: /^orders\.html$|^order\.html$/, auth: true },
  ];

  const initials = (name) =>
    String(name || "?")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("");

  const renderNavbar = (activeHref) => {
    const host = document.getElementById("nav-root");
    if (!host) return;

    const loggedIn = window.LM.auth.isLoggedIn();
    const user = window.LM.auth.user();
    const path = window.location.pathname.split("/").pop() || "index.html";
    const active = activeHref || path;

    const linksHtml = NAV_LINKS.map((l) => {
      if (l.auth && !loggedIn) return "";
      const isActive = l.match.test(active) || active === l.href;
      return (
        '<a href="' + l.href + '"' + (isActive ? ' class="active" aria-current="page"' : "") + ">" +
        l.label +
        "</a>"
      );
    }).join("");

    const isAdmin = loggedIn && user && user.role === "admin";
    const adminLink = isAdmin
      ? '<a href="admin.html"' + (active.indexOf("admin") === 0 ? ' class="active" aria-current="page"' : "") + ">Admin</a>"
      : "";

    const rightHtml = loggedIn
      ? '<a class="btn btn-ghost btn-icon cart-link" href="cart.html" aria-label="Cart" title="Cart">🛒<span class="cart-badge" hidden>0</span></a>' +
        '<div class="profile-menu">' +
        '<button class="profile-btn" id="profile-btn" aria-haspopup="true" aria-expanded="false">' +
        '<span class="pb-name">' + esc((user && user.name) || "Account") + "</span>" +
        '<span class="avatar">' + esc(initials((user && user.name) || "U")) + "</span></button>" +
        '<div class="dropdown" id="profile-dd" hidden>' +
        '<div class="dd-head"><b>' + esc((user && user.name) || "") + "</b>" +
        '<div class="small muted">' + esc((user && user.email) || "") + "</div></div>" +
        '<a href="profile.html">👤 My profile</a>' +
        '<a href="orders.html">📦 My orders</a>' +
        '<a href="favorites.html">♥ Favorites</a>' +
        '<a href="addresses.html">📍 Saved addresses</a>' +
        '<button type="button" class="danger" data-logout>🚪 Log out</button>' +
        "</div></div>"
      : '<a class="btn btn-ghost btn-icon cart-link" href="cart.html" aria-label="Cart" title="Cart">🛒<span class="cart-badge" hidden>0</span></a>' +
        '<a class="btn btn-outline btn-sm" href="login.html">Login</a>' +
        '<a class="btn btn-primary btn-sm" href="register.html">Sign up</a>';

    host.innerHTML =
      '<header class="nav"><div class="container nav-inner">' +
      '<a class="brand" href="index.html" aria-label="Local Market home">' +
      '<span class="brand-mark" aria-hidden="true">LM</span> Local Market</a>' +
      '<nav class="nav-links" aria-label="Primary">' + linksHtml + adminLink + "</nav>" +
      '<div class="nav-right">' + rightHtml +
      '<button class="nav-toggle" id="nav-toggle" aria-label="Open menu" aria-expanded="false">' +
      "<span></span><span></span><span></span></button>" +
      "</div></div>" +
      '<div class="mobile-menu" id="mobile-menu">' +
      NAV_LINKS.map((l) => {
        if (l.auth && !loggedIn) return "";
        const isActive = active === l.href;
        return '<a href="' + l.href + '"' + (isActive ? ' class="active"' : "") + ">" + l.label + "</a>";
      }).join("") +
      (isAdmin ? '<a href="admin.html"' + (active.indexOf("admin") === 0 ? ' class="active"' : "") + ">🛡️ Admin</a>" : "") +
      '<div class="sep"></div>' +
      (loggedIn
        ? '<a href="cart.html">🛒 Cart</a><a href="profile.html">👤 My profile</a>' +
          '<a href="addresses.html">📍 Addresses</a>' +
          '<button type="button" data-logout>🚪 Log out</button>'
        : '<a href="login.html">🔑 Login</a><a href="register.html">✨ Create account</a>') +
      "</div></header>";

    const toggle = document.getElementById("nav-toggle");
    const menu = document.getElementById("mobile-menu");
    toggle.addEventListener("click", () => {
      const open = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });

    const pBtn = document.getElementById("profile-btn");
    const pDd = document.getElementById("profile-dd");
    if (pBtn && pDd) {
      pBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = pDd.hidden;
        pDd.hidden = !open;
        pBtn.setAttribute("aria-expanded", String(open));
      });
      document.addEventListener("click", (e) => {
        if (!pDd.hidden && !pDd.contains(e.target)) {
          pDd.hidden = true;
          pBtn.setAttribute("aria-expanded", "false");
        }
      });
    }

    host.querySelectorAll("[data-logout]").forEach((el) => {
      el.addEventListener("click", () => window.LM.auth.logout());
    });

    updateCartBadge();
  };

  const updateCartBadge = async () => {
    const badges = document.querySelectorAll(".cart-badge");
    if (!badges.length) return;
    if (!window.LM.auth.isLoggedIn()) {
      badges.forEach((b) => (b.hidden = true));
      return;
    }
    try {
      const res = await window.LM.api.get("/cart");
      const count = (res.data && res.data.itemCount) || 0;
      badges.forEach((b) => {
        b.textContent = String(count);
        b.hidden = count === 0;
      });
    } catch (e) {
      /* badge is non-critical */
    }
  };

  const renderFooter = () => {
    const host = document.getElementById("footer-root");
    if (!host) return;
    host.innerHTML =
      '<footer class="footer"><div class="container">' +
      '<div class="footer-grid">' +
      "<div>" +
      '<a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true">LM</span> Local Market</a>' +
      "<p>Fresh food and local essentials from neighbourhood shops, delivered with care. A full-stack practice project.</p>" +
      "</div>" +
      "<div><h4>Explore</h4>" +
      '<a href="restaurants.html">Restaurants</a>' +
      '<a href="search.html">Search</a>' +
      '<a href="favorites.html">Favorites</a>' +
      '<a href="cart.html">Cart</a></div>' +
      "<div><h4>Account</h4>" +
      '<a href="orders.html">My orders</a>' +
      '<a href="addresses.html">Addresses</a>' +
      '<a href="profile.html">Profile</a>' +
      '<a href="register.html">Create account</a></div>' +
      "</div>" +
      '<div class="footer-bottom"><span>© ' +
      new Date().getFullYear() +
      " Local Market — academic project, not a real store.</span>" +
      "<span>HTML · CSS · Vanilla JS · Node.js · MongoDB</span></div>" +
      "</div></footer>";
  };

  const refreshCartBadge = updateCartBadge;

  window.LM = window.LM || {};
  window.LM.ui = {
    esc,
    money,
    formatDate,
    shortId,
    getParam,
    debounce,
    foodEmoji,
    categoryEmoji,
    FOOD_CATEGORIES,
    imageTag,
    imgFallback,
    toast,
    confirmModal,
    spinnerBlock,
    skeletonGrid,
    emptyState,
    errorState,
    unauthorizedState,
    statusBadge,
    vegMark,
    restaurantCard,
    foodCard,
    pager,
    renderNavbar,
    renderFooter,
    refreshCartBadge,
    ORDER_STEPS,
  };
})();
