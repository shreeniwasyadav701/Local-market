/* Local Market — restaurant discovery page */
(function () {
  "use strict";
  const api = LM.api;
  const ui = LM.ui;

  ui.renderNavbar("restaurants.html");
  ui.renderFooter();

  const zone = document.getElementById("restaurants-zone");
  const pagerZone = document.getElementById("restaurants-pager");
  const countEl = document.getElementById("rest-count");
  const qInput = document.getElementById("rest-q");
  const clearBtn = document.getElementById("rest-clear");
  const sortSelect = document.getElementById("rest-sort");
  const catsZone = document.getElementById("rest-cats");

  let page = 1;
  let cuisine = "";

  const loadCuisineChips = async () => {
    try {
      const res = await api.get("/restaurants?limit=50&sort=name_asc");
      const names = new Set();
      (res.data || []).forEach((r) => {
        (Array.isArray(r.cuisine) ? r.cuisine : [r.cuisine]).forEach((c) => {
          const v = String(c || "").trim();
          if (v) names.add(v);
        });
      });
      const chips = ["All"].concat(Array.from(names).sort((a, b) => a.localeCompare(b)));
      catsZone.hidden = chips.length < 2;
      catsZone.innerHTML = chips
        .map(
          (c) =>
            '<button class="chip btn-like' +
            ((c === "All" ? !cuisine : cuisine === c) ? " on" : "") +
            '" data-cuisine="' +
            ui.esc(c) +
            '">' +
            ui.esc(c) +
            "</button>"
        )
        .join("");
      catsZone.querySelectorAll("[data-cuisine]").forEach((b) => {
        b.addEventListener("click", () => {
          const v = b.dataset.cuisine;
          cuisine = v === "All" ? "" : v;
          page = 1;
          catsZone.querySelectorAll(".chip").forEach((x) => {
            x.classList.toggle("on", x.dataset.cuisine === v);
          });
          load();
        });
      });
    } catch (e) {
      catsZone.hidden = true;
    }
  };

  const load = async () => {
    zone.innerHTML = ui.skeletonGrid(6);
    pagerZone.innerHTML = "";
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "6",
        sort: sortSelect.value,
      });
      const q = qInput.value.trim();
      if (q) params.set("search", q);
      if (cuisine) params.set("cuisine", cuisine);

      const res = await api.get("/restaurants?" + params.toString());
      const list = res.data || [];
      countEl.textContent = res.total + " restaurant" + (res.total === 1 ? "" : "s") + " found";

      if (!list.length) {
        const filtered = Boolean(q || cuisine);
        zone.innerHTML = ui.emptyState({
          icon: "🔍",
          title: "No restaurants found",
          text: filtered
            ? "Nothing matches " +
              [q ? '"' + q + '"' : "", cuisine ? '"' + cuisine + '"' : ""].filter(Boolean).join(" + ") +
              ". Try a different search or cuisine."
            : "No restaurants are open yet.",
          actionHtml: filtered
            ? '<button class="btn btn-outline" id="empty-clear">Clear search & filters</button>'
            : "",
        });
        const ec = document.getElementById("empty-clear");
        ec &&
          ec.addEventListener("click", () => {
            qInput.value = "";
            clearBtn.hidden = true;
            cuisine = "";
            page = 1;
            loadCuisineChips();
            load();
          });
        return;
      }

      zone.innerHTML = '<div class="grid grid-rest">' + list.map(ui.restaurantCard).join("") + "</div>";
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

  const debouncedSearch = ui.debounce(() => {
    page = 1;
    clearBtn.hidden = !qInput.value;
    load();
  }, 350);

  qInput.addEventListener("input", debouncedSearch);
  clearBtn.addEventListener("click", () => {
    qInput.value = "";
    clearBtn.hidden = true;
    page = 1;
    load();
    qInput.focus();
  });
  sortSelect.addEventListener("change", () => {
    page = 1;
    load();
  });

  loadCuisineChips();
  load();
})();
