/* Local Market — checkout: address selection + order placement + mock payment */
(function () {
  "use strict";
  const api = LM.api;
  const ui = LM.ui;

  ui.renderNavbar("checkout.html");
  ui.renderFooter();

  const main = document.getElementById("checkout-main");
  const listZone = document.getElementById("address-list");
  const summaryZone = document.getElementById("summary-zone");
  const addrForm = document.getElementById("addr-form");
  const toggleAddBtn = document.getElementById("toggle-add-addr");
  const cancelAddBtn = document.getElementById("cancel-add-addr");

  if (!LM.auth.isLoggedIn()) {
    main.innerHTML = ui.unauthorizedState();
    return;
  }

  let checkout = null;
  let selectedAddressId = null;
  let busy = false;

  const selectedMethod = () => {
    const el = document.querySelector('input[name="payMethod"]:checked');
    return el ? el.value : "COD";
  };

  const renderAddresses = () => {
    const addresses = checkout.addresses || [];
    if (!addresses.length) {
      listZone.innerHTML =
        '<div class="state-box slim"><p><b>No saved addresses.</b> Add one below to continue.</p></div>';
      selectedAddressId = null;
      addrForm.hidden = false;
      toggleAddBtn.hidden = true;
      return;
    }

    if (!selectedAddressId || !addresses.some((a) => String(a._id) === selectedAddressId)) {
      const def = addresses.find((a) => a.isDefault) || addresses[0];
      selectedAddressId = String(def._id);
    }

    listZone.innerHTML = addresses
      .map((a) => {
        const on = String(a._id) === selectedAddressId;
        const type = (a.addressType || "OTHER").toLowerCase();
        return (
          '<label class="radio-card' + (on ? " on" : "") + '">' +
          '<input type="radio" name="addr" value="' + ui.esc(a._id) + '"' + (on ? " checked" : "") + ">" +
          '<span class="rc-body"><span class="flex-center" style="gap:8px;flex-wrap:wrap">' +
          "<b>" + ui.esc(a.fullName) + "</b>" + ui.statusBadge(type) +
          (a.isDefault ? '<span class="badge badge-dark">Default</span>' : "") +
          "</span>" +
          '<span class="small muted">' +
          ui.esc(a.houseNumber + ", " + a.street + (a.area ? ", " + a.area : "") + ", " + a.city + ", " + a.state + " - " + a.pincode) +
          "</span>" +
          '<span class="small muted">📞 ' + ui.esc(a.phone) + "</span>" +
          "</span></label>"
        );
      })
      .join("") +
      '<a class="link small" href="addresses.html">Manage addresses →</a>';

    listZone.querySelectorAll('input[name="addr"]').forEach((r) => {
      r.addEventListener("change", () => {
        selectedAddressId = r.value;
        listZone.querySelectorAll(".radio-card").forEach((c) => c.classList.remove("on"));
        r.closest(".radio-card").classList.add("on");
      });
    });
  };

  const renderSummary = () => {
    const d = checkout;
    const items = d.items || [];
    summaryZone.innerHTML =
      '<div class="panel summary-panel sticky">' +
      "<h2>Your order</h2>" +
      '<div class="mini-items">' +
      items
        .map(
          (it) =>
            '<div class="mini-item"><span>' +
            ui.esc(it.quantity) + " × " + ui.esc(it.name) +
            (it.restaurant ? ' <span class="muted">· ' + ui.esc(it.restaurant.name) + "</span>" : "") +
            '</span><b>' + ui.money(it.itemTotal) + "</b></div>"
        )
        .join("") +
      "</div>" +
      '<div class="sum-row"><span>Subtotal</span><b>' + ui.money(d.subtotal) + "</b></div>" +
      '<div class="sum-row"><span>Delivery fee</span><b>' +
      (Number(d.deliveryCharge) === 0 ? "FREE" : ui.money(d.deliveryCharge)) + "</b></div>" +
      '<div class="sum-row total"><span>To pay</span><b>' + ui.money(d.total) + "</b></div>" +
      ((d.issues || []).length
        ? '<div class="alert alert-warning" role="alert"><b>Cannot checkout yet:</b><ul>' +
          d.issues.map((i) => "<li>" + ui.esc(i) + "</li>").join("") +
          '</ul><a class="link" href="cart.html">Fix in cart →</a></div>'
        : '<button class="btn btn-primary btn-block" id="place-btn">Place order · ' + ui.money(d.total) + "</button>") +
      "</div>";

    const placeBtn = document.getElementById("place-btn");
    placeBtn && placeBtn.addEventListener("click", placeOrder);
  };

  const loadCheckout = async () => {
    summaryZone.innerHTML = ui.spinnerBlock();
    try {
      const res = await api.get("/checkout");
      checkout = res.data;
      if (!(checkout.items || []).length) {
        ui.toast("Your cart is empty", "warning");
        window.location.href = "cart.html";
        return;
      }
      if (checkout.selectedAddress && !selectedAddressId) {
        selectedAddressId = String(checkout.selectedAddress._id);
      }
      renderAddresses();
      renderSummary();
    } catch (e) {
      if (e.status === 401) {
        window.location.href = "login.html?redirect=" + encodeURIComponent("checkout.html");
        return;
      }
      summaryZone.innerHTML = ui.errorState(e.message, 'data-retry="1"');
      summaryZone.querySelector("[data-retry]").addEventListener("click", loadCheckout);
    }
  };

  const runPayment = async (orderId, forceSuccess) => {
    const method = selectedMethod();
    const payload = { orderId, paymentMethod: method };
    if (!forceSuccess && document.getElementById("sim-fail") && document.getElementById("sim-fail").checked && method !== "COD") {
      payload.testResult = "FAILED";
    }
    return api.post("/payments/mock", payload);
  };

  const showSuccess = (order, payment) => {
    const cod = payment.paymentMethod === "COD";
    main.innerHTML =
      '<div class="state-box success-box">' +
      '<div class="state-icon" aria-hidden="true">🎉</div>' +
      "<h1>Order placed!</h1>" +
      "<p>Your order <b>" + ui.shortId(order.orderId || order._id) + "</b> for <b>" +
      ui.money(order.total) + "</b> is confirmed.</p>" +
      "<p class=\"muted\">" +
      (cod
        ? "💵 You will pay in cash when the food arrives."
        : payment.status === "SUCCESS"
          ? "✅ Mock payment succeeded · Txn " + ui.esc(payment.transactionId || "")
          : "") +
      "</p>" +
      '<div class="center-row">' +
      '<a class="btn btn-primary" href="order.html?id=' + encodeURIComponent(String(order.orderId || order._id)) + '">Track order</a>' +
      '<a class="btn btn-outline" href="orders.html">My orders</a>' +
      '<a class="btn btn-ghost" href="restaurants.html">Order more</a>' +
      "</div></div>";
    ui.refreshCartBadge();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showFailure = (order, message) => {
    main.innerHTML =
      '<div class="state-box error">' +
      '<div class="state-icon" aria-hidden="true">💳</div>' +
      "<h1>Payment failed</h1>" +
      "<p>" + ui.esc(message || "The mock gateway declined this payment.") + "</p>" +
      "<p class=\"muted\">Your order <b>" + ui.shortId(order.orderId || order._id) +
      "</b> is saved and unpaid. You can retry payment from your orders page too.</p>" +
      '<div class="center-row">' +
      '<button class="btn btn-primary" id="retry-pay">Retry payment</button>' +
      '<a class="btn btn-outline" href="order.html?id=' + encodeURIComponent(String(order.orderId || order._id)) + '">Open order</a>' +
      '<a class="btn btn-ghost" href="orders.html">My orders</a>' +
      "</div></div>";

    document.getElementById("retry-pay").addEventListener("click", async () => {
      const btn = document.getElementById("retry-pay");
      btn.disabled = true;
      btn.textContent = "Retrying...";
      try {
        const payRes = await runPayment(order.orderId || order._id, true);
        if (payRes.payment.status === "FAILED") {
          showFailure(order, "The gateway declined again.");
        } else {
          showSuccess(order, payRes.payment);
        }
      } catch (e) {
        ui.toast(e.message, "error");
        showFailure(order, e.message);
      }
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const placeOrder = async () => {
    if (busy) return;
    if (!selectedAddressId) {
      ui.toast("Please select or add a delivery address", "warning");
      addrForm.hidden = false;
      return;
    }
    busy = true;
    const btn = document.getElementById("place-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Placing order...";
    }
    try {
      const orderRes = await api.post("/orders", { addressId: selectedAddressId });
      const order = orderRes.order || orderRes.data;

      const payRes = await runPayment(order.orderId || order._id);
      const payment = payRes.payment;

      if (payment.status === "FAILED") {
        showFailure(order, payRes.message);
      } else {
        showSuccess(order, payment);
      }
    } catch (e) {
      ui.toast(e.message, "error");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Place order · " + ui.money(checkout ? checkout.total : 0);
      }
      if (e.message && /empty|unavailable|not accepting/i.test(e.message)) {
        setTimeout(() => (window.location.href = "cart.html"), 1600);
      }
    } finally {
      busy = false;
    }
  };

  toggleAddBtn.addEventListener("click", () => {
    addrForm.hidden = false;
    toggleAddBtn.hidden = true;
    addrForm.querySelector("input").focus();
  });
  cancelAddBtn.addEventListener("click", () => {
    addrForm.hidden = true;
    toggleAddBtn.hidden = !(checkout.addresses || []).length;
    addrForm.reset();
  });

  addrForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(addrForm);
    const payload = {
      fullName: String(fd.get("fullName") || "").trim(),
      phone: String(fd.get("phone") || "").trim(),
      houseNumber: String(fd.get("houseNumber") || "").trim(),
      street: String(fd.get("street") || "").trim(),
      area: String(fd.get("area") || "").trim(),
      city: String(fd.get("city") || "").trim(),
      state: String(fd.get("state") || "").trim(),
      pincode: String(fd.get("pincode") || "").trim(),
      addressType: String(fd.get("addressType") || "OTHER"),
      isDefault: fd.get("isDefault") === "on",
    };
    const submitBtn = addrForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
    try {
      const res = await api.post("/addresses", payload);
      const saved = res.data || {};
      selectedAddressId = String(saved._id || "");
      ui.toast("Address saved", "success");
      addrForm.reset();
      addrForm.hidden = true;
      toggleAddBtn.hidden = false;
      await loadCheckout();
    } catch (err) {
      ui.toast(err.message, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save address";
    }
  });

  loadCheckout();
})();
