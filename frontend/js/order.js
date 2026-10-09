/* Local Market — order detail + visual status tracker + payment completion */
(function () {
  "use strict";
  const api = LM.api;
  const ui = LM.ui;

  ui.renderNavbar("orders.html");
  ui.renderFooter();

  const zone = document.getElementById("order-zone");
  const sub = document.getElementById("order-sub");
  const orderId = ui.getParam("id");
  const wantPay = ui.getParam("pay") === "1";

  if (!LM.auth.isLoggedIn()) {
    zone.innerHTML = ui.unauthorizedState();
    return;
  }

  let order = null;
  let payment = null;

  const stepIndex = (status) => ui.ORDER_STEPS.findIndex((s) => s.key === status);

  const trackerHtml = (o) => {
    if (o.status === "cancelled") {
      return (
        '<div class="panel tracker cancelled"><div class="cancel-banner">' +
        '<span aria-hidden="true">❌</span><div><b>Order cancelled</b>' +
        '<div class="small">This order was cancelled. Nothing more to track.</div></div></div>' +
        timeline(o) +
        "</div>"
      );
    }

    const cur = stepIndex(o.status);
    const reached = o.status === "delivered" ? ui.ORDER_STEPS.length - 1 : Math.max(cur, 0);
    const steps = ui.ORDER_STEPS.map((s, i) => {
      const state = i < reached ? "done" : i === reached ? "current" : "todo";
      return (
        '<li class="step ' + state + '" aria-current="' + (state === "current" ? "step" : "false") + '">' +
        '<span class="step-icon" aria-hidden="true">' + (state === "done" ? "✓" : s.icon) + "</span>" +
        '<span class="step-label"><b>' + s.label + "</b>" +
        (state === "current" ? '<span class="step-note">' + s.note + "</span>" : "") +
        "</span></li>"
      );
    }).join("");

    return (
      '<div class="panel tracker"><h2>Live status</h2>' +
      '<ol class="steps" aria-label="Order progress">' + steps + "</ol>" +
      timeline(o) +
      "</div>"
    );
  };

  const timeline = (o) => {
    const hist = o.statusHistory || [];
    if (!hist.length) return "";
    return (
      '<div class="timeline"><h3>Status history</h3><ul>' +
      hist
        .map(
          (h) =>
            "<li><b>" + ui.esc(String(h.status).replace(/_/g, " ")) + "</b>" +
            '<span class="small muted">' + ui.formatDate(h.updatedAt || h.createdAt) + "</span></li>"
        )
        .join("") +
      "</ul></div>"
    );
  };

  const paymentHtml = (o) => {
    const paid = o.paymentStatus === "paid";
    if (paid && payment) {
      return (
        '<div class="panel"><h2>Payment</h2>' +
        '<div class="flex-center" style="gap:8px;flex-wrap:wrap">' +
        ui.statusBadge("success") + ui.statusBadge(payment.paymentMethod || o.paymentMethod) +
        "</div>" +
        (payment.transactionId ? '<p class="small muted">Txn: <code>' + ui.esc(payment.transactionId) + "</code></p>" : "") +
        '<p class="small muted">Amount: ' + ui.money(payment.amount || o.total) + "</p></div>"
      );
    }
    if (o.status === "cancelled") {
      return '<div class="panel"><h2>Payment</h2><p class="muted">Order cancelled — nothing to pay.</p></div>';
    }
    const failed = !!(payment && payment.status === "FAILED");
    const needsGateway = failed || wantPay || (o.paymentStatus !== "paid" && o.paymentMethod !== "cod");
    if (!needsGateway) {
      return (
        '<div class="panel"><h2>Payment</h2>' +
        '<div class="flex-center" style="gap:8px">' + ui.statusBadge("pending") + ui.statusBadge("cod") + "</div>" +
        '<p class="small muted">Pay in cash when your food arrives.</p></div>'
      );
    }

    return (
      '<div class="panel" id="pay-panel"><h2>Payment</h2>' +
      '<div class="flex-center" style="gap:8px;flex-wrap:wrap">' +
      (failed ? ui.statusBadge("failed") : '<span class="badge badge-danger">Unpaid</span>') +
      ui.statusBadge(o.paymentMethod === "upi" ? "mock_upi" : "mock_card") +
      "</div>" +
      (failed ? '<p class="small muted">Last attempt was declined by the mock gateway.</p>' : "") +
      '<div class="pay-grid" role="radiogroup" aria-label="Payment method">' +
      '<label class="radio-card"><input type="radio" name="payMethod" value="MOCK_UPI"' +
      (o.paymentMethod === "upi" ? " checked" : "") +
      '><span class="rc-body"><b>📱 UPI (mock)</b></span></label>' +
      '<label class="radio-card"><input type="radio" name="payMethod" value="MOCK_CARD"' +
      (o.paymentMethod !== "upi" ? " checked" : "") +
      '><span class="rc-body"><b>💳 Card (mock)</b></span></label></div>' +
      '<button class="btn btn-primary btn-block" id="pay-now">Pay ' + ui.money(o.total) + ' now</button>' +
      '<p class="small muted">Simulated gateway — no real money or card details involved.</p></div>'
    );
  };

  const itemsHtml = (o) => {
    const items = o.items || [];
    return (
      '<div class="panel"><h2>Items</h2><div class="mini-items">' +
      items
        .map(
          (i) =>
            '<div class="mini-item"><span>' + ui.esc(i.quantity) + " × " + ui.esc(i.name) +
            (i.restaurant ? ' <span class="muted">· ' + ui.esc(i.restaurant.name) + "</span>" : "") +
            '</span><b>' + ui.money(i.price * i.quantity) + "</b></div>"
        )
        .join("") +
      "</div>" +
      '<div class="sum-row"><span>Subtotal</span><b>' + ui.money(o.subtotal) + "</b></div>" +
      '<div class="sum-row"><span>Delivery</span><b>' +
      (Number(o.deliveryCharge) === 0 ? "FREE" : ui.money(o.deliveryCharge)) + "</b></div>" +
      '<div class="sum-row total"><span>Total</span><b>' + ui.money(o.total) + "</b></div></div>"
    );
  };

  const render = () => {
    const o = order;
    const canCancel = ["placed", "confirmed"].includes(o.status);
    const id = String(o._id);
    sub.textContent = "Order " + ui.shortId(id) + " · placed " + ui.formatDate(o.createdAt);

    zone.innerHTML =
      '<div class="order-detail-grid">' +
      '<div class="order-main-col">' +
      '<div class="panel status-panel"><div class="flex-center" style="gap:8px;flex-wrap:wrap">' +
      ui.statusBadge(o.status) + ui.statusBadge(o.paymentStatus) +
      (canCancel ? '<button class="btn btn-sm btn-danger" id="cancel-btn">Cancel order</button>' : "") +
      "</div>" +
      (o.address ? '<p class="small muted">Deliver to: ' + ui.esc(o.address) + "</p>" : "") +
      "</div>" +
      trackerHtml(o) +
      itemsHtml(o) +
      "</div>" +
      '<aside class="order-side-col">' + paymentHtml(o) +
      '<div class="panel"><h2>Summary</h2>' +
      '<div class="sum-row"><span>Order id</span><b>' + ui.shortId(id) + "</b></div>" +
      '<div class="sum-row"><span>Placed</span><b>' + ui.formatDate(o.createdAt) + "</b></div>" +
      '<div class="sum-row total"><span>Total</span><b>' + ui.money(o.total) + "</b></div>" +
      '<a class="btn btn-outline btn-block" href="restaurants.html">Order again</a>' +
      "</div></aside></div>";

    const cancelBtn = document.getElementById("cancel-btn");
    cancelBtn &&
      cancelBtn.addEventListener("click", async () => {
        const ok = await ui.confirmModal({
          title: "Cancel this order?",
          message: "Order " + ui.shortId(id) + " (" + ui.money(o.total) + ") will be cancelled.",
          okLabel: "Cancel order",
        });
        if (!ok) return;
        cancelBtn.disabled = true;
        try {
          await api.put("/orders/" + id + "/cancel");
          ui.toast("Order cancelled");
          init();
        } catch (e) {
          ui.toast(e.message, "error");
          cancelBtn.disabled = false;
        }
      });

    const payNow = document.getElementById("pay-now");
    payNow &&
      payNow.addEventListener("click", async () => {
        const methodEl = document.querySelector('input[name="payMethod"]:checked');
        payNow.disabled = true;
        payNow.textContent = "Processing...";
        try {
          const res = await api.post("/payments/mock", {
            orderId: id,
            paymentMethod: methodEl ? methodEl.value : "MOCK_UPI",
          });
          if (res.payment.status === "FAILED") {
            ui.toast("Payment declined by mock gateway", "error");
          } else {
            ui.toast("Payment successful", "success");
          }
          init();
        } catch (e) {
          ui.toast(e.message, "error");
          payNow.disabled = false;
          payNow.textContent = "Pay now";
        }
      });

    if (wantPay) {
      const panel = document.getElementById("pay-panel");
      panel && panel.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  async function init() {
    if (!orderId) {
      zone.innerHTML = ui.emptyState({
        icon: "📦",
        title: "Order not found",
        text: "No order was selected.",
        actionHtml: '<a class="btn btn-primary" href="orders.html">My orders</a>',
      });
      return;
    }
    zone.innerHTML = ui.spinnerBlock("Loading order...");
    try {
      const [orderRes, payRes] = await Promise.all([
        api.get("/orders/" + encodeURIComponent(orderId)),
        api.get("/payments/order/" + encodeURIComponent(orderId)).catch((e) => {
          if (e.status === 404) return null;
          throw e;
        }),
      ]);
      order = orderRes.data;
      payment = payRes ? payRes.data : null;
      document.title = "Order " + ui.shortId(String(order._id)) + " — Local Market";
      render();
    } catch (e) {
      if (e.status === 404) {
        zone.innerHTML = ui.emptyState({
          icon: "📦",
          title: "Order not found",
          text: "This order does not exist or belongs to another account.",
          actionHtml: '<a class="btn btn-primary" href="orders.html">My orders</a>',
        });
      } else if (e.status === 401) {
        zone.innerHTML = ui.unauthorizedState();
      } else {
        zone.innerHTML = ui.errorState(e.message);
        const retry = zone.querySelector("[data-retry]");
        retry && retry.addEventListener("click", init);
      }
    }
  }

  init();
})();
