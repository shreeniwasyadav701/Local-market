/* Local Market — search page (debounced, tabs, category) */
(function () {
  "use strict";
  const api = LM.api;
  const ui = LM.ui;

  ui.renderNavbar("search.html");
  ui.renderFooter();

  const qInput = document.getElementById("q");
  const clearBtn = document.getElementById("clear-btn");
  const zone = document.getElementById("results-zone");
  const pagerZone = document.getElementById("results-pager");
  const hint = document.getElementById("search-hint");
  const catFilter = document.getElementById("cat-filter");
  const tabs = document.querySelectorAll(".tab");
  const CATEGORIES = ui.FOOD_CATEGORIES;

  let type = ui.getParam("type") === "restaurant" ? "restaurant" : "food";
  let page = 1;
  let category = ui.getParam("category") || "";
  if (category && CATEGORIES.indexOf(category) === -1) category = "";
  const favSet = new Set();

  qInput.value = ui.getParam("q") || "";

  const syncTabs = () => {
    tabs.forEach((t) => {
      const on = t.dataset.type === type;
      t.classList.toggle("on", on);
      t.setAttribute("aria-selected", String(on));
    });
    catFilter.hidden = type !== "food";
  };

  const renderCats = () => {
    if (type !== "food") return;
    catFilter.innerHTML =
      '<button class="chip btn-like' + (category ? "" : " on") + '" data-cat="">🍴 All</button>' +
      CATEGORIES.map(
        (c) => '<button class="chip btn-like' + (c === category ? " on" : "") + '" data-cat="' + ui.esc(c) + '">' +
          ui.categoryEmoji(c) + " " + ui.esc(c) + "</button>"
      ).join("");
    catFilter.querySelectorAll("[data-cat]").forEach((b) => {
      b.addEventListener("click", () => {
        category = b.dataset.cat;
        page = 1;
        renderCats();
        load();
      });
    });
  };

  const loadFavs = async () => {
    favSet.clear();
    if (!LM.auth.isLoggedIn()) return;
    try {
      const res = await api.get("/favorites?limit=50");
      (res.data || []).forEach((f) => favSet.add(f.food._id));
    } catch (e) {
      /* non-critical */
    }
  };

  const bindFoodActions = () => {
    zone.querySelectorAll("[data-add]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!LM.auth.isLoggedIn()) {
          ui.toast("Please login to add items", "warning");
          window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.pathname + "?q=" + encodeURIComponent(qInput.value));
          return;
        }
        btn.disabled = true;
        try {
          await api.post("/cart", { foodId: btn.dataset.add, quantity: 1 });
          ui.toast("Added " + btn.dataset.name + " to cart", "success");
          ui.refreshCartBadge();
        } catch (e) {
          ui.toast(e.message, "error");
        } finally {
          btn.disabled = false;
          btn.textContent = "+ Add";
        }
      });
    });

    zone.querySelectorAll("[data-fav]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!LM.auth.isLoggedIn()) {
          ui.toast("Please login to save favorites", "warning");
          window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.pathname);
          return;
        }
        const id = btn.dataset.fav;
        try {
          if (btn.classList.contains("on")) {
            await api.del("/favorites/" + id);
            btn.classList.remove("on");
            btn.textContent = "♡";
          } else {
            await api.post("/favorites/" + id);
            btn.classList.add("on");
            btn.textContent = "♥";
            ui.toast("Added to favorites", "success");
          }
        } catch (e) {
          if (e.status === 409) {
            btn.classList.add("on");
            btn.textContent = "♥";
          } else {
            ui.toast(e.message, "error");
          }
        }
      });
    });
  };

  const load = async () => {
    const q = qInput.value.trim();
    zone.innerHTML = ui.skeletonGrid(6, type === "food" ? "food" : "rest");
    pagerZone.innerHTML = "";
    hint.textContent = q ? 'Results for "' + q + '"' : "Find dishes and restaurants across the marketplace.";

    try {
      const params = new URLSearchParams({ page: String(page), limit: "9" });
      if (q) params.set("search", q);
      if (type === "food") {
        if (category) params.set("category", category);
        params.set("sort", "name_asc");
      } else {
        params.set("sort", "rating_desc");
      }

      const res = await api.get((type === "food" ? "/foods?" : "/restaurants?") + params.toString());
      const list = res.data || [];

      if (!list.length) {
        zone.innerHTML = ui.emptyState({
          icon: "🔍",
          title: "No results",
          text: q
            ? 'Nothing found for "' + q + '"' + (category ? " in " + category : "") + ". Try another word."
            : "Start typing to search the marketplace.",
          actionHtml: q || category ? '<button class="btn btn-outline" id="reset-btn">Clear filters</button>' : "",
        });
        const rb = document.getElementById("reset-btn");
        rb && rb.addEventListener("click", () => {
          qInput.value = "";
          category = "";
          clearBtn.hidden = true;
          page = 1;
          renderCats();
          load();
        });
        return;
      }

      if (type === "food") {
        zone.innerHTML = '<div class="grid grid-food">' +
          list.map((f) => ui.foodCard(f, { showFav: true, favorite: favSet.has(f._id) })).join("") +
          "</div>";
        bindFoodActions();
      } else {
        zone.innerHTML = '<div class="grid grid-rest">' + list.map(ui.restaurantCard).join("") + "</div>";
      }

      pagerZone.innerHTML = ui.pager(res.pagination, "data-page");
      pagerZone.querySelectorAll("[data-page]").forEach((b) => {
        b.addEventListener("click", () => {
          page = Number(b.dataset.page);
          load();
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      });
    } catch (e) {
      zone.innerHTML = ui.errorState(e.message);
      const retry = zone.querySelector("[data-retry]");
      retry && retry.addEventListener("click", load);
    }
  };

  const debounced = ui.debounce(async () => {
    page = 1;
    clearBtn.hidden = !qInput.value;
    await loadFavs();
    load();
  }, 350);

  qInput.addEventListener("input", debounced);
  clearBtn.addEventListener("click", () => {
    qInput.value = "";
    clearBtn.hidden = true;
    page = 1;
    load();
    qInput.focus();
  });

  tabs.forEach((t) => {
    t.addEventListener("click", () => {
      type = t.dataset.type;
      page = 1;
      if (type !== "food") category = "";
      syncTabs();
      renderCats();
      load();
    });
  });

  async function init() {
    syncTabs();
    renderCats();
    clearBtn.hidden = !qInput.value;
    await loadFavs();
    load();
  }

  init();
})();
