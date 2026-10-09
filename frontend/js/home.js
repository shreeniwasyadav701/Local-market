/* Local Market — home page */
(function () {
  "use strict";
  const api = LM.api;
  const ui = LM.ui;

  const CATEGORIES = ui.FOOD_CATEGORIES;

  ui.renderNavbar("index.html");
  ui.renderFooter();

  const restaurantsZone = document.getElementById("restaurants-zone");
  const foodsZone = document.getElementById("foods-zone");

  document.getElementById("hero-search").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.getElementById("hero-q").value.trim();
    window.location.href = "search.html" + (q ? "?q=" + encodeURIComponent(q) : "");
  });

  const catRail = document.getElementById("cat-rail");
  catRail.innerHTML = CATEGORIES.map(
    (c) =>
      '<button class="cat-card" role="listitem" data-cat="' + ui.esc(c) + '">' +
      '<span class="cat-emoji" aria-hidden="true">' + ui.categoryEmoji(c) + "</span>" +
      "<b>" + ui.esc(c) + "</b></button>"
  ).join("");
  catRail.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cat]");
    if (btn) window.location.href = "search.html?type=food&category=" + encodeURIComponent(btn.dataset.cat);
  });

  const loadStats = async () => {
    try {
      const [r, f] = await Promise.all([
        api.get("/restaurants?limit=1"),
        api.get("/foods?limit=1"),
      ]);
      document.getElementById("stat-rest").textContent = r.total || 0;
      document.getElementById("stat-food").textContent = f.total || 0;
    } catch (e) {
      document.getElementById("stat-rest").textContent = "—";
      document.getElementById("stat-food").textContent = "—";
    }
  };

  const loadRestaurants = async () => {
    restaurantsZone.innerHTML = ui.skeletonGrid(4);
    try {
      const res = await api.get("/restaurants?sort=rating_desc&limit=8");
      const list = res.data || [];
      if (!list.length) {
        restaurantsZone.innerHTML = ui.emptyState({
          icon: "🏪",
          title: "No restaurants yet",
          text: "Once stores join, they will appear right here.",
        });
        return;
      }
      restaurantsZone.innerHTML = '<div class="grid grid-rest">' +
        list.map(ui.restaurantCard).join("") + "</div>";
    } catch (e) {
      restaurantsZone.innerHTML = ui.errorState(e.message);
      restaurantsZone.querySelector("[data-retry]") &&
        restaurantsZone.querySelector("[data-retry]").addEventListener("click", loadRestaurants);
    }
  };

  const favSet = new Set();
  const loadFavs = async () => {
    if (!LM.auth.isLoggedIn()) return;
    try {
      const res = await api.get("/favorites?limit=50");
      (res.data || []).forEach((f) => favSet.add(f.food._id));
    } catch (e) {
      /* non-critical */
    }
  };

  const loadFoods = async () => {
    foodsZone.innerHTML = ui.skeletonGrid(8, "food");
    try {
      const res = await api.get("/foods?sort=name_asc&limit=8");
      const list = res.data || [];
      if (!list.length) {
        foodsZone.innerHTML = ui.emptyState({
          icon: "🍲",
          title: "No dishes yet",
          text: "The menu is still being stocked.",
        });
        return;
      }
      foodsZone.innerHTML = '<div class="grid grid-food">' +
        list.map((f) => ui.foodCard(f, { showFav: true, favorite: favSet.has(f._id) })).join("") +
        "</div>";
      bindFoodActions(foodsZone, list);
    } catch (e) {
      foodsZone.innerHTML = ui.errorState(e.message);
      const retry = foodsZone.querySelector("[data-retry]");
      retry && retry.addEventListener("click", init);
    }
  };

  function bindFoodActions(zone, list) {
    zone.querySelectorAll("[data-add]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!LM.auth.isLoggedIn()) {
          ui.toast("Please login to add items to your cart", "warning");
          window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.pathname);
          return;
        }
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Adding...";
        try {
          await api.post("/cart", { foodId: btn.dataset.add, quantity: 1 });
          ui.toast(original && btn.dataset.name ? "Added " + btn.dataset.name + " to cart" : "Added to cart", "success");
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

  async function init() {
    await Promise.all([loadStats(), loadRestaurants(), loadFavs().then(loadFoods)]);
  }

  init();
})();
