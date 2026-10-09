/* Local Market — admin payments list + refund */
(function () {
  "use strict";

  const admin = LM.admin;
  const shell = LM.adminShell;
  const ui = LM.ui;

  if (!shell.init({ active: "admin-payments.html", title: "Payments", subtitle: "Mock payment records and refunds." })) return;

  ui.renderNavbar("admin-payments.html");
  ui.renderFooter();

  const body = document.getElementById("pay-body");
  const pagerZone = document.getElementById("pay-pager");
  const countEl = document.getElementById("pay-count");
  const statusFilter = document.getElementById("status-filter");

  let page = 1;
  let status = "";

  const row = (p) => {
    const cust = p.customer && typeof p.customer === "object" ? p.customer.name : "—";
    const canRefund = p.paymentStatus === "SUCCESS";
    return (
      "<tr>" +
      '<td class="cell-title">' + shell.esc(p.paymentId ? ui.shortId(p.paymentId) : "—") +
      (p.transactionId ? '<div class="cell-sub">' + shell.esc(p.transactionId) + "</div>" : "") + "</td>" +
      '<td><a class="link" href="admin-order-detail.html?id=' + encodeURIComponent(p.orderId) + '">' + ui.shortId(p.orderId) + "</a></td>" +
      '<td class="cell-sub">' + shell.esc(cust) + "</td>" +
      '<td class="cell-title">' + ui.money(p.amount) + "</td>" +
      "<td>" + ui.statusBadge(p.paymentMethod) + "</td>" +
      "<td>" + ui.statusBadge(p.paymentStatus) + "</td>" +
      '<td class="cell-sub">' + ui.formatDate(p.createdAt) + "</td>" +
      '<td class="cell-actions">' +
      (canRefund
        ? '<button class="btn btn-sm btn-danger" data-refund="' + shell.esc(p.paymentId) + '">Refund</button>'
        : "") +
      "</td></tr>"
    );
  };

  const bind = () => {
    body.querySelectorAll("[data-refund]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ok = await ui.confirmModal({
          title: "Refund this payment?",
          message: "This marks the payment as refunded. This cannot be undone.",
          okLabel: "Refund",
        });
        if (!ok) return;
        btn.disabled = true;
        try {
          await admin.refund(btn.dataset.refund);
          ui.toast("Payment refunded");
          load();
        } catch (e) {
          ui.toast(e.message, "error");
          btn.disabled = false;
        }
      });
    });
  };

  const load = async () => {
    body.innerHTML = '<tr><td colspan="8" class="empty-cell">Loading…</td></tr>';
    pagerZone.innerHTML = "";
    try {
      const params = { page: page, limit: 12 };
      if (status) params.status = status;
      const res = await admin.payments(params);
      countEl.textContent = res.totalItems + " payment" + (res.totalItems === 1 ? "" : "s");
      if (!res.items.length) {
        body.innerHTML = '<tr><td colspan="8" class="empty-cell">No payments match this filter.</td></tr>';
        return;
      }
      body.innerHTML = res.items.map(row).join("");
      shell.pager(pagerZone, {
        page: res.page,
        totalPages: res.totalPages,
        onPage: (next) => { page = next; load(); window.scrollTo({ top: 0, behavior: "smooth" }); },
      });
      bind();
    } catch (e) {
      body.innerHTML = '<tr><td colspan="8" class="empty-cell">' + shell.esc(e.message) + "</td></tr>";
    }
  };

  statusFilter.addEventListener("change", () => {
    status = statusFilter.value;
    page = 1;
    load();
  });

  document.getElementById("refresh-btn").addEventListener("click", load);
  load();
})();
