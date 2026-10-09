/* Local Market — admin order detail + status workflow */
(function () {
  "use strict";

  const admin = LM.admin;
  const shell = LM.adminShell;
  const ui = LM.ui;

  if (!shell.init({ active: "admin-orders.html", title: "Order", subtitle: "Review and update this order." })) return;

  ui.renderNavbar("admin-orders.html");
  ui.renderFooter();

  const zone = document.getElementById("detail-zone");
  const crumb = document.getElementById("crumb-id");
  const orderId = ui.getParam("id");

  if (!orderId) {
    zone.innerHTML = '<div class="panel"><div class="panel-body">No order id provided.</div></div>';
    return;
  }

  crumb.textContent = ui.shortId(orderId);

  const addr = (o) => {
    const d = o.deliveryAddress && typeof o.deliveryAddress === "object" ? o.deliveryAddress : null;
    if (!d) return o.address || "—";
    const line = [d.houseNumber, d.street, d.area, d.city, d.state, d.pincode].filter(Boolean).join(", ");
    return (d.fullName ? d.fullName + " — " : "") + (line || o.address || "—");
  };

  const statusControls = (o) => {
    const next = admin.NEXT_STATUS[o.status] || [];
    const cancelAllowed = admin.CAN_CANCEL.includes(o.status);
    if (!next.length) {
      return '<p class="muted small">This order is ' + shell.esc(o.status) + " — no further status changes.</p>";
    }
    const btns = next
      .map((s) => {
        const danger = s === "cancelled";
        return (
          '<button class="btn btn-sm ' + (danger ? "btn-danger" : "btn-primary") +
          '" data-status="' + shell.esc(s) + '">' +
          (danger ? "Cancel order" : "Mark " + s.replace(/_/g, " ")) +
          "</button>"
        );
      })
      .join("");
    return '<div class="toolbar">' + btns + "</div>";
  };

  const historyRows = (o) => {
    const h = o.statusHistory || [];
    if (!h.length) return '<p class="muted small">No history yet.</p>';
    return h
      .map(
        (s) =>
          '<div class="kv-row"><span class="k">' + ui.formatDate(s.createdAt || s.at) +
          '</span><span class="v">' + ui.statusBadge(s.status) + "</span></div>"
      )
      .join("");
  };

  const render = (o) => {
    document.getElementById("admin-title").textContent = "Order " + ui.shortId(o._id);
    const cust = o.user && typeof o.user === "object" ? o.user : {};
    const items = o.items || [];

    zone.innerHTML =
      '<div class="detail-grid">' +
      '<div>' +
      '<div class="panel"><div class="panel-head"><h2>Items</h2>' +
      ui.statusBadge(o.status) + "</div>" +
      '<div class="panel-body">' +
      items
        .map(
          (i) =>
            '<div class="item-row"><div class="item-thumb">' +
            ui.imageTag(i.image, i.name, ui.foodEmoji(i.name)) +
            '</div><div class="item-main"><div class="i-name">' + shell.esc(i.name) + "</div>" +
            '<div class="i-sub">' + shell.esc(i.quantity) + " × " + ui.money(i.price) + "</div></div>" +
            '<div class="cell-title">' + ui.money(i.itemSubtotal != null ? i.itemSubtotal : i.price * i.quantity) + "</div></div>"
        )
        .join("") +
      "</div></div>" +
      '<div class="panel"><div class="panel-head"><h2>Update status</h2></div>' +
      '<div class="panel-body" id="status-controls">' + statusControls(o) + "</div></div>" +
      "</div>" +
      '<div>' +
      '<div class="panel"><div class="panel-head"><h2>Summary</h2></div><div class="panel-body">' +
      '<div class="kv-list">' +
      '<div class="kv-row"><span class="k">Subtotal</span><span class="v">' + ui.money(o.subtotal) + "</span></div>" +
      '<div class="kv-row"><span class="k">Delivery</span><span class="v">' + ui.money(o.deliveryCharge) + "</span></div>" +
      '<div class="kv-row"><span class="k">Total</span><span class="v">' + ui.money(o.total) + "</span></div>" +
      '<div class="kv-row"><span class="k">Method</span><span class="v">' + ui.statusBadge(o.paymentMethod) + "</span></div>" +
      '<div class="kv-row"><span class="k">Paid</span><span class="v">' + ui.statusBadge(o.paymentStatus || "pending") + "</span></div>" +
      "</div></div></div>" +
      '<div class="panel"><div class="panel-head"><h2>Customer</h2></div><div class="panel-body">' +
      '<div class="kv-list">' +
      '<div class="kv-row"><span class="k">Name</span><span class="v">' + shell.esc(cust.name || o.customerName || "—") + "</span></div>" +
      '<div class="kv-row"><span class="k">Phone</span><span class="v">' + shell.esc(cust.phone || o.phone || "—") + "</span></div>" +
      '<div class="kv-row"><span class="k">Email</span><span class="v">' + shell.esc(cust.email || "—") + "</span></div>" +
      "</div>" +
      '<p class="muted small" style="margin-top:10px">' + shell.esc(addr(o)) + "</p>" +
      "</div></div>" +
      '<div class="panel"><div class="panel-head"><h2>Status history</h2></div><div class="panel-body">' +
      historyRows(o) +
      "</div></div>" +
      "</div></div>";

    bind(o);
  };

  const bind = (o) => {
    zone.querySelectorAll("[data-status]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const target = btn.dataset.status;
        const ok = await ui.confirmModal({
          title: "Update order status?",
          message: "Order " + ui.shortId(o._id) + " will move to \"" + target.replace(/_/g, " ") + "\".",
          okLabel: "Update status",
          danger: target === "cancelled",
        });
        if (!ok) return;
        btn.disabled = true;
        try {
          await admin.setOrderStatus(o._id, target);
          ui.toast("Status updated");
          load();
        } catch (e) {
          ui.toast(e.message, "error");
          btn.disabled = false;
        }
      });
    });
  };

  const load = async () => {
    zone.innerHTML = '<div class="panel"><div class="panel-body">' + ui.spinnerBlock("Loading order…") + "</div></div>";
    try {
      const o = await admin.order(orderId);
      render(o);
    } catch (e) {
      zone.innerHTML = ui.errorState(e.message);
      const retry = zone.querySelector("[data-retry]");
      retry && retry.addEventListener("click", load);
    }
  };

  document.getElementById("refresh-btn").addEventListener("click", load);
  load();
})();
