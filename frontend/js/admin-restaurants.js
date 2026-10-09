/* Local Market — admin restaurants list + create/edit/remove */
(function () {
  "use strict";

  const admin = LM.admin;
  const shell = LM.adminShell;
  const ui = LM.ui;

  if (!shell.init({ active: "admin-restaurants.html", title: "Restaurants", subtitle: "Create, edit and manage partner restaurants." })) return;

  ui.renderNavbar("admin-restaurants.html");
  ui.renderFooter();

  const body = document.getElementById("rest-body");
  const pagerZone = document.getElementById("rest-pager");
  const countEl = document.getElementById("rest-count");
  const searchInput = document.getElementById("search-input");

  let page = 1;
  let search = "";

  const row = (r) => {
    const cuisine = Array.isArray(r.cuisine) ? r.cuisine.join(", ") : r.cuisine || "";
    return (
      "<tr>" +
      '<td class="cell-title">' + shell.esc(r.name) +
      '<div class="cell-sub">' + shell.esc(r.address || "") + "</div></td>" +
      '<td class="cell-sub">' + shell.esc(cuisine || "—") + "</td>" +
      "<td>" + shell.esc(r.deliveryTime || "—") + " min</td>" +
      "<td>" + (r.deliveryFee === 0 ? "Free" : ui.money(r.deliveryFee)) + "</td>" +
      "<td>" + (r.isActive ? ui.statusBadge("paid").replace("Paid", "Active") : ui.statusBadge("cancelled").replace("Cancelled", "Inactive")) + "</td>" +
      '<td class="cell-actions">' +
      '<a class="btn btn-sm btn-outline" href="admin-restaurants.html?id=' + encodeURIComponent(r._id) + '">Open</a>' +
      "</td></tr>"
    );
  };

  const load = async () => {
    body.innerHTML = '<tr><td colspan="6" class="empty-cell">Loading…</td></tr>';
    pagerZone.innerHTML = "";
    try {
      const params = { page: page, limit: 10 };
      if (search) params.search = search;
      const res = await admin.restaurants(params);
      countEl.textContent = res.totalItems + " restaurant" + (res.totalItems === 1 ? "" : "s");
      if (!res.items.length) {
        body.innerHTML = '<tr><td colspan="6" class="empty-cell">No restaurants match.</td></tr>';
        return;
      }
      body.innerHTML = res.items.map(row).join("");
      shell.pager(pagerZone, {
        page: res.page,
        totalPages: res.totalPages,
        onPage: (next) => { page = next; load(); window.scrollTo({ top: 0, behavior: "smooth" }); },
      });
    } catch (e) {
      body.innerHTML = '<tr><td colspan="6" class="empty-cell">' + shell.esc(e.message) + "</td></tr>";
    }
  };

  document.getElementById("search-btn").addEventListener("click", () => {
    search = searchInput.value.trim();
    page = 1;
    load();
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { search = searchInput.value.trim(); page = 1; load(); }
  });
  document.getElementById("new-btn").addEventListener("click", () => {
    window.location.href = "admin-restaurants.html?new=1";
  });

  const id = ui.getParam("id");
  if (id) {
    document.getElementById("rest-body").innerHTML = '<tr><td colspan="6" class="empty-cell">Loading…</td></tr>';
    openDetail(id);
  } else {
    load();
  }

  async function openDetail(rid) {
    try {
      const d = await admin.restaurant(rid);
      const r = d.restaurant;
      const foods = d.foods || [];
      document.getElementById("admin-title").textContent = r.name;
      document.getElementById("admin-subtitle").textContent = "Edit details, toggle availability and manage the menu.";
      const host = document.querySelector(".admin-main");
      host.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.innerHTML =
        '<p class="crumbs"><a href="admin-restaurants.html">Restaurants</a> / ' + shell.esc(r.name) + "</p>" +
        '<div class="detail-grid"><div>' +
        '<div class="panel"><div class="panel-head"><h2>Details</h2>' +
        (r.isActive ? ui.statusBadge("paid").replace("Paid", "Active") : ui.statusBadge("cancelled").replace("Cancelled", "Inactive")) +
        "</div><div class=\"panel-body\">" +
        '<div class="form-grid">' +
        field("Name", "name", r.name) +
        field("Address", "address", r.address) +
        field("Cuisine (comma separated)", "cuisine", (r.cuisine || []).join(", ")) +
        field("Delivery time (min)", "deliveryTime", r.deliveryTime) +
        field("Delivery fee", "deliveryFee", r.deliveryFee) +
        field("Min order", "minOrder", r.minOrder) +
        field("Image URL", "image", r.image || "") +
        '<div class="field full"><label>Description</label><textarea class="textarea" id="f-description">' + shell.esc(r.description || "") + "</textarea></div>" +
        "</div>" +
        '<div class="form-actions"><button class="btn btn-primary" id="save-btn">Save changes</button>' +
        '<button class="btn btn-danger" id="del-btn">Remove restaurant</button></div>' +
        "</div></div>" +
        '<div class="panel"><div class="panel-head"><h2>Menu (' + foods.length + ')</h2>' +
        '<a class="btn btn-sm btn-outline" href="admin-foods.html?restaurant=' + encodeURIComponent(rid) + '">Manage foods</a></div>' +
        '<div class="panel-body">' +
        (foods.length
          ? foods.map((f) =>
              '<div class="item-row"><div class="item-thumb">' + ui.imageTag(f.image, f.name, ui.foodEmoji(f.name)) +
              '</div><div class="item-main"><div class="i-name">' + shell.esc(f.name) + "</div>" +
              '<div class="i-sub">' + shell.esc(f.category) + " · " + ui.money(f.price) + "</div></div>" +
              "<div>" + (f.isAvailable ? ui.statusBadge("paid").replace("Paid", "Available") : ui.statusBadge("cancelled").replace("Cancelled", "Unavailable")) + "</div></div>"
            ).join("")
          : '<p class="muted">No foods yet.</p>') +
        "</div></div></div>" +
        '<div><div class="panel"><div class="panel-head"><h2>Visibility</h2></div><div class="panel-body">' +
        '<p class="muted small">Inactive restaurants are hidden from customers. Foods are kept intact.</p>' +
        '<div class="form-actions"><button class="btn ' + (r.isActive ? "btn-danger" : "btn-primary") + '" id="toggle-btn">' +
        (r.isActive ? "Deactivate" : "Reactivate") + "</button></div>" +
        "</div></div></div></div>";
      host.appendChild(wrap);

      document.getElementById("save-btn").addEventListener("click", async () => {
        const payload = {
          name: document.getElementById("f-name").value.trim(),
          address: document.getElementById("f-address").value.trim(),
          cuisine: document.getElementById("f-cuisine").value.split(",").map((s) => s.trim()).filter(Boolean),
          deliveryTime: Number(document.getElementById("f-deliveryTime").value),
          deliveryFee: Number(document.getElementById("f-deliveryFee").value),
          minOrder: Number(document.getElementById("f-minOrder").value),
          image: document.getElementById("f-image").value.trim(),
          description: document.getElementById("f-description").value.trim(),
        };
        try {
          await admin.updateRestaurant(rid, payload);
          ui.toast("Restaurant updated");
          openDetail(rid);
        } catch (e) { ui.toast(e.message, "error"); }
      });

      document.getElementById("del-btn").addEventListener("click", async () => {
        const ok = await ui.confirmModal({
          title: "Remove this restaurant?",
          message: r.name + " will be hidden from customers. Foods and order records are kept.",
          okLabel: "Remove",
        });
        if (!ok) return;
        try {
          await admin.deleteRestaurant(rid);
          ui.toast("Restaurant removed");
          window.location.href = "admin-restaurants.html";
        } catch (e) { ui.toast(e.message, "error"); }
      });

      document.getElementById("toggle-btn").addEventListener("click", async () => {
        try {
          await admin.setRestaurantActive(rid, !r.isActive);
          ui.toast(r.isActive ? "Deactivated" : "Reactivated");
          openDetail(rid);
        } catch (e) { ui.toast(e.message, "error"); }
      });
    } catch (e) {
      document.querySelector(".admin-main").innerHTML = ui.errorState(e.message);
    }
  }

  function field(label, id, value) {
    return '<div class="field"><label for="f-' + id + '">' + shell.esc(label) +
      '</label><input class="input" id="f-' + id + '" value="' + shell.esc(value) + '"></div>';
  }
})();
