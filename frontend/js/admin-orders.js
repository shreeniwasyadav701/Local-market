/* Local Market — admin orders list */
(function () {
  "use strict";

  const admin = LM.admin;
  const shell = LM.adminShell;
  const ui = LM.ui;

  if (!shell.init({ active: "admin-orders.html", title: "Orders", subtitle: "All customer orders across the store." })) return;

  ui.renderNavbar("admin-orders.html");
  ui.renderFooter();

  const body = document.getElementById("orders-body");
  const pagerZone = document.getElementById("orders-pager");
  const countEl = document.getElementById("orders-count");
  const statusFilter = document.getElementById("status-filter");

  let page = 1;
  let status = "";

  const itemPreview = (o) => {
    const items = o.items || [];
    const preview = items.slice(0, 2).map((i) => i.quantity + " × " + i.name).join(", ");
    return items.length > 2 ? preview + " +" + (items.length - 2) + " more" : preview;
  };

  const row = (o) => {
    const cust = o.user && typeof o.user === "object" ? o.user.name : "—";
    const custSub = o.user && typeof o.user === "object" ? o.user.phone : "";
    return (
      "<tr>" +
      '<td><a class="link cell-title" href="admin-order-detail.html?id=' + encodeURIComponent(o._id) + '">' +
      ui.shortId(o._id) + "</a></td>" +
      "<td>" + shell.esc(cust) + (custSub ? '<div class="cell-sub">' + shell.esc(custSub) + "</div>" : "") + "</td>" +
      '<td class="cell-sub">' + shell.esc(itemPreview(o)) + "</td>" +
      '<td class="cell-title">' + ui.money(o.total) + "</td>" +
      "<td>" + ui.statusBadge(o.paymentMethod) + "</td>" +
      "<td>" + ui.statusBadge(o.status) + "</td>" +
      '<td class="cell-sub">' + ui.formatDate(o.createdAt) + "</td>" +
      '<td class="cell-actions"><a class="btn btn-sm btn-outline" href="admin-order-detail.html?id=' +
      encodeURIComponent(o._id) + '">Open</a></td>' +
      "</tr>"
    );
  };

  const load = async () => {
    body.innerHTML = '<tr><td colspan="8" class="empty-cell">Loading…</td></tr>';
    pagerZone.innerHTML = "";
    try {
      const params = { page: page, limit: 10 };
      if (status) params.status = status;
      const res = await admin.orders(params);
      countEl.textContent = res.totalItems + " order" + (res.totalItems === 1 ? "" : "s");

      if (!res.items.length) {
        body.innerHTML = '<tr><td colspan="8" class="empty-cell">No orders match this filter.</td></tr>';
        return;
      }

      body.innerHTML = res.items.map(row).join("");
      shell.pager(pagerZone, {
        page: res.page,
        totalPages: res.totalPages,
        onPage: (next) => {
          page = next;
          load();
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
      });
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
