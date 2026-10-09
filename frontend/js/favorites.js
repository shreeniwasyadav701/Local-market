/* Local Market — favorites page */
(function () {
  "use strict";
  const api = LM.api;
  const ui = LM.ui;

  ui.renderNavbar("favorites.html");
  ui.renderFooter();

  const zone = document.getElementById("fav-zone");
  const pagerZone = document.getElementById("fav-pager");
  const countEl = document.getElementById("fav-count");

  if (!LM.auth.isLoggedIn()) {
    zone.innerHTML = ui.unauthorizedState();
    document.querySelector(".page-actions").hidden = true;
    return;
  }

  let page = 1;

  const load = async () => {
    zone.innerHTML = ui.skeletonGrid(6, "food");
    pagerZone.innerHTML = "";
    try {
      const res = await api.get("/favorites?page=" + page + "&limit=9");
      const items = res.data || [];
      countEl.textContent = res.count + " saved dish" + (res.count === 1 ? "" : "es");

      if (!items.length) {
        zone.innerHTML = ui.emptyState({
          icon: "♡",
          title: "No favorites yet",
          text: "Tap the heart on any dish to save it here.",
          actionHtml: '<a class="btn btn-primary" href="search.html">Discover dishes</a>',
        });
        return;
      }

      zone.innerHTML = '<div class="grid grid-food">' +
        items
          .map((item) => {
            const food = item.food;
            if (!food || !food._id) return "";
            const unavailable = food.isAvailable === false;
            return ui.foodCard(food, {
              showFav: true,
              favorite: true,
              hideAdd: unavailable,
              restaurantName: food.restaurant && typeof food.restaurant === "object" ? food.restaurant.name : "",
            });
          })
          .join("") +
        "</div>";

      pagerZone.innerHTML = ui.pager(res.pagination, "data-page");
      pagerZone.querySelectorAll("[data-page]").forEach((b) => {
        b.addEventListener("click", () => {
          page = Number(b.dataset.page);
          load();
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      });

      bindActions();
    } catch (e) {
      if (e.status === 401) {
        zone.innerHTML = ui.unauthorizedState();
        return;
      }
      zone.innerHTML = ui.errorState(e.message);
      const retry = zone.querySelector("[data-retry]");
      retry && retry.addEventListener("click", load);
    }
  };

  function bindActions() {
    zone.querySelectorAll("[data-add]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const original = btn.textContent;
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
          btn.textContent = original;
        }
      });
    });

    zone.querySelectorAll("[data-fav]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.fav;
        const ok = await ui.confirmModal({
          title: "Remove favorite?",
          message: btn.dataset.name ? btn.dataset.name + " will be removed from your favorites." : "This dish will be removed from your favorites.",
          okLabel: "Remove",
        });
        if (!ok) return;
        try {
          await api.del("/favorites/" + id);
          ui.toast("Removed from favorites");
          load();
        } catch (e) {
          ui.toast(e.message, "error");
        }
      });
    });
  }

  document.getElementById("refresh-btn").addEventListener("click", load);
  load();
})();
