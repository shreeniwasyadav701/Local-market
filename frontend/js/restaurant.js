/* Local Market — restaurant detail + menu */
(function () {
  "use strict";
  const api = LM.api;
  const ui = LM.ui;

  ui.renderNavbar("restaurants.html");
  ui.renderFooter();

  const hero = document.getElementById("rest-hero");
  const zone = document.getElementById("foods-zone");
  const catsRail = document.getElementById("menu-cats");
  const qInput = document.getElementById("menu-q");
  const vegOnly = document.getElementById("veg-only");

  const restId = ui.getParam("id");
  let restaurant = null;
  let foods = [];
  let activeCat = "All";
  const favSet = new Set();

  const showFatal = (title, text) => {
    hero.classList.remove("skeleton-hero");
    hero.innerHTML = "";
    document.querySelector(".toolbar").hidden = true;
    catsRail.hidden = true;
    zone.innerHTML = ui.emptyState({ icon: "🍽️", title, text,
      actionHtml: '<a class="btn btn-primary" href="restaurants.html">Back to restaurants</a>' });
  };

  const loadFavs = async () => {
    if (!LM.auth.isLoggedIn()) return;
    try {
      const res = await api.get("/favorites?limit=50");
      (res.data || []).forEach((f) => favSet.add(f.food._id));
    } catch (e) {
      /* non-critical */
    }
  };

  const renderHero = () => {
    hero.classList.remove("skeleton-hero");
    const cuisine = Array.isArray(restaurant.cuisine) ? restaurant.cuisine.join(", ") : restaurant.cuisine || "";
    hero.innerHTML =
      '<div class="rest-hero-media">' + ui.imageTag(restaurant.image, restaurant.name, "🏪") + "</div>" +
      '<div class="rest-hero-info">' +
      '<div class="flex-center" style="gap:8px;flex-wrap:wrap">' +
      (restaurant.rating ? '<span class="rating-pill">★ ' + ui.esc(restaurant.rating) + "</span>" : "") +
      (restaurant.isOpen === false ? '<span class="badge badge-danger">Closed</span>' : '<span class="badge badge-success">Open</span>') +
      "</div>" +
      "<h1>" + ui.esc(restaurant.name) + "</h1>" +
      '<p class="muted">' + (cuisine ? ui.esc(cuisine) + " · " : "") + ui.esc(restaurant.address || "") + "</p>" +
      '<div class="meta-row">' +
      '<span class="chip">🛵 ' + ui.esc(restaurant.deliveryTime || "30 min") + "</span>" +
      '<span class="chip">' + (Number(restaurant.deliveryFee) === 0 ? "Free delivery" : ui.money(restaurant.deliveryFee) + " delivery") + "</span>" +
      (restaurant.minOrder ? '<span class="chip">Min order ' + ui.money(restaurant.minOrder) + "</span>" : "") +
      '<span class="chip">' + (restaurant.foodCount || foods.length) + " items</span>" +
      "</div>" +
      (restaurant.description ? "<p>" + ui.esc(restaurant.description) + "</p>" : "") +
      "</div>";
    document.title = restaurant.name + " — Local Market";
  };

  const renderCats = () => {
    const cats = ["All", ...new Set(foods.map((f) => f.category).filter(Boolean))];
    catsRail.innerHTML = cats
      .map((c) => '<button class="chip btn-like' + (c === activeCat ? " on" : "") + '" data-cat="' + ui.esc(c) + '">' +
        (c === "All" ? "🍴 " : ui.categoryEmoji(c) + " ") + ui.esc(c) + "</button>")
      .join("");
    catsRail.querySelectorAll("[data-cat]").forEach((b) => {
      b.addEventListener("click", () => {
        activeCat = b.dataset.cat;
        renderCats();
        renderFoods();
      });
    });
  };

  const renderFoods = () => {
    const q = qInput.value.trim().toLowerCase();
    const list = foods.filter((f) => {
      if (activeCat !== "All" && f.category !== activeCat) return false;
      if (vegOnly.checked && !f.isVeg) return false;
      if (q && !f.name.toLowerCase().includes(q) && !(f.description || "").toLowerCase().includes(q)) return false;
      return true;
    });

    if (!list.length) {
      zone.innerHTML = ui.emptyState({
        icon: "🔍",
        title: "No dishes match",
        text: "Try a different search or category.",
      });
      return;
    }

    zone.innerHTML = '<div class="grid grid-food">' +
      list.map((f) => ui.foodCard(f, { showFav: true, favorite: favSet.has(f._id), hideAdd: restaurant.isOpen === false })).join("") +
      "</div>";
    bindActions();
  };

  function bindActions() {
    zone.querySelectorAll("[data-add]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!LM.auth.isLoggedIn()) {
          ui.toast("Please login to add items", "warning");
          window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.pathname + window.location.search);
          return;
        }
        btn.disabled = true;
        btn.textContent = "...";
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
          window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.pathname + window.location.search);
          return;
        }
        const id = btn.dataset.fav;
        try {
          if (btn.classList.contains("on")) {
            await api.del("/favorites/" + id);
            btn.classList.remove("on");
            btn.textContent = "♡";
            ui.toast("Removed from favorites");
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
  }

  const debounced = ui.debounce(renderFoods, 220);
  qInput.addEventListener("input", debounced);
  vegOnly.addEventListener("change", renderFoods);

  async function init() {
    if (!restId) {
      showFatal("Restaurant not found", "No restaurant was selected. Pick one from the list.");
      return;
    }
    hero.innerHTML = ui.skeletonGrid(1);
    zone.innerHTML = ui.skeletonGrid(8, "food");
    try {
      const res = await api.get("/restaurants/" + encodeURIComponent(restId));
      restaurant = res.data;
      foods = restaurant.foods || [];
      await loadFavs();
      renderHero();
      renderCats();
      renderFoods();
    } catch (e) {
      if (e.status === 404) {
        showFatal("Restaurant not found", "It may have been removed or the link is wrong.");
      } else if (e.status === 403) {
        showFatal("Restaurant unavailable", "This restaurant is not accepting orders right now.");
      } else {
        zone.innerHTML = ui.errorState(e.message);
        const retry = zone.querySelector("[data-retry]");
        retry && retry.addEventListener("click", init);
      }
    }
  }

  init();
})();
