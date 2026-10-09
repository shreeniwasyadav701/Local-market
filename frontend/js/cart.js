/* Local Market — cart page (server is the source of truth)
   GET /cart gives cart item ids; GET /checkout gives live prices,
   restaurant names, issues and totals. Both are merged by food id. */
(function () {
  "use strict";
  const api = LM.api;
  const ui = LM.ui;

  ui.renderNavbar("cart.html");
  ui.renderFooter();

  const layout = document.getElementById("cart-layout");
  const zone = document.getElementById("cart-items-zone");
  const summaryZone = document.getElementById("summary-zone");
  const actions = document.getElementById("cart-actions");

  if (!LM.auth.isLoggedIn()) {
    layout.insertAdjacentHTML("beforebegin", ui.unauthorizedState());
    layout.remove();
    actions.remove();
    return;
  }

  const summaryHtml = (d, opts) => {
    opts = opts || {};
    return (
      '<div class="panel summary-panel">' +
      "<h2>Order summary</h2>" +
      '<div class="sum-row"><span>Item total</span><b>' + ui.money(d.subtotal) + "</b></div>" +
      '<div class="sum-row"><span>Delivery fee</span><b>' +
      (Number(d.deliveryCharge) === 0 ? "FREE" : ui.money(d.deliveryCharge)) + "</b></div>" +
      (d.freeDeliveryThreshold
        ? '<div class="small muted">Free delivery over ' + ui.money(d.freeDeliveryThreshold) + "</div>"
        : "") +
      '<div class="sum-row total"><span>Total</span><b>' + ui.money(d.total) + "</b></div>" +
      (opts.issues && opts.issues.length
        ? '<div class="alert alert-warning" role="alert"><b>Heads up:</b><ul>' +
          opts.issues.map((i) => "<li>" + ui.esc(i) + "</li>").join("") +
          "</ul></div>"
        : "") +
      (opts.showCheckout
        ? '<a class="btn btn-primary btn-block" href="checkout.html">Proceed to checkout →</a>'
        : "") +
      '<p class="small muted center">Final prices are confirmed by the server.</p>' +
      "</div>"
    );
  };

  const render = async () => {
    zone.innerHTML = ui.spinnerBlock("Loading your cart...");
    summaryZone.innerHTML = "";
    actions.hidden = true;

    try {
      const [cartRes, coRes] = await Promise.all([api.get("/cart"), api.get("/checkout")]);
      const cartItems = (cartRes.data && cartRes.data.items) || [];
      const co = coRes.data || {};
      const coByFood = new Map();
      (co.items || []).forEach((it) => coByFood.set(String(it.food), it));

      if (!cartItems.length) {
        zone.innerHTML = ui.emptyState({
          icon: "🛒",
          title: "Your cart is empty",
          text: "Add something delicious from a local kitchen.",
          actionHtml: '<a class="btn btn-primary" href="restaurants.html">Browse restaurants</a>',
        });
        summaryZone.innerHTML = "";
        return;
      }

      actions.hidden = false;

      zone.innerHTML =
        '<div class="cart-list">' +
        cartItems
          .map((it) => {
            const live = coByFood.get(String(it.food)) || null;
            const price = live ? live.price : it.price;
            const isAvailable = live ? live.isAvailable : true;
            const restaurant = live ? live.restaurant : null;
            const itemTotal = live ? live.itemTotal : price * it.quantity;
            return (
              '<div class="cart-row" data-item="' + ui.esc(it._id) + '">' +
              '<div class="cart-media">' + ui.imageTag(it.image, it.name, ui.foodEmoji(it.name)) + "</div>" +
              '<div class="cart-info">' +
              '<div class="flex-center" style="gap:6px">' +
              '<b><a href="food.html?id=' + encodeURIComponent(String(it.food)) + '">' + ui.esc(it.name) + "</a></b></div>" +
              (restaurant ? '<div class="small muted">🏪 ' + ui.esc(restaurant.name) + "</div>" : "") +
              '<div class="small muted">₹' + ui.esc(price) + " each</div>" +
              '<div class="qty-stepper sm">' +
              '<button type="button" data-dec aria-label="Decrease quantity">−</button>' +
              "<span>" + ui.esc(it.quantity) + "</span>" +
              '<button type="button" data-inc aria-label="Increase quantity">+</button>' +
              "</div>" +
              '<button class="link danger" data-remove>Remove</button>' +
              "</div>" +
              '<div class="cart-line-total">' +
              ui.money(itemTotal) +
              (isAvailable ? "" : '<div class="badge badge-danger">Unavailable</div>') +
              "</div>" +
              "</div>"
            );
          })
          .join("") +
        "</div>";

      const issues = co.issues || [];
      summaryZone.innerHTML = summaryHtml(co, {
        issues,
        showCheckout: issues.length === 0 && Number(co.total) > 0,
      });

      zone.querySelectorAll(".cart-row").forEach((row) => {
        const itemId = row.dataset.item;
        const it = cartItems.find((x) => String(x._id) === itemId);
        if (!it) return;

        row.querySelector("[data-inc]").addEventListener("click", () => updateQty(itemId, it.quantity + 1));
        row.querySelector("[data-dec]").addEventListener("click", () => {
          if (it.quantity <= 1) removeItem(itemId);
          else updateQty(itemId, it.quantity - 1);
        });
        row.querySelector("[data-remove]").addEventListener("click", async () => {
          const ok = await ui.confirmModal({
            title: "Remove item?",
            message: it.name + " will be removed from your cart.",
            okLabel: "Remove",
          });
          if (ok) removeItem(itemId);
        });
      });
    } catch (e) {
      if (e.status === 401) {
        window.location.href = "login.html?redirect=" + encodeURIComponent("cart.html");
        return;
      }
      zone.innerHTML = ui.errorState(e.message);
      const retry = zone.querySelector("[data-retry]");
      retry && retry.addEventListener("click", render);
    }
  };

  const updateQty = async (itemId, qty) => {
    try {
      await api.put("/cart/" + encodeURIComponent(itemId), { quantity: qty });
      ui.refreshCartBadge();
      render();
    } catch (e) {
      ui.toast(e.message, "error");
      render();
    }
  };

  const removeItem = async (itemId) => {
    try {
      await api.del("/cart/" + encodeURIComponent(itemId));
      ui.toast("Item removed");
      ui.refreshCartBadge();
      render();
    } catch (e) {
      ui.toast(e.message, "error");
    }
  };

  document.getElementById("clear-cart").addEventListener("click", async () => {
    const ok = await ui.confirmModal({
      title: "Clear the whole cart?",
      message: "All items will be removed. This cannot be undone.",
      okLabel: "Clear cart",
    });
    if (!ok) return;
    try {
      await api.del("/cart");
      ui.toast("Cart cleared");
      ui.refreshCartBadge();
      render();
    } catch (e) {
      ui.toast(e.message, "error");
    }
  });

  render();
})();
