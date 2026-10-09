/* Local Market — admin overview page */
(function () {
  "use strict";

  const admin = LM.admin;
  const shell = LM.adminShell;
  const ui = LM.ui;

  if (!shell.init({ active: "admin.html", title: "Overview", subtitle: "Store activity at a glance." })) return;

  ui.renderNavbar("admin.html");
  ui.renderFooter();

  const statsZone = document.getElementById("stats-zone");
  const recentBody = document.getElementById("recent-orders");
  const restBody = document.getElementById("rest-alerts");

  const statCard = (label, value) =>
    '<div class="stat-card"><div class="s-label">' + shell.esc(label) +
    '</div><div class="s-value">' + shell.esc(value) + "</div></div>";

  const orderRow = (o) => {
    const cust = o.user && typeof o.user === "object" ? o.user.name : "—";
    return (
      "<tr>" +
      '<td><a class="link" href="admin-order-detail.html?id=' + encodeURIComponent(o._id) + '">' +
      ui.shortId(o._id) + "</a></td>" +
      "<td>" + shell.esc(cust) + "</td>" +
      '<td class="cell-title">' + ui.money(o.total) + "</td>" +
      "<td>" + ui.statusBadge(o.status) + "</td>" +
      '<td class="cell-sub">' + ui.formatDate(o.createdAt) + "</td>" +
      "</tr>"
    );
  };

  const restRow = (r) => {
    const cuisine = Array.isArray(r.cuisine) ? r.cuisine.join(", ") : r.cuisine || "";
    return (
      "<tr>" +
      '<td class="cell-title">' + shell.esc(r.name) + "</td>" +
      '<td class="cell-sub">' + shell.esc(cuisine) + "</td>" +
      "<td>" + (r.isActive ? ui.statusBadge("paid").replace("Paid", "Active") : ui.statusBadge("cancelled").replace("Cancelled", "Inactive")) + "</td>" +
      '<td class="cell-actions"><a class="btn btn-sm btn-outline" href="admin-restaurants.html?id=' +
      encodeURIComponent(r._id) + '">Open</a></td>' +
      "</tr>"
    );
  };

  const load = async () => {
    statsZone.innerHTML =
      '<div class="stat-grid">' +
      statCard("Orders", "…") + statCard("Restaurants", "…") +
      statCard("Foods", "…") + statCard("Payments", "…") +
      "</div>";

    try {
      const [stats, orders, rests] = await Promise.all([
        admin.stats(),
        admin.orders({ limit: 6 }),
        admin.restaurants({ limit: 12 }),
      ]);

      statsZone.innerHTML =
        '<div class="stat-grid">' +
        statCard("Orders", stats.orders) +
        statCard("Restaurants", stats.restaurants) +
        statCard("Foods", stats.foods) +
        statCard("Payments", stats.payments) +
        "</div>";

      const recent = orders.items.slice(0, 6);
      recentBody.innerHTML = recent.length
        ? recent.map(orderRow).join("")
        : '<tr><td colspan="5" class="empty-cell">No orders yet.</td></tr>';

      const inactive = rests.items.filter((r) => r.isActive === false);
      const list = (inactive.length ? inactive : rests.items).slice(0, 6);
      restBody.innerHTML = list.length
        ? list.map(restRow).join("")
        : '<tr><td colspan="4" class="empty-cell">No restaurants yet.</td></tr>';
    } catch (e) {
      statsZone.innerHTML = "";
      ui.toast(e.message, "error");
      recentBody.innerHTML = '<tr><td colspan="5" class="empty-cell">' + shell.esc(e.message) + "</td></tr>";
      restBody.innerHTML = '<tr><td colspan="4" class="empty-cell">—</td></tr>';
    }
  };

  document.getElementById("refresh-btn").addEventListener("click", load);
  load();
})();
