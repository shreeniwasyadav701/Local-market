/* Local Market — addresses CRUD */
(function () {
  "use strict";
  const api = LM.api;
  const ui = LM.ui;

  ui.renderNavbar("profile.html");
  ui.renderFooter();

  const zone = document.getElementById("addr-zone");
  const countEl = document.getElementById("addr-count");
  const panel = document.getElementById("form-panel");
  const form = document.getElementById("addr-form");
  const addBtn = document.getElementById("add-btn");

  if (!LM.auth.isLoggedIn()) {
    zone.innerHTML = ui.unauthorizedState();
    document.querySelector(".page-actions").hidden = true;
    return;
  }

  const closeForm = () => {
    panel.hidden = true;
    form.reset();
    form.elements.id.value = "";
  };

  const openForm = (address) => {
    panel.hidden = false;
    form.reset();
    form.elements.id.value = address ? address._id : "";
    panel.querySelector("#form-h").textContent = address ? "Edit address" : "New address";
    if (address) {
      ["fullName", "phone", "houseNumber", "street", "area", "city", "state", "pincode", "landmark"].forEach(
        (f) => {
          if (form.elements[f]) form.elements[f].value = address[f] || "";
        }
      );
      form.elements.addressType.value = address.addressType || "HOME";
      form.elements.isDefault.checked = Boolean(address.isDefault);
    }
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    form.elements.fullName.focus();
  };

  const load = async () => {
    zone.innerHTML = ui.skeletonGrid(3);
    try {
      const res = await api.get("/addresses");
      const list = res.data || [];
      countEl.textContent = list.length + " saved address" + (list.length === 1 ? "" : "es");

      if (!list.length) {
        zone.innerHTML = ui.emptyState({
          icon: "📍",
          title: "No addresses yet",
          text: "Add the places you want your food delivered to.",
          actionHtml: '<button class="btn btn-primary" id="empty-add">+ Add address</button>',
        });
        const ea = document.getElementById("empty-add");
        ea && ea.addEventListener("click", () => openForm(null));
        return;
      }

      zone.innerHTML = '<div class="addr-grid">' +
        list.map(card).join("") + "</div>";
      bind(list);
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

  const card = (a) => {
    const type = (a.addressType || "OTHER").toLowerCase();
    return (
      '<div class="card addr-card" data-id="' + ui.esc(a._id) + '">' +
      '<div class="card-body">' +
      '<div class="flex-center" style="gap:8px;flex-wrap:wrap">' +
      "<b>" + ui.esc(a.fullName) + "</b>" + ui.statusBadge(type) +
      (a.isDefault ? '<span class="badge badge-success">Default</span>' : "") +
      "</div>" +
      '<div class="muted small">' +
      ui.esc(a.houseNumber + ", " + a.street + ", " + a.area) + "<br>" +
      ui.esc(a.city + ", " + a.state + " - " + a.pincode) + "<br>📞 " + ui.esc(a.phone) +
      (a.landmark ? "<br>Landmark: " + ui.esc(a.landmark) : "") +
      "</div>" +
      '<div class="card-foot">' +
      (a.isDefault ? "" : '<button class="link" data-default>Set as default</button>') +
      '<span class="spacer"></span>' +
      '<button class="link" data-edit>Edit</button>' +
      '<button class="link danger" data-del>Delete</button>' +
      "</div></div></div>"
    );
  };

  const bind = (list) => {
    zone.querySelectorAll(".addr-card").forEach((el) => {
      const a = list.find((x) => String(x._id) === el.dataset.id);
      if (!a) return;

      const edit = el.querySelector("[data-edit]");
      edit && edit.addEventListener("click", () => openForm(a));

      const def = el.querySelector("[data-default]");
      def &&
        def.addEventListener("click", async () => {
          try {
            await api.patch("/addresses/" + a._id + "/default");
            ui.toast("Default address updated", "success");
            load();
          } catch (e) {
            ui.toast(e.message, "error");
          }
        });

      const del = el.querySelector("[data-del]");
      del &&
        del.addEventListener("click", async () => {
          const ok = await ui.confirmModal({
            title: "Delete address?",
            message: "This address will be permanently removed.",
            okLabel: "Delete",
          });
          if (!ok) return;
          try {
            await api.del("/addresses/" + a._id);
            ui.toast("Address deleted");
            load();
          } catch (e) {
            ui.toast(e.message, "error");
          }
        });
    });
  };

  addBtn.addEventListener("click", () => openForm(null));
  document.getElementById("cancel-btn").addEventListener("click", closeForm);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const id = String(fd.get("id") || "");
    const payload = {
      fullName: String(fd.get("fullName") || "").trim(),
      phone: String(fd.get("phone") || "").trim(),
      houseNumber: String(fd.get("houseNumber") || "").trim(),
      street: String(fd.get("street") || "").trim(),
      area: String(fd.get("area") || "").trim(),
      city: String(fd.get("city") || "").trim(),
      state: String(fd.get("state") || "").trim(),
      pincode: String(fd.get("pincode") || "").trim(),
      landmark: String(fd.get("landmark") || "").trim(),
      addressType: String(fd.get("addressType") || "OTHER"),
      isDefault: fd.get("isDefault") === "on",
    };

    const saveBtn = document.getElementById("save-btn");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    try {
      if (id) {
        await api.put("/addresses/" + id, payload);
        ui.toast("Address updated", "success");
      } else {
        await api.post("/addresses", payload);
        ui.toast("Address added", "success");
      }
      closeForm();
      load();
    } catch (err) {
      ui.toast(err.message, "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save address";
    }
  });

  load();
})();
