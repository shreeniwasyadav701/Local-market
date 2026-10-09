/* Local Market — admin foods list + create/edit/toggle/remove */
(function () {
  "use strict";

  const admin = LM.admin;
  const shell = LM.adminShell;
  const ui = LM.ui;

  if (!shell.init({ active: "admin-foods.html", title: "Foods", subtitle: "Add items, adjust prices and control availability." })) return;

  ui.renderNavbar("admin-foods.html");
  ui.renderFooter();

  const body = document.getElementById("foods-body");
  const pagerZone = document.getElementById("foods-pager");
  const countEl = document.getElementById("foods-count");
  const searchInput = document.getElementById("search-input");
  const restFilter = document.getElementById("restaurant-filter");
  const modal = document.getElementById("food-modal");
  const fmError = document.getElementById("fm-error");

  let page = 1;
  let search = "";
  let restaurantId = ui.getParam("restaurant") || "";
  let editingId = null;
  let restaurants = [];

  const row = (f) => {
    const rest = f.restaurant && typeof f.restaurant === "object" ? f.restaurant.name : "—";
    return (
      "<tr>" +
      '<td class="cell-title">' + shell.esc(f.name) +
      '<div class="cell-sub">' + shell.esc(f.description || "").slice(0, 60) + "</div></td>" +
      '<td class="cell-sub">' + shell.esc(rest) + "</td>" +
      '<td class="cell-sub">' + shell.esc(f.category) + "</td>" +
      '<td class="cell-title">' + ui.money(f.price) + "</td>" +
      "<td>" + ui.vegMark(f.isVeg) + "</td>" +
      "<td>" + (f.isAvailable ? ui.statusBadge("paid").replace("Paid", "Available") : ui.statusBadge("cancelled").replace("Cancelled", "Unavailable")) + "</td>" +
      '<td class="cell-actions">' +
      '<button class="btn btn-sm btn-outline" data-edit="' + shell.esc(f._id) + '">Edit</button>' +
      '<button class="btn btn-sm btn-outline" data-toggle="' + shell.esc(f._id) + '" data-avail="' + (f.isAvailable ? "1" : "0") + '">' +
      (f.isAvailable ? "Disable" : "Enable") + "</button>" +
      '<button class="btn btn-sm btn-danger" data-del="' + shell.esc(f._id) + '">Remove</button>' +
      "</td></tr>"
    );
  };

  const load = async () => {
    body.innerHTML = '<tr><td colspan="7" class="empty-cell">Loading…</td></tr>';
    pagerZone.innerHTML = "";
    try {
      const params = { page: page, limit: 12 };
      if (search) params.search = search;
      if (restaurantId) params.restaurantId = restaurantId;
      const res = await admin.foods(params);
      countEl.textContent = res.totalItems + " item" + (res.totalItems === 1 ? "" : "s");
      if (!res.items.length) {
        body.innerHTML = '<tr><td colspan="7" class="empty-cell">No foods match.</td></tr>';
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
      body.innerHTML = '<tr><td colspan="7" class="empty-cell">' + shell.esc(e.message) + "</td></tr>";
    }
  };

  const bind = () => {
    body.querySelectorAll("[data-edit]").forEach((b) => {
      b.addEventListener("click", () => openModal(b.dataset.edit));
    });
    body.querySelectorAll("[data-toggle]").forEach((b) => {
      b.addEventListener("click", async () => {
        const next = b.dataset.avail === "1" ? false : true;
        try {
          await admin.setFoodAvailable(b.dataset.toggle, next);
          ui.toast(next ? "Enabled" : "Disabled");
          load();
        } catch (e) { ui.toast(e.message, "error"); }
      });
    });
    body.querySelectorAll("[data-del]").forEach((b) => {
      b.addEventListener("click", async () => {
        const ok = await ui.confirmModal({
          title: "Remove this food?",
          message: "It will be hidden from customers. Order records are kept.",
          okLabel: "Remove",
        });
        if (!ok) return;
        try {
          await admin.deleteFood(b.dataset.del);
          ui.toast("Removed");
          load();
        } catch (e) { ui.toast(e.message, "error"); }
      });
    });
  };

  const openModal = async (id) => {
    editingId = id || null;
    fmError.hidden = true;
    if (!restaurants.length) {
      try {
        const res = await admin.restaurants({ limit: 50 });
        restaurants = res.items;
      } catch (e) { ui.toast(e.message, "error"); return; }
    }
    const restSel = document.getElementById("fm-restaurant");
    restSel.innerHTML = restaurants.map((r) => '<option value="' + shell.esc(r._id) + '">' + shell.esc(r.name) + "</option>").join("");

    const catSel = document.getElementById("fm-category");
    catSel.innerHTML = ui.FOOD_CATEGORIES.map((c) => '<option value="' + shell.esc(c) + '">' + shell.esc(c) + "</option>").join("");

    if (id) {
      document.getElementById("food-modal-title").textContent = "Edit food";
      try {
        const f = await admin.food(id);
        document.getElementById("fm-name").value = f.name || "";
        document.getElementById("fm-price").value = f.price != null ? f.price : "";
        document.getElementById("fm-image").value = f.image || "";
        document.getElementById("fm-description").value = f.description || "";
        document.getElementById("fm-isVeg").checked = !!f.isVeg;
        document.getElementById("fm-isAvailable").checked = f.isAvailable !== false;
        if (f.restaurant && typeof f.restaurant === "object") restSel.value = f.restaurant._id;
        if (f.category) catSel.value = f.category;
      } catch (e) { ui.toast(e.message, "error"); }
    } else {
      document.getElementById("food-modal-title").textContent = "New food";
      document.getElementById("fm-name").value = "";
      document.getElementById("fm-price").value = "";
      document.getElementById("fm-image").value = "";
      document.getElementById("fm-description").value = "";
      document.getElementById("fm-isVeg").checked = false;
      document.getElementById("fm-isAvailable").checked = true;
      if (restaurantId) restSel.value = restaurantId;
    }
    modal.hidden = false;
    document.getElementById("fm-name").focus();
  };

  const closeModal = () => { modal.hidden = true; editingId = null; };

  document.getElementById("fm-cancel").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  document.getElementById("fm-save").addEventListener("click", async () => {
    const payload = {
      name: document.getElementById("fm-name").value.trim(),
      price: Number(document.getElementById("fm-price").value),
      category: document.getElementById("fm-category").value,
      restaurantId: document.getElementById("fm-restaurant").value,
      image: document.getElementById("fm-image").value.trim(),
      description: document.getElementById("fm-description").value.trim(),
      isVeg: document.getElementById("fm-isVeg").checked,
      isAvailable: document.getElementById("fm-isAvailable").checked,
    };
    if (!payload.name || !payload.price || !payload.restaurantId) {
      fmError.textContent = "Name, price and restaurant are required.";
      fmError.hidden = false;
      return;
    }
    try {
      if (editingId) {
        await admin.updateFood(editingId, payload);
        ui.toast("Food updated");
      } else {
        await admin.createFood(payload);
        ui.toast("Food created");
      }
      closeModal();
      load();
    } catch (e) {
      fmError.textContent = e.message;
      fmError.hidden = false;
    }
  });

  document.getElementById("search-btn").addEventListener("click", () => {
    search = searchInput.value.trim();
    page = 1;
    load();
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { search = searchInput.value.trim(); page = 1; load(); }
  });
  restFilter.addEventListener("change", () => {
    restaurantId = restFilter.value;
    page = 1;
    load();
  });
  document.getElementById("new-btn").addEventListener("click", () => openModal(null));

  (async () => {
    try {
      const res = await admin.restaurants({ limit: 50 });
      restaurants = res.items;
      restFilter.innerHTML = '<option value="">All restaurants</option>' +
        restaurants.map((r) => '<option value="' + shell.esc(r._id) + '">' + shell.esc(r.name) + "</option>").join("");
      if (restaurantId) restFilter.value = restaurantId;
    } catch (e) { /* non-critical */ }
    load();
  })();
})();
