#!/bin/bash
BASE="http://localhost:5000/api"
DB=local_market
PASS=0; FAIL=0
TMP=/tmp/opencode/track_body.json
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

# --- setup: admin + customer ---
SUF=$(date +%s)
ADMIN_EMAIL="mod6admin$SUF@example.com"
CUST_EMAIL="mod6cust$SUF@example.com"

TOKEN_A=$(curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Track Admin\",\"email\":\"$ADMIN_EMAIL\",\"phone\":\"9876543212\",\"password\":\"secret123\"}" | jq -r '.data.token')
TOKEN_C=$(curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Track Customer\",\"email\":\"$CUST_EMAIL\",\"phone\":\"9876543213\",\"password\":\"secret123\"}" | jq -r '.data.token')
[ -z "$TOKEN_A" ] || [ "$TOKEN_A" = "null" ] && { echo "FATAL: no token"; exit 1; }

mongosh --quiet $DB --eval "db.users.updateOne({email: '$ADMIN_EMAIL'}, {\$set: {role: 'admin'}})" >/dev/null
echo "admin promoted: $ADMIN_EMAIL"

DOSA=$(curl -s "$BASE/foods?search=dosa" | jq -r '.data[] | select(.name == "Masala Dosa") | ._id')
GHOST=6ac695f9e5c9d8a1ffffff00

TOKEN=$TOKEN_C
BODY="{\"foodId\":\"$DOSA\"}"; req POST "/cart" >/dev/null
BODY="{\"customerName\":\"Track Customer\",\"phone\":\"9876543213\",\"address\":\"5 Tracker Lane\"}"
req POST "/orders" >/dev/null
ORDER1=$(json_field '.data._id')
BODY="{\"foodId\":\"$DOSA\"}"; req POST "/cart" >/dev/null
BODY="{\"customerName\":\"Track Customer\",\"phone\":\"9876543213\",\"address\":\"5 Tracker Lane\"}"
req POST "/orders" >/dev/null
ORDER2=$(json_field '.data._id')
BODY="{\"foodId\":\"$DOSA\"}"; req POST "/cart" >/dev/null
BODY="{\"customerName\":\"Track Customer\",\"phone\":\"9876543213\",\"address\":\"5 Tracker Lane\"}"
req POST "/orders" >/dev/null
ORDER3=$(json_field '.data._id')
BODY=""
echo "orders: $ORDER1 $ORDER2 $ORDER3"

echo "--- TRACKING: AUTH + VALIDATION ---"
TOKEN=""
check GET "/orders/$ORDER1/tracking" "no token -> 401" 401
TOKEN=$TOKEN_C
check GET "/orders/bad-id/tracking" "invalid order id -> 400" 400
check GET "/orders/$GHOST/tracking" "unknown order -> 404" 404
check GET "/orders/$ORDER1/tracking" "own order tracking -> 200" 200 \
  '.data.orderId == "'"$ORDER1"'" and .data.status == "placed" and
   (.data.items | length) == 1 and .data.items[0].name == "Masala Dosa" and
   .data.items[0].quantity == 1 and .data.items[0].price == 120 and
   .data.total == 150 and (.data.statusHistory | length) == 1 and
   .data.createdAt != null and .data.updatedAt != null'
TOKEN=$TOKEN_A
check GET "/orders/$ORDER1/tracking" "admin tracking non-owned order -> 404 (owner-only)" 404

echo "--- STATUS UPDATE: AUTH + VALIDATION ---"
ORDER_URL="/orders/$ORDER1/status"
TOKEN=""
BODY='{"status":"CONFIRMED"}'
check PATCH "$ORDER_URL" "no token -> 401" 401
TOKEN=$TOKEN_C
check PATCH "$ORDER_URL" "customer (non-admin) -> 403" 403
TOKEN=$TOKEN_A
check PATCH "/orders/bad-id/status" "invalid order id -> 400" 400
check PATCH "/orders/$GHOST/status" "unknown order -> 404" 404
BODY='{}'
check PATCH "$ORDER_URL" "missing status -> 400" 400
BODY='{"status":"SHIPPED"}'
check PATCH "$ORDER_URL" "invalid status value -> 400" 400 '.message | contains("Invalid status value")'
BODY='{"status": broken json'
check PATCH "$ORDER_URL" "invalid JSON -> 400" 400
BODY='{"status":"DELIVERED"}'
check PATCH "$ORDER_URL" "invalid transition placed->delivered -> 400" 400 '.message == "Cannot change status from placed to delivered"'

echo "--- STATUS UPDATE: HAPPY PATH (uppercase input, lowercase stored) ---"
BODY='{"status":"CONFIRMED"}'
check PATCH "$ORDER_URL" "CONFIRMED -> 200" 200 \
  '.data.status == "confirmed" and (.data.statusHistory | length) == 2 and
   [.data.statusHistory[].status] == ["placed", "confirmed"]'
BODY='{"status":"confirmed"}'
check PATCH "$ORDER_URL" "confirmed->confirmed rejected -> 400" 400
BODY='{"status":"PREPARING"}'
check PATCH "$ORDER_URL" "PREPARING -> 200" 200 '.data.status == "preparing" and (.data.statusHistory | length) == 3'
BODY='{"status":"OUT_FOR_DELIVERY"}'
check PATCH "$ORDER_URL" "OUT_FOR_DELIVERY -> 200" 200 '.data.status == "out_for_delivery" and (.data.statusHistory | length) == 4'
BODY='{"status":"DELIVERED"}'
check PATCH "$ORDER_URL" "DELIVERED -> 200" 200 \
  '.data.status == "delivered" and (.data.statusHistory | length) == 5 and
   [.data.statusHistory[].status] == ["placed","confirmed","preparing","out_for_delivery","delivered"]'
BODY='{"status":"PREPARING"}'
check PATCH "$ORDER_URL" "delivered is terminal -> 400" 400 '.message == "Cannot change status from delivered to preparing"'

TOKEN=$TOKEN_C; BODY=""
check GET "/orders/$ORDER1/tracking" "tracking reflects delivered" 200 \
  '.data.status == "delivered" and (.data.statusHistory | length) == 5 and .data.total == 150'

echo "--- STATUS UPDATE: CANCEL SAFETY ---"
TOKEN=$TOKEN_A
BODY='{"status":"CANCELLED"}'
check PATCH "/orders/$ORDER2/status" "cancel a placed order -> 200" 200 \
  '.data.status == "cancelled" and [.data.statusHistory[].status] == ["placed","cancelled"]'
check PATCH "/orders/$ORDER2/status" "cancelled is terminal -> 400" 400 '.message == "Cannot change status from cancelled to cancelled"'
BODY='{"status":"CONFIRMED"}'
check PATCH "/orders/$ORDER3/status" "advance order3 to confirmed -> 200" 200 '.data.status == "confirmed"'
BODY='{"status":"PREPARING"}'
check PATCH "/orders/$ORDER3/status" "advance order3 to preparing -> 200" 200 '.data.status == "preparing"'
BODY='{"status":"CANCELLED"}'
check PATCH "/orders/$ORDER3/status" "cannot cancel while preparing -> 400" 400 '.message == "Cannot change status from preparing to cancelled"'

echo "--- CASE-INSENSITIVE VALUE ON TERMINAL STATE ---"
BODY='{"status":"cAnCeLlEd"}'
check PATCH "/orders/$ORDER2/status" "mixed-case accepted as value, terminal blocks -> 400 transition" 400 '.message | contains("Cannot change status")'

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && echo "MODULE 6: ALL TESTS PASSED" || echo "MODULE 6: FAILURES PRESENT"
