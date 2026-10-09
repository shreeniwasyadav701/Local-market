#!/bin/bash
BASE="http://localhost:5000/api"
DB=local_market
PASS=0; FAIL=0
TMP=/tmp/opencode/order_body.json
BODY=""; TOKEN=""

req() {
  local method=$1 path=$2
  local args=(-s -o "$TMP" -w "%{http_code}" -X "$method" "$BASE$path" -H "Content-Type: application/json")
  [ -n "$TOKEN" ] && args+=(-H "Authorization: Bearer $TOKEN")
  [ -n "$BODY" ] && args+=(-d "$BODY")
  curl "${args[@]}"
}

check() {
  local method=$1 path=$2 label=$3 expected=$4 assert=$5 got ok=1
  got=$(req "$method" "$path")
  [ "$got" != "$expected" ] && ok=0
  if [ -n "$assert" ]; then
    jq -e "$assert" "$TMP" >/dev/null 2>&1 || ok=0
  fi
  if [ $ok -eq 1 ]; then
    PASS=$((PASS+1)); echo "PASS  $label ($got)"
  else
    FAIL=$((FAIL+1)); echo "FAIL  $label (expected $expected, got $got)"; head -c 350 "$TMP"; echo
  fi
}

json_field() { jq -r "$1" "$TMP"; }

# --- setup ---
SUF=$(date +%s)
TOKEN_A=$(curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Order User A\",\"email\":\"mod5a$SUF@example.com\",\"phone\":\"9876543210\",\"password\":\"secret123\"}" | jq -r '.data.token')
TOKEN_B=$(curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Order User B\",\"email\":\"mod5b$SUF@example.com\",\"phone\":\"9876543211\",\"password\":\"secret123\"}" | jq -r '.data.token')
[ -z "$TOKEN_A" ] || [ "$TOKEN_A" = "null" ] && { echo "FATAL: no token"; exit 1; }
mongosh --quiet $DB --eval "db.users.updateOne({email: 'mod5a$SUF@example.com'}, {\$set: {role: 'admin'}})" >/dev/null
TOKEN=$TOKEN_A
DOSA=$(curl -s "$BASE/foods?search=dosa" | jq -r '.data[] | select(.name == "Masala Dosa") | ._id')
BIRYANI=$(curl -s "$BASE/foods?search=Chicken%20Biryani" | jq -r '.data[] | select(.name == "Chicken Biryani") | ._id')
SPICE=6ac695f9e5c9d8a1af1b049e
GHOST=6ac695f9e5c9d8a1ffffff00
ADDR="42 Lake View Road, Bengaluru"
LONG_ADDR=$(printf 'x%.0s' {1..400})
echo "tokens + food ids ready"

echo "--- CHECKOUT VALIDATION ---"
TOKEN=""
check POST "/orders" "no token -> 401" 401
TOKEN=$TOKEN_A
BODY='{}'
check POST "/orders" "missing all fields -> 400" 400
BODY='{"customerName":"Asha Rao","phone":"12345","address":"42 Lake View"}'
check POST "/orders" "bad phone -> 400" 400
BODY="{\"customerName\":\"Asha Rao\",\"phone\":\"9876543210\",\"address\":\"$ADDR\"}"
check POST "/orders" "valid body but empty cart -> 400" 400 '.message == "Your cart is empty"'

echo "--- ORDER 1: standard totals ---"
BODY="{\"foodId\":\"$DOSA\",\"quantity\":2}"
req POST "/cart" >/dev/null
BODY="{\"customerName\":\"Asha Rao\",\"phone\":\"9876543210\",\"address\":\"$ADDR\"}"
check POST "/orders" "place order -> 201" 201 \
  '.data.subtotal == 240 and .data.deliveryCharge == 30 and .data.total == 270 and
   .data.status == "placed" and (.data.statusHistory | length) == 1 and
   .data.statusHistory[0].status == "placed" and .data.paymentMethod == "cod" and
   .data.paymentStatus == "pending" and .data.items[0].name == "Masala Dosa" and
   .data.items[0].price == 120 and .data.items[0].quantity == 2 and
   .data.items[0].image != "" and .data.customerName == "Asha Rao" and .data.phone == "9876543210"'
ORDER1=$(json_field '.data._id')
BODY=""
check GET "/cart" "cart cleared after order" 200 '.data.items == []'

echo "--- ORDER 2: tampered totals ignored + free delivery ---"
BODY="{\"foodId\":\"$DOSA\",\"quantity\":2}"; req POST "/cart" >/dev/null
BODY="{\"foodId\":\"$BIRYANI\"}"; req POST "/cart" >/dev/null
BODY="{\"customerName\":\"Asha Rao\",\"phone\":\"9876543210\",\"address\":\"$ADDR\",\"subtotal\":1,\"deliveryCharge\":0,\"total\":999999}"
check POST "/orders" "tampered totals ignored -> 520/0/520" 201 \
  '.data.subtotal == 520 and .data.deliveryCharge == 0 and .data.total == 520'
ORDER2=$(json_field '.data._id')
BODY=""
check GET "/cart" "cart cleared again" 200 '.data.items == []'

echo "--- FAILED CHECKOUT KEEPS CART ---"
BODY="{\"foodId\":\"$DOSA\"}"; req POST "/cart" >/dev/null
BODY="{\"customerName\":\"Asha Rao\",\"phone\":\"9876543210\",\"address\":\"$LONG_ADDR\"}"
check POST "/orders" "400-char address -> 400 (schema)" 400
BODY=""
check GET "/cart" "failed checkout did NOT clear cart" 200 '.data.itemCount == 1'

echo "--- UNAVAILABLE FOOD AT CHECKOUT ---"
BODY="{\"name\":\"Cart Temp Item\",\"price\":99,\"category\":\"Snacks\",\"restaurant\":\"$SPICE\"}"
req POST "/admin/foods" >/dev/null
TEMP_FOOD=$(json_field '.data._id')
BODY="{\"foodId\":\"$TEMP_FOOD\"}"; req POST "/cart" >/dev/null
BODY=""; check DELETE "/admin/foods/$TEMP_FOOD" "soft-delete temp food" 200
BODY="{\"customerName\":\"Asha Rao\",\"phone\":\"9876543210\",\"address\":\"$ADDR\"}"
check POST "/orders" "unavailable item blocks checkout -> 400" 400 '.message | contains("Cart Temp Item")'

echo "--- INACTIVE RESTAURANT AT CHECKOUT ---"
BODY="{\"name\":\"Temp Closed Diner\",\"cuisine\":[\"Indian\"],\"deliveryTime\":20,\"address\":\"1 Temp Street\"}"
req POST "/admin/restaurants" >/dev/null
TEMP_REST=$(json_field '.data._id')
BODY="{\"name\":\"Temp2 Item\",\"price\":60,\"category\":\"Snacks\",\"restaurant\":\"$TEMP_REST\"}"
req POST "/admin/foods" >/dev/null
TEMP_FOOD2=$(json_field '.data._id')
BODY=""
check DELETE "/cart" "clear cart" 200
BODY="{\"foodId\":\"$TEMP_FOOD2\"}"; req POST "/cart" >/dev/null
BODY=""
check DELETE "/admin/restaurants/$TEMP_REST" "soft-delete temp restaurant" 200
BODY="{\"customerName\":\"Asha Rao\",\"phone\":\"9876543210\",\"address\":\"$ADDR\"}"
check POST "/orders" "inactive restaurant blocks checkout -> 400" 400 '.message | contains("not accepting orders")'

echo "--- LIST MY ORDERS ---"
TOKEN=""
check GET "/orders" "list no token -> 401" 401
TOKEN=$TOKEN_A; BODY=""
check GET "/orders" "A sees exactly own 2 orders" 200 \
  '.total == 2 and .data[0].subtotal == 520 and .data[1].subtotal == 240'
check GET "/orders?limit=1" "pagination" 200 '.count == 1 and .pages == 2'

echo "--- GET ORDER BY ID ---"
check GET "/orders/$ORDER1" "own order -> 200" 200 '.data._id == "'"$ORDER1"'" and .data.total == 270'
check GET "/orders/bad-id" "bad id -> 400" 400
check GET "/orders/$GHOST" "ghost id -> 404" 404

echo "--- CROSS-USER PROTECTION ---"
TOKEN=$TOKEN_B
BODY="{\"foodId\":\"$BIRYANI\"}"; req POST "/cart" >/dev/null
BODY="{\"customerName\":\"User B\",\"phone\":\"9876543211\",\"address\":\"7 Other Street\"}"
req POST "/orders" >/dev/null
B_ORDER=$(json_field '.data._id')
BODY=""
check GET "/orders" "B sees exactly own 1 order" 200 '.total == 1'
TOKEN=$TOKEN_A
check GET "/orders/$B_ORDER" "A cannot read B order -> 404" 404
check PUT "/orders/$B_ORDER/cancel" "A cannot cancel B order -> 404" 404
check GET "/orders" "A still has 2 orders" 200 '.total == 2'

echo "--- CANCEL ORDER ---"
BODY=""
check PUT "/orders/$ORDER1/cancel" "cancel placed order -> 200" 200 \
  '.data.status == "cancelled" and (.data.statusHistory | length) == 2 and
   .data.statusHistory[0].status == "placed" and .data.statusHistory[1].status == "cancelled"'
check PUT "/orders/$ORDER1/cancel" "cancel again idempotent -> 200" 200 '.data.status == "cancelled"'
mongosh --quiet $DB --eval "db.orders.updateOne({_id: ObjectId('$ORDER2')}, {\$set: {status: 'preparing'}})" >/dev/null
check PUT "/orders/$ORDER2/cancel" "cannot cancel preparing -> 400" 400 '.message | contains("cannot be cancelled")'
check PUT "/orders/bad-id/cancel" "cancel bad id -> 400" 400
check PUT "/orders/$GHOST/cancel" "cancel ghost -> 404" 404

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && echo "MODULE 5: ALL TESTS PASSED" || echo "MODULE 5: FAILURES PRESENT"
