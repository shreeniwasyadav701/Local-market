#!/bin/bash
BASE="http://localhost:5000/api"
DB=local_market
PASS=0; FAIL=0
TMP=/tmp/opencode/cart_body.json
BODY=""; TOKEN=""

req() {
  local method=$1 path=$2
  local args=(-s -o "$TMP" -w "%{http_code}" -X "$method" "$BASE$path" -H "Content-Type: application/json")
  [ -n "$TOKEN" ] && args+=(-H "Authorization: Bearer $TOKEN")
  [ -n "$BODY" ] && args+=(-d "$BODY")
  curl "${args[@]}"
}

check() { # check METHOD PATH LABEL EXPECTED [jq_assertion]
  local method=$1 path=$2 label=$3 expected=$4 assert=$5 got ok=1
  got=$(req "$method" "$path")
  [ "$got" != "$expected" ] && ok=0
  if [ -n "$assert" ]; then
    jq -e "$assert" "$TMP" >/dev/null 2>&1 || ok=0
  fi
  if [ $ok -eq 1 ]; then
    PASS=$((PASS+1)); echo "PASS  $label ($got)"
  else
    FAIL=$((FAIL+1)); echo "FAIL  $label (expected $expected, got $got)"; head -c 300 "$TMP"; echo
  fi
}

# --- setup ---
SUF=$(date +%s)
TOKEN_A=$(curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Cart User A\",\"email\":\"mod4a$SUF@example.com\",\"phone\":\"9876543210\",\"password\":\"secret123\"}" | jq -r '.data.token')
TOKEN_B=$(curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Cart User B\",\"email\":\"mod4b$SUF@example.com\",\"phone\":\"9876543211\",\"password\":\"secret123\"}" | jq -r '.data.token')
[ -z "$TOKEN_A" ] || [ "$TOKEN_A" = "null" ] && { echo "FATAL: no token"; exit 1; }
mongosh --quiet $DB --eval "db.users.updateOne({email: 'mod4a$SUF@example.com'}, {\$set: {role: 'admin'}})" >/dev/null
TOKEN=$TOKEN_A
echo "tokens acquired"

DOSA=$(curl -s "$BASE/foods?search=dosa" | jq -r '.data[] | select(.name == "Masala Dosa") | ._id')
BIRYANI=$(curl -s "$BASE/foods?search=Chicken%20Biryani" | jq -r '.data[] | select(.name == "Chicken Biryani") | ._id')
SPICE=6ac695f9e5c9d8a1af1b049e
GHOST=6ac695f9e5c9d8a1ffffff00
echo "dosa=$DOSA biryani=$BIRYANI"

echo "--- GET CART ---"
TOKEN="" BODY=""
check GET "/cart" "no token -> 401" 401
TOKEN=$TOKEN_A
check GET "/cart" "fresh cart is empty summary" 200 \
  '.data.items == [] and .data.itemCount == 0 and .data.subtotal == 0 and .data.deliveryCharge == 0 and .data.total == 0'

echo "--- ADD TO CART ---"
TOKEN=""
check POST "/cart" "add no token -> 401" 401
TOKEN=$TOKEN_A
BODY='{}'
check POST "/cart" "missing foodId -> 400" 400
BODY='{"foodId":"bad-id"}'
check POST "/cart" "invalid foodId -> 400" 400
BODY="{\"foodId\":\"$GHOST\"}"
check POST "/cart" "unknown food -> 404" 404
BODY="{\"foodId\":\"$DOSA\"}"
check POST "/cart" "add dosa -> 201" 201 \
  '.data.itemCount == 1 and .data.subtotal == 120 and .data.deliveryCharge == 30 and .data.total == 150'
BODY="{\"foodId\":\"$DOSA\"}"
check POST "/cart" "add dosa again -> 200 qty2" 200 \
  '.data.items[0].quantity == 2 and .data.itemCount == 2 and .data.subtotal == 240 and .data.total == 270'
BODY="{\"foodId\":\"$DOSA\",\"quantity\":0}"
check POST "/cart" "quantity 0 -> 400" 400
BODY="{\"foodId\":\"$DOSA\",\"quantity\":\"abc\"}"
check POST "/cart" "quantity abc -> 400" 400
BODY="{\"foodId\":\"$BIRYANI\"}"
check POST "/cart" "add biryani -> free delivery" 201 \
  '.data.itemCount == 3 and .data.subtotal == 520 and .data.deliveryCharge == 0 and .data.total == 520'

DOSA_ITEM=$(jq -r '.data.items[] | select(.name == "Masala Dosa") | ._id' "$TMP")
BIRYANI_ITEM=$(jq -r '.data.items[] | select(.name == "Chicken Biryani") | ._id' "$TMP")
echo "item ids: dosa=$DOSA_ITEM biryani=$BIRYANI_ITEM"

echo "--- UPDATE QUANTITY ---"
TOKEN=""
check PUT "/cart/$DOSA_ITEM" "no token -> 401" 401
TOKEN=$TOKEN_A
BODY='{"quantity":3}'
check PUT "/cart/bad-id" "invalid item id -> 400" 400
BODY="{\"quantity\":3}"
check PUT "/cart/$GHOST" "unknown item -> 404" 404
BODY='{"quantity":3}'
check PUT "/cart/$DOSA_ITEM" "set dosa qty 3" 200 \
  '.data.subtotal == 640 and .data.deliveryCharge == 0 and .data.total == 640'
BODY='{"quantity":0}'
check PUT "/cart/$DOSA_ITEM" "quantity 0 -> 400" 400
BODY='{"quantity":51}'
check PUT "/cart/$DOSA_ITEM" "quantity 51 -> 400" 400
BODY='{}'
check PUT "/cart/$DOSA_ITEM" "missing quantity -> 400" 400
BODY='{"quantity":1}'
check PUT "/cart/$DOSA_ITEM" "set dosa qty 1 (drops below free delivery)" 200 \
  '.data.subtotal == 400 and .data.deliveryCharge == 30 and .data.total == 430'

echo "--- REMOVE ITEM ---"
TOKEN=""
check DELETE "/cart/$DOSA_ITEM" "remove no token -> 401" 401
TOKEN=$TOKEN_A
BODY=""
check DELETE "/cart/$GHOST" "unknown item -> 404" 404
check DELETE "/cart/$DOSA_ITEM" "remove dosa" 200 \
  '.data.itemCount == 1 and .data.subtotal == 280 and .data.deliveryCharge == 30 and .data.total == 310'

echo "--- CROSS-USER PROTECTION ---"
TOKEN=$TOKEN_B
BODY=""
check DELETE "/cart/$BIRYANI_ITEM" "user B cannot delete user A item -> 404" 404
check PUT "/cart/$BIRYANI_ITEM" "user B empty body -> 400 (validation before lookup)" 400
BODY='{"quantity":5}'
check PUT "/cart/$BIRYANI_ITEM" "user B PUT with body -> 404" 404
BODY=""

echo "--- UNAVAILABLE FOOD ---"
TOKEN=$TOKEN_A
BODY="{\"name\":\"Cart Temp Item\",\"price\":99,\"category\":\"Snacks\",\"restaurant\":\"$SPICE\"}"
check POST "/admin/foods" "create temp food" 201
TEMP_FOOD=$(jq -r '.data._id' "$TMP")
BODY=""
check DELETE "/admin/foods/$TEMP_FOOD" "soft-delete temp food" 200
BODY="{\"foodId\":\"$TEMP_FOOD\"}"
check POST "/cart" "add unavailable food -> 404" 404
BODY=""

echo "--- CLEAR CART ---"
check DELETE "/cart" "clear cart" 200 '.data.items == [] and .data.subtotal == 0 and .data.total == 0'
check DELETE "/cart" "clear again idempotent" 200 '.data.items == []'
check GET "/cart" "cart stays empty" 200 '.data.items == [] and .data.itemCount == 0'

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && echo "MODULE 4: ALL TESTS PASSED" || echo "MODULE 4: FAILURES PRESENT"
