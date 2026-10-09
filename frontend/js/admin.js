/* Local Market — admin dashboard helpers.
   Admin list endpoints return bespoke keys (.orders/.restaurants/.foods/
   .payments + .pagination.totalItems) instead of the public .data/.total
   shape, so this wraps LM.api and normalizes them for the views. */
(function () {
  "use strict";

  const api = () => window.LM.api;
  const ui = () => window.LM.ui;

  /* Order status transitions enforced by the backend (orderController.js). */
  const NEXT_STATUS = {
    placed: ["confirmed", "cancelled"],
    confirmed: ["preparing", "cancelled"],
    preparing: ["out_for_delivery", "cancelled"],
    out_for_delivery: ["delivered"],
    delivered: [],
    cancelled: [],
  };

  const CAN_CANCEL = ["placed", "confirmed", "preparing"];

  const nextPage = (pager) => (pager ? (pager.page || 1) + 1 : 1);

  const normList = (res, key) => {
    const items = (res && res[key]) || (res && res.data) || [];
    const pagination = (res && res.pagination) || {};
    return {
      items,
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      totalItems:
        pagination.totalItems !== undefined
          ? pagination.totalItems
          : pagination.totalOrders !== undefined
            ? pagination.totalOrders
            : pagination.totalPayments !== undefined
              ? pagination.totalPayments
              : (res && (res.total || res.count)) || items.length,
      totalPages: pagination.totalPages || 1,
    };
  };

  const unwrap = (res) => (res && res.data !== undefined ? res.data : res);

  const Admin = {
    NEXT_STATUS,
    CAN_CANCEL,
    nextPage,
    normList,
    unwrap,

    /* Guard an admin page: must be signed in AND an admin, else bounce out. */
    guard() {
      const auth = window.LM.auth;
      if (!auth.isLoggedIn()) {
        window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.pathname + window.location.search);
        return false;
      }
      const user = auth.user() || {};
      if (user.role !== "admin") {
        window.location.href = "index.html";
        return false;
      }
      return true;
    },

    user() {
      return (window.LM.auth.user() || {});
    },

    /* ---------- orders ---------- */
    async orders(params) {
      const q = new URLSearchParams(params || {}).toString();
      return normList(await api().get("/admin/orders" + (q ? "?" + q : "")), "orders");
    },

    async order(orderId) {
      return unwrap(await api().get("/admin/orders/" + orderId));
    },

    async setOrderStatus(orderId, status) {
      return unwrap(await api().patch("/admin/orders/" + orderId + "/status", { status }));
    },

    /* ---------- payments ---------- */
    async payments(params) {
      const q = new URLSearchParams(params || {}).toString();
      return normList(await api().get("/admin/payments" + (q ? "?" + q : "")), "payments");
    },

    async refund(paymentId) {
      return unwrap(await api().patch("/admin/payments/" + paymentId + "/refund"));
    },

    /* ---------- restaurants ---------- */
    async restaurants(params) {
      const q = new URLSearchParams(params || {}).toString();
      return normList(await api().get("/admin/restaurants" + (q ? "?" + q : "")), "restaurants");
    },

    async restaurant(restaurantId) {
      return unwrap(await api().get("/admin/restaurants/" + restaurantId));
    },

    async createRestaurant(payload) {
      return unwrap(await api().post("/admin/restaurants", payload));
    },

    async updateRestaurant(restaurantId, payload) {
      return unwrap(await api().put("/admin/restaurants/" + restaurantId, payload));
    },

    async deleteRestaurant(restaurantId) {
      return unwrap(await api().del("/admin/restaurants/" + restaurantId));
    },

    async setRestaurantActive(restaurantId, isActive) {
      return unwrap(await api().patch("/admin/restaurants/" + restaurantId + "/status", { isActive }));
    },

    /* ---------- foods ---------- */
    async foods(params) {
      const q = new URLSearchParams(params || {}).toString();
      return normList(await api().get("/admin/foods" + (q ? "?" + q : "")), "foods");
    },

    async food(foodId) {
      return unwrap(await api().get("/admin/foods/" + foodId));
    },

    async createFood(payload) {
      return unwrap(await api().post("/admin/foods", payload));
    },

    async updateFood(foodId, payload) {
      return unwrap(await api().put("/admin/foods/" + foodId, payload));
    },

    async deleteFood(foodId) {
      return unwrap(await api().del("/admin/foods/" + foodId));
    },

    async setFoodAvailable(foodId, isAvailable) {
      return unwrap(await api().patch("/admin/foods/" + foodId + "/status", { isAvailable }));
    },

    /* ---------- derived stats (no stats endpoint exists) ---------- */
    async stats() {
      const [ordersRes, paymentsRes, restsRes, foodsRes] = await Promise.all([
        api().get("/admin/orders?limit=1"),
        api().get("/admin/payments?limit=1"),
        api().get("/admin/restaurants?limit=1"),
        api().get("/admin/foods?limit=1"),
      ]);
      const o = normList(ordersRes, "orders");
      const p = normList(paymentsRes, "payments");
      const r = normList(restsRes, "restaurants");
      const f = normList(foodsRes, "foods");
      return { orders: o.totalItems, payments: p.totalItems, restaurants: r.totalItems, foods: f.totalItems };
    },
  };

  window.LM = window.LM || {};
  window.LM.admin = Admin;
})();
