/* Local Market — food detail page */
(function () {
  "use strict";
  const api = LM.api;
  const ui = LM.ui;

  ui.renderNavbar("search.html");
  ui.renderFooter();

  const zone = document.getElementById("food-detail");
  const foodId = ui.getParam("id");
  let qty = 1;
  let isFav = false;

  const showNotFound = () => {
    zone.innerHTML = ui.emptyState({
      icon: "🍲",
      title: "Dish not found",
      text: "It may be unavailable right now, or the link is wrong.",
      actionHtml:
        '<a class="btn btn-primary" href="restaurants.html">Browse restaurants</a> ' +
        '<a class="btn btn-outline" href="search.html">Search dishes</a>',
    });
  };

  const render = (food) => {
    const rest = food.restaurant && typeof food.restaurant === "object" ? food.restaurant : null;
    const unavailable = food.isAvailable === false || (rest && rest.isOpen === false);
    const catEmoji = ui.foodEmoji(food.name);

    zone.innerHTML =
      '<nav class="crumbs" aria-label="Breadcrumb">' +
      '<a href="restaurants.html">Restaurants</a> <span>›</span> ' +
      (rest ? '<a href="restaurant.html?id=' + encodeURIComponent(rest._id) + '">' + ui.esc(rest.name) + "</a> <span>›</span> " : "") +
      "<span aria-current=\"page\">" + ui.esc(food.name) + "</span></nav>" +

      '<div class="food-detail-grid">' +
      '<div class="food-detail-media card-media">' + ui.imageTag(food.image, food.name, catEmoji) + "</div>" +

      '<div class="food-detail-info">' +
      '<div class="flex-center" style="gap:8px;flex-wrap:wrap">' +
      ui.vegMark(food.isVeg) +
      '<span class="badge">' + ui.esc(food.category || "Item") + "</span>" +
      (unavailable ? '<span class="badge badge-danger">Unavailable</span>' : '<span class="badge badge-success">In stock</span>') +
      "</div>" +

      '<h1>' + ui.esc(food.name) + "</h1>" +
      '<p class="muted">' + ui.esc(food.description || "A delicious pick from your local kitchen.") + "</p>" +

      '<div class="price-lg"><span class="cur">₹</span>' + ui.esc(food.price) + "</div>" +

      (rest
        ? '<div class="rest-line">' +
          '<span class="avatar sm" aria-hidden="true">🏪</span>' +
          '<div><b><a href="restaurant.html?id=' + encodeURIComponent(rest._id) + '">' + ui.esc(rest.name) + "</a></b>" +
          '<div class="small muted">' + ui.esc(rest.address || "") +
          (rest.deliveryTime ? " · 🛵 " + ui.esc(rest.deliveryTime) : "") +
          (rest.rating ? " · ★ " + ui.esc(rest.rating) : "") +
          "</div></div></div>"
        : "") +

      (unavailable
        ? '<p class="alert alert-danger" role="status">This dish is not available for ordering right now.</p>'
        : '<div class="buy-row">' +
          '<div class="qty-stepper" role="group" aria-label="Quantity">' +
          '<button type="button" id="qty-minus" aria-label="Decrease quantity">−</button>' +
          '<span id="qty-val" aria-live="polite">1</span>' +
          '<button type="button" id="qty-plus" aria-label="Increase quantity">+</button>' +
          "</div>" +
          '<button class="btn btn-primary" id="add-btn">Add to cart · <span id="add-total">' + ui.money(food.price) + "</span></button>" +
          '<button class="btn btn-outline" id="fav-btn" aria-pressed="' + (isFav ? "true" : "false") + '">' +
          (isFav ? "♥ Saved" : "♡ Save") + "</button>" +
          "</div>") +

      "</div></div>";

    if (!unavailable) {
      const valEl = document.getElementById("qty-val");
      const totalEl = document.getElementById("add-total");
      const sync = () => {
        valEl.textContent = String(qty);
        totalEl.textContent = ui.money(food.price * qty);
      };
      document.getElementById("qty-minus").addEventListener("click", () => {
        if (qty > 1) qty--;
        sync();
      });
      document.getElementById("qty-plus").addEventListener("click", () => {
        if (qty < 20) qty++;
        sync();
      });

      document.getElementById("add-btn").addEventListener("click", async (e) => {
        if (!LM.auth.isLoggedIn()) {
          ui.toast("Please login to add items", "warning");
          window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.pathname + window.location.search);
          return;
        }
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await api.post("/cart", { foodId: food._id, quantity: qty });
          ui.toast("Added " + qty + " × " + food.name + " to cart", "success");
          ui.refreshCartBadge();
        } catch (err) {
          ui.toast(err.message, "error");
        } finally {
          btn.disabled = false;
        }
      });

      const favBtn = document.getElementById("fav-btn");
      favBtn.addEventListener("click", async () => {
        if (!LM.auth.isLoggedIn()) {
          ui.toast("Please login to save favorites", "warning");
          window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.pathname + window.location.search);
          return;
        }
        try {
          if (isFav) {
            await api.del("/favorites/" + food._id);
            isFav = false;
            ui.toast("Removed from favorites");
          } else {
            await api.post("/favorites/" + food._id);
            isFav = true;
            ui.toast("Added to favorites", "success");
          }
          favBtn.textContent = isFav ? "♥ Saved" : "♡ Save";
          favBtn.setAttribute("aria-pressed", String(isFav));
        } catch (e2) {
          if (e2.status === 409) {
            isFav = true;
            favBtn.textContent = "♥ Saved";
            favBtn.setAttribute("aria-pressed", "true");
          } else {
            ui.toast(e2.message, "error");
          }
        }
      });
    }
  };

  async function init() {
    if (!foodId) {
      showNotFound();
      return;
    }
    zone.innerHTML = ui.skeletonGrid(1, "food");
    try {
      const res = await api.get("/foods/" + encodeURIComponent(foodId));
      const food = res.data;
      document.title = food.name + " — Local Market";
      if (LM.auth.isLoggedIn()) {
        try {
          const favRes = await api.get("/favorites?limit=50");
          isFav = (favRes.data || []).some((f) => f.food._id === food._id);
        } catch (e) {
          /* ignore */
        }
      }
      render(food);
    } catch (e) {
      if (e.status === 404 || e.status === 403) {
        showNotFound();
      } else {
        zone.innerHTML = ui.errorState(e.message);
        const retry = zone.querySelector("[data-retry]");
        retry && retry.addEventListener("click", init);
      }
    }
  }

  init();
})();
