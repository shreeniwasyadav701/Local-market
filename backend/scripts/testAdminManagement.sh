#!/bin/bash
BASE="http://localhost:5000/api"
DB=local_market
PASS=0; FAIL=0
TMP=/tmp/opencode/adminm_body.json
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
    FAIL=$((FAIL+1)); echo "FAIL  $label (expected $expected, got $got)"; head -c 300 "$TMP"; echo
  fi
}

json_field() { jq -r "$1" "$TMP"; }

# --- setup ---
SUF=$(date +%s)
ADMIN_EMAIL="mod8admin$SUF@example.com"
CUST_EMAIL="mod8cust$SUF@example.com"
TOKEN_A=$(curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Kitchen Admin\",\"email\":\"$ADMIN_EMAIL\",\"phone\":\"9876543216\",\"password\":\"secret123\"}" | jq -r '.data.token')
TOKEN_C=$(curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Kitchen Customer\",\"email\":\"$CUST_EMAIL\",\"phone\":\"9876543217\",\"password\":\"secret123\"}" | jq -r '.data.token')
[ -z "$TOKEN_A" ] || [ "$TOKEN_A" = "null" ] && { echo "FATAL: no token"; exit 1; }
mongosh --quiet $DB --eval "db.users.updateOne({email: '$ADMIN_EMAIL'}, {\$set: {role: 'admin'}})" >/dev/null

TOKEN=$TOKEN_A
req GET "/admin/restaurants" >/dev/null; R_TOTAL=$(jq -r '.pagination.totalItems' "$TMP")
req GET "/admin/foods" >/dev/null; F_TOTAL=$(jq -r '.pagination.totalItems' "$TMP")
EXP_R=$((R_TOTAL + 2)); EXP_R_PAGES=$(( (EXP_R + 9) / 10 )); EXP_R2_PAGES=$(( (EXP_R + 1) / 2 ))
EXP_F=$((F_TOTAL + 2)); EXP_F_PAGES=$(( (EXP_F + 9) / 10 ))
SPICE=6ac695f9e5c9d8a1af1b049e
GHOST=6ac695f9e5c9d8a1ffffff00
echo "baselines: restaurants=$R_TOTAL foods=$F_TOTAL"

echo "--- RESTAURANT CREATE ---"
TOKEN=$TOKEN_A
BODY='{"name":"Local Spice Kitchen","description":"Fresh local food","address":"Chennai","image":"image-url"}'
check POST "/admin/restaurants" "spec example -> 201" 201 \
  '.data.name == "Local Spice Kitchen" and .data.address == "Chennai" and
   .data.deliveryTime == 30 and .data.isActive == true and .data.isOpen == true and
   (.data | has("cuisine"))'
REST_A=$(json_field '.data._id')
BODY='{"address":"No Name Road"}'
check POST "/admin/restaurants" "missing name -> 400" 400
BODY='{"name":"No Address Place"}'
check POST "/admin/restaurants" "missing address -> 400" 400
BODY='{"name":"X","address":"Y","cuisine":"Indian"}'
check POST "/admin/restaurants" "cuisine not array -> 400" 400
BODY='{"name":"Field Filter Test","address":"9 Test Nagar","hacked":true,"isAdmin":true}'
check POST "/admin/restaurants" "arbitrary fields ignored -> 201" 201 '(.data | has("hacked") | not) and (.data | has("isAdmin") | not)'
REST_B=$(json_field '.data._id')
BODY=""

echo "--- RESTAURANT LIST: AUTH + SEARCH + PAGINATION ---"
TOKEN=""
check GET "/admin/restaurants" "no token -> 401" 401
TOKEN=$TOKEN_C
check GET "/admin/restaurants" "customer -> 403" 403
TOKEN=$TOKEN_A
check GET "/admin/restaurants" "admin list shape" 200 \
  ".pagination.page == 1 and .pagination.limit == 10 and .pagination.totalItems == $EXP_R and
   .pagination.totalPages == $EXP_R_PAGES and
   ([.. | objects | select(has(\"password\"))] | length) == 0"
check GET "/admin/restaurants?search=Local%20Spice" "search by name" 200 '.count >= 1'
check GET "/admin/restaurants?search=local%20spice" "search case-insensitive input" 200 '.count >= 1'
check GET "/admin/restaurants?search=C%2B%2B" "regex metacharacters safe -> 200" 200 '.success == true'
check GET "/admin/restaurants?limit=999" "limit capped 50" 200 '.pagination.limit == 50'
check GET "/admin/restaurants?limit=abc" "limit garbage -> 10" 200 '.pagination.limit == 10'
check GET "/admin/restaurants?page=0" "page 0 -> 1" 200 '.pagination.page == 1'
check GET "/admin/restaurants?page=1&limit=2" "page1 limit2" 200 \
  ".pagination.totalItems == $EXP_R and .pagination.totalPages == $EXP_R2_PAGES and (.restaurants | length) == 2"

echo "--- RESTAURANT SINGLE ---"
TOKEN=$TOKEN_C
check GET "/admin/restaurants/$REST_A" "customer -> 403" 403
TOKEN=$TOKEN_A
check GET "/admin/restaurants/$REST_A" "admin details + foods" 200 \
  '.data.restaurant.name == "Local Spice Kitchen" and (.data.foods | type) == "array"'
check GET "/admin/restaurants/bad-id" "invalid id -> 400" 400
check GET "/admin/restaurants/$GHOST" "unknown -> 404" 404

echo "--- RESTAURANT UPDATE ---"
BODY='{"deliveryFee":49}'
check PUT "/admin/restaurants/$REST_A" "update deliveryFee -> 200" 200 '.data.deliveryFee == 49'
BODY='{"name":"Local Spice Kitchen Renamed"}'
check PUT "/admin/restaurants/$REST_A" "update name -> 200" 200 '.data.name == "Local Spice Kitchen Renamed"'
BODY='{}'
check PUT "/admin/restaurants/$REST_A" "empty body -> 400" 400
BODY='{"name":"   "}'
check PUT "/admin/restaurants/$REST_A" "blank name -> 400" 400
BODY='{"isActive":false,"rating":4.5}'
check PUT "/admin/restaurants/$REST_A" "isActive stripped by whitelist" 200 \
  '.data.isActive == true and .data.rating == 4.5'
BODY='{"deliveryFee":30}'
check PUT "/admin/restaurants/$GHOST" "unknown -> 404" 404
TOKEN=$TOKEN_C
check PUT "/admin/restaurants/$REST_A" "customer -> 403" 403
TOKEN=$TOKEN_A; BODY=""

echo "--- RESTAURANT ACTIVE/INACTIVE ---"
BODY='{"status":"PAUSED"}'
check PATCH "/admin/restaurants/$REST_B/status" "invalid status -> 400" 400 '.message | contains("ACTIVE, INACTIVE")'
BODY='{}'
check PATCH "/admin/restaurants/$REST_B/status" "missing body -> 400" 400
BODY='{"status":"INACTIVE"}'
check PATCH "/admin/restaurants/$REST_B/status" "INACTIVE -> 200" 200 '.data.isActive == false'
TOKEN=$TOKEN_C; BODY=""
check GET "/restaurants/$REST_B" "customer cannot see inactive -> 404" 404
check GET "/restaurants?search=Field%20Filter" "hidden from customer list -> 0" 200 '.count == 0'
TOKEN=$TOKEN_A
BODY='{"status":"active"}'
check PATCH "/admin/restaurants/$REST_B/status" "lowercase active -> 200" 200 '.data.isActive == true'
BODY='{"isActive":false}'
check PATCH "/admin/restaurants/$REST_B/status" "boolean form -> 200" 200 '.data.isActive == false'
BODY='{"isActive":true}'
check PATCH "/admin/restaurants/$REST_B/status" "reactivate -> 200" 200 '.data.isActive == true'
BODY='{"status":"INACTIVE"}'
check PATCH "/admin/restaurants/$GHOST/status" "unknown -> 404" 404
TOKEN=$TOKEN_C
check PATCH "/admin/restaurants/$REST_B/status" "customer -> 403" 403
TOKEN=""; BODY='{"status":"INACTIVE"}'
check PATCH "/admin/restaurants/$REST_B/status" "no token -> 401" 401
TOKEN=$TOKEN_A; BODY=""

echo "--- RESTAURANT DELETE (soft) ---"
TOKEN=""
check DELETE "/admin/restaurants/$REST_A" "no token -> 401" 401
TOKEN=$TOKEN_C
check DELETE "/admin/restaurants/$REST_A" "customer -> 403" 403
TOKEN=$TOKEN_A
check DELETE "/admin/restaurants/$GHOST" "unknown -> 404" 404
check DELETE "/admin/restaurants/$REST_A" "soft delete -> 200" 200 '.data.isActive == false and .data.foodsKept == 0'
check DELETE "/admin/restaurants/$REST_A" "second delete idempotent -> 200" 200 '.message | contains("already")'
check GET "/admin/restaurants/$REST_A" "admin still sees removed -> 200" 200 '.data.restaurant.isActive == false'
TOKEN=$TOKEN_C
check GET "/restaurants/$REST_A" "customer cannot see removed -> 404" 404
TOKEN=$TOKEN_A
check GET "/admin/restaurants?search=Local%20Spice" "admin list shows inactive record" 200 \
  '.count >= 1 and .restaurants[0].isActive == false'

echo "--- FOOD CREATE (spec example) ---"
BODY="{\"name\":\"Chicken Pizza\",\"description\":\"Fresh chicken pizza\",\"price\":249,\"category\":\"Pizza\",\"restaurantId\":\"$SPICE\",\"image\":\"image-url\"}"
check POST "/admin/foods" "spec example -> 201" 201 \
  '.data.price == 249 and .data.category == "Pizza" and .data.isAvailable == true and .data.restaurant == "'"$SPICE"'"'
FOOD_PIZZA=$(json_field '.data._id')
BODY='{"price":100,"category":"Snacks","restaurantId":"'"$SPICE"'"}'
check POST "/admin/foods" "missing name -> 400" 400
BODY='{"name":"No Price","category":"Snacks","restaurantId":"'"$SPICE"'"}'
check POST "/admin/foods" "missing price -> 400" 400
BODY='{"name":"Zero","price":0,"category":"Snacks","restaurantId":"'"$SPICE"'"}'
check POST "/admin/foods" "price 0 -> 400" 400 '.message | contains("price must be a number and at least 1")'
BODY='{"name":"Neg","price":-5,"category":"Snacks","restaurantId":"'"$SPICE"'"}'
check POST "/admin/foods" "negative price -> 400" 400
BODY='{"name":"Str","price":"abc","category":"Snacks","restaurantId":"'"$SPICE"'"}'
check POST "/admin/foods" "string price -> 400" 400
BODY='{"name":"Bad Cat","price":99,"category":"Sushi","restaurantId":"'"$SPICE"'"}'
check POST "/admin/foods" "invalid category still rejected -> 400" 400
BODY='{"name":"No Rest","price":99,"category":"Snacks"}'
check POST "/admin/foods" "missing restaurantId -> 400" 400
BODY='{"name":"Bad Rest","price":99,"category":"Snacks","restaurantId":"not-an-id"}'
check POST "/admin/foods" "invalid restaurantId -> 400" 400
BODY="{\"name\":\"Ghost Rest\",\"price\":99,\"category\":\"Snacks\",\"restaurantId\":\"$GHOST\"}"
check POST "/admin/foods" "unknown restaurant -> 400" 400 '.message | contains("does not exist")'
TOKEN=""
BODY='{"name":"X","price":10,"category":"Snacks","restaurantId":"'"$SPICE"'"}'
check POST "/admin/foods" "no token -> 401" 401
TOKEN=$TOKEN_C
check POST "/admin/foods" "customer -> 403" 403
TOKEN=$TOKEN_A
BODY="{\"name\":\"Field Filter Food\",\"price\":50,\"category\":\"Snacks\",\"restaurantId\":\"$SPICE\",\"foo\":\"bar\"}"
check POST "/admin/foods" "arbitrary field ignored -> 201" 201 '(.data | has("foo") | not)'
FOOD_FF=$(json_field '.data._id')
BODY=""

echo "--- FOOD LIST: SEARCH + PAGINATION ---"
TOKEN=$TOKEN_C
check GET "/admin/foods" "customer -> 403" 403
TOKEN=$TOKEN_A
check GET "/admin/foods" "admin list shape" 200 \
  ".pagination.page == 1 and .pagination.limit == 10 and .pagination.totalItems == $EXP_F and
   .pagination.totalPages == $EXP_F_PAGES"
check GET "/admin/foods?search=chicken" "search lowercase input" 200 \
  '([.foods[].name] | index("Chicken Pizza")) != null'
check GET "/admin/foods?search=CHICKEN" "search uppercase input" 200 \
  '([.foods[].name] | index("Chicken Pizza")) != null'
check GET "/admin/foods?search=C%2B%2B" "regex metacharacters safe" 200 '.success == true'
check GET "/admin/foods?restaurantId=$SPICE" "filter by restaurant" 200 \
  '.count >= 3 and ([.foods[].restaurant] | unique) == ["'"$SPICE"'"]'
check GET "/admin/foods?restaurantId=not-an-id" "bad restaurantId -> 400" 400
check GET "/admin/foods?restaurantId=$GHOST" "unknown restaurant -> 404" 404
check GET "/admin/foods?limit=999" "limit capped 50" 200 '.pagination.limit == 50'
check GET "/admin/foods?limit=abc" "limit garbage -> 10" 200 '.pagination.limit == 10'
check GET "/admin/foods?page=1&limit=3" "page1 limit3" 200 \
  ".pagination.totalItems == $EXP_F and (.foods | length) == 3"

echo "--- FOOD SINGLE ---"
TOKEN=$TOKEN_C
check GET "/admin/foods/$FOOD_PIZZA" "customer -> 403" 403
TOKEN=$TOKEN_A
check GET "/admin/foods/$FOOD_PIZZA" "admin single + populated restaurant" 200 \
  '.data.name == "Chicken Pizza" and .data.price == 249 and .data.restaurant.name == "Spice Garden"'
check GET "/admin/foods/bad-id" "invalid id -> 400" 400
check GET "/admin/foods/$GHOST" "unknown -> 404" 404

echo "--- FOOD UPDATE ---"
BODY='{"price":259}'
check PUT "/admin/foods/$FOOD_PIZZA" "update price -> 200" 200 '.data.price == 259'
BODY='{"price":0}'
check PUT "/admin/foods/$FOOD_PIZZA" "price 0 -> 400" 400
BODY='{"price":"abc"}'
check PUT "/admin/foods/$FOOD_PIZZA" "string price -> 400" 400
BODY='{"category":"Sushi"}'
check PUT "/admin/foods/$FOOD_PIZZA" "invalid category -> 400" 400
BODY="{\"restaurantId\":\"$GHOST\"}"
check PUT "/admin/foods/$FOOD_PIZZA" "unknown restaurant -> 400" 400
BODY='{"foo":1}'
check PUT "/admin/foods/$FOOD_PIZZA" "unknown-only fields -> 400" 400
BODY='{"price":249}'
check PUT "/admin/foods/$GHOST" "unknown -> 404" 404
TOKEN=$TOKEN_C
check PUT "/admin/foods/$FOOD_PIZZA" "customer -> 403" 403
TOKEN=$TOKEN_A; BODY=""

echo "--- FOOD AVAILABILITY ---"
BODY='{"status":"MAYBE"}'
check PATCH "/admin/foods/$FOOD_PIZZA/status" "invalid status -> 400" 400
BODY='{}'
check PATCH "/admin/foods/$FOOD_PIZZA/status" "empty body -> 400" 400
BODY='{"isAvailable":"yes"}'
check PATCH "/admin/foods/$FOOD_PIZZA/status" "non-boolean -> 400" 400
BODY='{"isAvailable":false}'
check PATCH "/admin/foods/$FOOD_PIZZA/status" "isAvailable false -> 200" 200 '.data.isAvailable == false'
TOKEN=$TOKEN_C; BODY=""
check GET "/foods/$FOOD_PIZZA" "customer cannot see unavailable -> 404" 404
check GET "/foods?search=Chicken%20Pizza" "hidden from customer list -> 0" 200 '.count == 0'
TOKEN=$TOKEN_A
BODY='{"status":"AVAILABLE"}'
check PATCH "/admin/foods/$FOOD_PIZZA/status" "AVAILABLE form -> 200" 200 '.data.isAvailable == true'
BODY='{"status":"UNAVAILABLE"}'
check PATCH "/admin/foods/$FOOD_PIZZA/status" "UNAVAILABLE form -> 200" 200 '.data.isAvailable == false'
BODY='{"isAvailable":true}'
check PATCH "/admin/foods/$FOOD_PIZZA/status" "restore -> 200" 200 '.data.isAvailable == true'
BODY='{"status":"UNAVAILABLE"}'
check PATCH "/admin/foods/$GHOST/status" "unknown -> 404" 404
TOKEN=$TOKEN_C
check PATCH "/admin/foods/$FOOD_PIZZA/status" "customer -> 403" 403
TOKEN=""; BODY='{"status":"UNAVAILABLE"}'
check PATCH "/admin/foods/$FOOD_PIZZA/status" "no token -> 401" 401
TOKEN=$TOKEN_A; BODY=""

echo "--- FOOD DELETE (soft) ---"
TOKEN=""
check DELETE "/admin/foods/$FOOD_FF" "no token -> 401" 401
TOKEN=$TOKEN_C
check DELETE "/admin/foods/$FOOD_FF" "customer -> 403" 403
TOKEN=$TOKEN_A
check DELETE "/admin/foods/$GHOST" "unknown -> 404" 404
check DELETE "/admin/foods/$FOOD_FF" "soft delete -> 200" 200 '.data.isAvailable == false'
check DELETE "/admin/foods/$FOOD_FF" "second delete idempotent -> 200" 200 '.message | contains("already")'
check GET "/admin/foods/$FOOD_FF" "admin still sees removed -> 200" 200 '.data.isAvailable == false'
TOKEN=$TOKEN_C
check GET "/foods/$FOOD_FF" "customer cannot see removed -> 404" 404

echo "--- DATA SAFETY: orders survive food deletion ---"
TOKEN=$TOKEN_A
BODY="{\"name\":\"Data Safety Food\",\"price\":77,\"category\":\"Snacks\",\"restaurantId\":\"$SPICE\"}"
req POST "/admin/foods" >/dev/null
DS=$(json_field '.data._id')
TOKEN=$TOKEN_C
BODY="{\"foodId\":\"$DS\"}"
check POST "/cart" "cart holds snapshot price 77" 201 '.data.items[0].price == 77'
BODY="{\"customerName\":\"Kitchen Customer\",\"phone\":\"9876543217\",\"address\":\"3 Safety Street\"}"
check POST "/orders" "order placed -> 201" 201 '.data.total == 107 and .data.items[0].price == 77'
ORDER_X=$(json_field '.data._id')
TOKEN=$TOKEN_A; BODY=""
check DELETE "/admin/foods/$DS" "admin removes ordered food" 200 '.data.isAvailable == false'
TOKEN=$TOKEN_C
check GET "/orders/$ORDER_X" "order history intact after food deletion" 200 \
  '.data.items[0].name == "Data Safety Food" and .data.items[0].price == 77 and .data.total == 107'
check GET "/foods?search=Data%20Safety" "removed food hidden from customers" 200 '.count == 0'

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && echo "MODULE 8: ALL TESTS PASSED" || echo "MODULE 8: FAILURES PRESENT"
