#!/usr/bin/env bash
# Restores the pristine data assumptions of the assertion-sensitive suites:
#  - testApis.sh expects exactly 12 customer-visible seed foods (testAdminManagement
#    creates a "Chicken Pizza" it never deletes)
#  - testPayments.sh hardcodes payment baselines assuming 0 payments at start
# Safe to run any time before re-running the backend regression suite.
set -euo pipefail
DB=${1:-local_market}

mongosh --quiet "$DB" --eval '
const foods = db.foods.deleteMany({ name: { $in: ["Chicken Pizza", "Temp2 Item", "Cart Temp Item"] } });
const pays  = db.payments.deleteMany({});
// testAdminManagement leaves its "Field Filter Test" restaurant active (it
// reactivates at the end), which breaks its own next-run search assertion
// and inflates customer-visible restaurant counts. Only the 4 seed
// restaurants should be active between runs.
const SEED = ["Spice Garden", "Curry Leaf", "Wok Street", "Sugar and Spice Bakehouse"];
const rest = db.restaurants.updateMany(
  { name: { $nin: SEED }, isActive: true },
  { $set: { isActive: false } }
);
print("foods removed: " + foods.deletedCount);
print("payments removed: " + pays.deletedCount);
print("test restaurants deactivated: " + rest.modifiedCount);
'
