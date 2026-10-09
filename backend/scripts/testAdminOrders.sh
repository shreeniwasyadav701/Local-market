#!/bin/bash
BASE="http://localhost:5000/api"
DB=local_market
PASS=0; FAIL=0
TMP=/tmp/opencode/admin_body.json
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
ADMIN_EMAIL="mod7admin$SUF@example.com"
CUST_EMAIL="mod7cust$SUF@example.com"
TOKEN_A=$(curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Panel Admin\",\"email\":\"$ADMIN_EMAIL\",\"phone\":\"9876543214\",\"password\":\"secret123\"}" | jq -r '.data.token')
TOKEN_C=$(curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Admin Order Customer\",\"email\":\"$CUST_EMAIL\",\"phone\":\"9876543215\",\"password\":\"secret123\"}" | jq -r '.data.token')
[ -z "$TOKEN_A" ] || [ "$TOKEN_A" = "null" ] && { echo "FATAL: no token"; exit 1; }
mongosh --quiet $DB --eval "db.users.updateOne({email: '$ADMIN_EMAIL'}, {\$set: {role: 'admin'}})" >/dev/null
echo "admin promoted: $ADMIN_EMAIL"

# --- baseline counts (suite must pass regardless of leftover data) ---
gcount() { curl -s "$BASE/admin/orders$1" -H "Authorization: Bearer $TOKEN_A" | jq -r '.pagination.totalOrders'; }
BASE_TOTAL=$(gcount "")
BASE_PLACED=$(gcount "?status=placed")
BASE_CONFIRMED=$(gcount "?status=confirmed")
BASE_DELIVERED=$(gcount "?status=delivered")
EXP_TOTAL=$((BASE_TOTAL + 3))
EXP_PAGES=$(( (EXP_TOTAL + 9) / 10 ))
EXP_PLACED=$((BASE_PLACED + 2))     # 3 new, then ORDER2 advanced to confirmed
EXP_CONFIRMED=$((BASE_CONFIRMED + 1))
EXP_PAGES2=$(( (EXP_PLACED + 1) / 2 ))
echo "baselines: total=$BASE_TOTAL placed=$BASE_PLACED confirmed=$BASE_CONFIRMED delivered=$BASE_DELIVERED"

DOSA=$(curl -s "$BASE/foods?search=dosa" | jq -r '.data[] | select(.name == "Masala Dosa") | ._id')
GHOST=6ac695f9e5c9d8a1ffffff00
TOKEN=$TOKEN_C
for i in 1 2 3; do
  BODY="{\"foodId\":\"$DOSA\"}"; req POST "/cart" >/dev/null
  BODY="{\"customerName\":\"Admin Order Customer\",\"phone\":\"9876543215\",\"address\":\"8 Panel Road\"}"
  req POST "/orders" >/dev/null
done
ORDER1=$(curl -s "$BASE/orders?limit=50" -H "Authorization: Bearer $TOKEN_C" | jq -r '.data[-1]._id')
ORDER2=$(curl -s "$BASE/orders?limit=50" -H "Authorization: Bearer $TOKEN_C" | jq -r '.data[-2]._id')
ORDER3=$(curl -s "$BASE/orders?limit=50" -H "Authorization: Bearer $TOKEN_C" | jq -r '.data[-3]._id')
BODY=""
echo "orders: $ORDER1 $ORDER2 $ORDER3"

echo "--- ADMIN LIST: AUTH + SHAPE ---"
TOKEN=""
check GET "/admin/orders" "no token -> 401" 401
TOKEN=$TOKEN_C
check GET "/admin/orders" "customer -> 403" 403
TOKEN=$TOKEN_A
check GET "/admin/orders" "admin list -> 200" 200 \
  ".success == true and .pagination.page == 1 and .pagination.limit == 10 and
   .pagination.totalOrders == $EXP_TOTAL and .pagination.totalPages == $EXP_PAGES"
check GET "/admin/orders" "customer populated, no password" 200 \
  '.orders[0].user.name == "Admin Order Customer" and .orders[0].user.email != null and
   (.orders[0].user | has("password") | not)'
check GET "/admin/orders" "all 3 orders present" 200 \
  '[.orders[]._id] as $ids | ($ids | index("'"$ORDER1"'")) != null and
   ($ids | index("'"$ORDER2"'")) != null and ($ids | index("'"$ORDER3"'")) != null'
check GET "/admin/orders" "money + items + no password anywhere" 200 \
  '.orders[0].subtotal == 120 and .orders[0].deliveryCharge == 30 and .orders[0].total == 150 and
   .orders[0].status == "placed" and (.orders[0].items | length) == 1 and
   .orders[0].items[0].quantity == 1 and .orders[0].items[0].price == 120 and
   .orders[0].createdAt != null and .orders[0].updatedAt != null and
   ([.. | objects | select(has("password"))] | length) == 0'

echo "--- FILTER BY STATUS ---"
BODY='{"status":"CONFIRMED"}'
req PATCH "/orders/$ORDER2/status" >/dev/null
BODY=""
check GET "/admin/orders?status=PLACED" "filter PLACED" 200 \
  ".pagination.totalOrders == $EXP_PLACED and ([.orders[].status] | unique) == [\"placed\"]"
check GET "/admin/orders?status=CONFIRMED" "filter CONFIRMED (includes ORDER2)" 200 \
  ".pagination.totalOrders == $EXP_CONFIRMED and ([.orders[]._id] | index(\"$ORDER2\")) != null"
check GET "/admin/orders?status=DELIVERED" "filter DELIVERED matches baseline" 200 \
  ".pagination.totalOrders == $BASE_DELIVERED"
check GET "/admin/orders?status=placed" "lowercase input accepted" 200 ".pagination.totalOrders == $EXP_PLACED"
check GET "/admin/orders?status=SHIPPED" "invalid status -> 400" 400 '.message | contains("Invalid status value")'

echo "--- PAGINATION ---"
check GET "/admin/orders?page=1&limit=2" "page1 limit2" 200 \
  ".pagination.page == 1 and .pagination.limit == 2 and .pagination.totalOrders == $EXP_TOTAL and
   .pagination.totalPages == $(( (EXP_TOTAL + 1) / 2 )) and (.orders | length) == 2"
P2_LEN=$((EXP_TOTAL - 2)); [ $P2_LEN -gt 2 ] && P2_LEN=2
check GET "/admin/orders?page=2&limit=2" "page2 remainder" 200 \
  ".pagination.page == 2 and (.orders | length) == $P2_LEN"
check GET "/admin/orders?limit=999" "limit capped at 50" 200 '.pagination.limit == 50'
check GET "/admin/orders?limit=abc" "limit garbage -> default 10" 200 '.pagination.limit == 10'
check GET "/admin/orders?page=0" "page 0 -> coerced to 1" 200 '.pagination.page == 1'
check GET "/admin/orders?status=PLACED&limit=1" "filter + pagination combined" 200 \
  ".pagination.totalOrders == $EXP_PLACED and .pagination.totalPages == $EXP_PLACED and (.orders | length) == 1"

echo "--- ADMIN SINGLE ORDER ---"
TOKEN=""
check GET "/admin/orders/$ORDER1" "no token -> 401" 401
TOKEN=$TOKEN_C
check GET "/admin/orders/$ORDER1" "customer -> 403" 403
TOKEN=$TOKEN_A
check GET "/admin/orders/$ORDER1" "admin single -> 200" 200 \
  '.data._id == "'"$ORDER1"'" and .data.user.name == "Admin Order Customer" and
   (.data.user | has("password") | not) and .data.total == 150 and (.data.items | length) == 1'
check GET "/admin/orders/bad-id" "invalid id -> 400" 400
check GET "/admin/orders/$GHOST" "unknown order -> 404" 404

echo "--- ADMIN STATUS UPDATE (reused Module 6 system) ---"
ADMIN_STATUS="/admin/orders/$ORDER1/status"
TOKEN=""
BODY='{"status":"CONFIRMED"}'
check PATCH "$ADMIN_STATUS" "no token -> 401" 401
TOKEN=$TOKEN_C
check PATCH "$ADMIN_STATUS" "customer -> 403" 403
TOKEN=$TOKEN_A
check PATCH "/admin/orders/bad-id/status" "invalid id -> 400" 400
check PATCH "/admin/orders/$GHOST/status" "unknown order -> 404" 404
BODY='{"status":"SHIPPED"}'
check PATCH "$ADMIN_STATUS" "invalid status -> 400" 400 '.message | contains("Invalid status value")'
BODY='{"status":"DELIVERED"}'
check PATCH "$ADMIN_STATUS" "invalid transition placed->delivered -> 400" 400 \
  '.message == "Cannot change status from placed to delivered"'
BODY='{"status":"CONFIRMED"}'
check PATCH "$ADMIN_STATUS" "CONFIRMED -> 200" 200 \
  '.data.status == "confirmed" and (.data.statusHistory | length) == 2'
BODY='{"status":"PREPARING"}'
check PATCH "$ADMIN_STATUS" "PREPARING -> 200 (2nd transition)" 200 \
  '.data.status == "preparing" and (.data.statusHistory | length) == 3'
BODY='{"status":"PREPARING"}'
check PATCH "$ADMIN_STATUS" "preparing->preparing rejected -> 400" 400 \
  '.message == "Cannot change status from preparing to preparing"'

echo "--- UNKNOWN ADMIN ROUTES ---"
BODY=""
TOKEN=""
check GET "/admin/nope" "unauthenticated unknown admin path -> 401" 401
TOKEN=$TOKEN_A
check GET "/admin/nope" "admin unknown path -> 404" 404

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && echo "MODULE 7: ALL TESTS PASSED" || echo "MODULE 7: FAILURES PRESENT"
