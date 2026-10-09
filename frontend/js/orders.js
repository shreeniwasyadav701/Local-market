/* Local Market — order history */
(function () {
  "use strict";
  const api = LM.api;
  const ui = LM.ui;

  ui.renderNavbar("orders.html");
  ui.renderFooter();

  const zone = document.getElementById("orders-zone");
  const pagerZone = document.getElementById("orders-pager");
  const countEl = document.getElementById("order-count");

  if (!LM.auth.isLoggedIn()) {
    zone.innerHTML = ui.unauthorizedState();
    document.querySelector(".page-actions").hidden = true;
    return;
  }

  let page = 1;

  const paymentBadge = (o) => {
    if (o.paymentStatus === "paid") return ui.statusBadge("paid");
    if (o.status === "cancelled") return '<span class="badge">No charge</span>';
    if (o.paymentMethod === "cod") return ui.statusBadge("pending");
    return '<span class="badge badge-danger">Unpaid</span>';
  };

  const load = async () => {
    zone.innerHTML = ui.skeletonGrid(5);
    pagerZone.innerHTML = "";
    try {
      const res = await api.get("/orders?page=" + page + "&limit=5");
      const orders = res.data || [];
      countEl.textContent = res.total + " order" + (res.total === 1 ? "" : "s") + " so far";

      if (!orders.length) {
        zone.innerHTML = ui.emptyState({
          icon: "📦",
          title: "No orders yet",
          text: "When you place your first order it will show up here.",
          actionHtml: '<a class="btn btn-primary" href="restaurants.html">Start ordering</a>',
        });
        return;
      }

      zone.innerHTML = '<div class="order-list">' + orders.map(card).join("") + "</div>";

      pagerZone.innerHTML = ui.pager({ page: res.page, totalPages: res.pages }, "data-page");
      pagerZone.querySelectorAll("[data-page]").forEach((b) => {
        b.addEventListener("click", () => {
          page = Number(b.dataset.page);
          load();
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      });

      bind(orders);
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

  const card = (o) => {
    const items = o.items || [];
    const preview = items
      .slice(0, 3)
      .map((i) => i.quantity + " × " + i.name)
      .join(", ");
    const more = items.length > 3 ? " +" + (items.length - 3) + " more" : "";
    const id = String(o._id);
    const canCancel = ["placed", "confirmed"].includes(o.status);
    const needsPay = o.paymentStatus !== "paid" && o.status !== "cancelled" && o.paymentMethod !== "cod";

    return (
      '<article class="card order-card" data-id="' + ui.esc(id) + '">' +
      '<div class="card-body">' +
      '<div class="order-head">' +
      "<div><b>" + ui.shortId(id) + "</b>" +
      '<div class="small muted">' + ui.formatDate(o.createdAt) + "</div></div>" +
      '<div class="flex-center" style="gap:6px;flex-wrap:wrap">' +
      ui.statusBadge(o.status) + paymentBadge(o) +
      ui.statusBadge(o.paymentMethod) +
      "</div></div>" +
      '<p class="muted small">' + ui.esc(preview + more) + "</p>" +
      '<div class="order-foot"><b class="price">' + ui.money(o.total) + "</b>" +
      '<div class="order-actions">' +
      '<a class="btn btn-sm btn-outline" href="order.html?id=' + encodeURIComponent(id) + '">' +
      (o.status === "delivered" ? "Details" : "Track") + "</a>" +
      (needsPay ? '<a class="btn btn-sm btn-accent" href="order.html?id=' + encodeURIComponent(id) + '&pay=1">Complete payment</a>' : "") +
      (canCancel ? '<button class="btn btn-sm btn-danger" data-cancel>Cancel</button>' : "") +
      "</div></div></div></article>"
    );
  };

  const bind = (orders) => {
    zone.querySelectorAll("[data-cancel]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const row = btn.closest("[data-id]");
        const o = orders.find((x) => String(x._id) === row.dataset.id);
        const ok = await ui.confirmModal({
          title: "Cancel this order?",
          message: "Order " + ui.shortId(o._id) + " (" + ui.money(o.total) + ") will be cancelled.",
          okLabel: "Cancel order",
        });
        if (!ok) return;
        btn.disabled = true;
        try {
          await api.put("/orders/" + o._id + "/cancel");
          ui.toast("Order cancelled");
          load();
        } catch (e) {
          ui.toast(e.message, "error");
          btn.disabled = false;
        }
      });
    });
  };

  document.getElementById("refresh-btn").addEventListener("click", load);
  load();
})();
