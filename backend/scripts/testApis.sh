#!/bin/bash
BASE="http://localhost:5000/api"
DB=local_market
PASS=0; FAIL=0
TMP=/tmp/opencode/body.json
BODY=""; TOKEN=""

req() { # req METHOD PATH
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

EMAIL="mod3$(date +%s)@example.com"
TOKEN=$(curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Module Three\",\"email\":\"$EMAIL\",\"phone\":\"9876543210\",\"password\":\"secret123\"}" | jq -r '.data.token')
[ -z "$TOKEN" ] || [ "$TOKEN" = "null" ] && { echo "FATAL: no token"; exit 1; }
mongosh --quiet $DB --eval "db.users.updateOne({email: '$EMAIL'}, {\$set: {role: 'admin'}})" >/dev/null
echo "token acquired: ${TOKEN:0:25}..."
SPICE=6ac695f9e5c9d8a1af1b049e
GHOST=6ac695f9e5c9d8a1ffffff00

echo "--- RESTAURANT READ (public) ---"
check GET "/restaurants" "GET list" 200 '.count >= 4 and .success == true'
check GET "/restaurants?search=spice" "search=spice" 200 '([.data[].name] | index("Spice Garden")) != null'
check GET "/restaurants?cuisine=Biryani" "cuisine filter" 200 '.count >= 1'
check GET "/restaurants?page=1&limit=2" "pagination" 200 '.count == 2 and .pages >= 2'
check GET "/restaurants/not-an-id" "bad id -> 400" 400
check GET "/restaurants/$GHOST" "missing id -> 404" 404
check GET "/restaurants/$SPICE" "GET by id" 200 '.data.name == "Spice Garden" and .data.rating == 4.7'
check GET "/restaurants/$SPICE/menu" "GET menu" 200 '.data.restaurant.name == "Spice Garden" and (.data.foods | length) >= 3'

echo "--- RESTAURANT WRITE (admin only) ---"
SAVED_TOKEN=$TOKEN
TOKEN=""
check POST "/admin/restaurants" "no token -> 401" 401
TOKEN=$SAVED_TOKEN
BODY='{"name":"Module Test Diner","description":"Testing module 3","cuisine":["Indian","Chinese"],"deliveryTime":25,"address":"9 Test Lane"}'
check POST "/admin/restaurants" "POST valid -> 201" 201 '.data.name == "Module Test Diner" and .data.deliveryFee == 30'
NEW_REST=$(jq -r '.data._id' "$TMP")
BODY='{"cuisine":["Indian"]}'
check POST "/admin/restaurants" "missing name -> 400" 400
BODY='{"name":"X","cuisine":"Indian","deliveryTime":20,"address":"a"}'
check POST "/admin/restaurants" "cuisine not array -> 400" 400
BODY='{"name":"X","cuisine":["Indian"],"address":"a"}'
check POST "/admin/restaurants" "no deliveryTime -> defaults to 30" 201 '.data.deliveryTime == 30'
BODY=""
TOKEN=""
check PUT "/admin/restaurants/$NEW_REST" "no token -> 401" 401
TOKEN=$SAVED_TOKEN
BODY='{"deliveryFee":49}'
check PUT "/admin/restaurants/$NEW_REST" "PUT update" 200 '.data.deliveryFee == 49'
BODY='{"role":"admin"}'
check PUT "/admin/restaurants/$NEW_REST" "unknown field rejected -> 400" 400
BODY='{}'
check PUT "/admin/restaurants/$NEW_REST" "empty body -> 400" 400
BODY=""
TOKEN=""
check DELETE "/admin/restaurants/$NEW_REST" "no token -> 401" 401
TOKEN=$SAVED_TOKEN
check DELETE "/admin/restaurants/$NEW_REST" "DELETE soft remove" 200 '.data.isActive == false'
BODY=""
check GET "/restaurants/$NEW_REST" "deleted -> 404" 404
check GET "/restaurants?search=Module" "deleted gone from list" 200 '.count == 0'

echo "--- FOOD READ (public) ---"
TOKEN=""
check GET "/foods" "GET /foods" 200 '.total == 12'
check GET "/foods?restaurant=$SPICE" "foods by restaurant" 200 '.count >= 3 and ([.data[].restaurant] | unique | length) == 1'
check GET "/foods?restaurant=bad-id" "bad restaurant id -> 400" 400
check GET "/foods?restaurant=$GHOST" "missing restaurant -> 404" 404
check GET "/foods?search=dosa" "search dosa" 200 '.count >= 1 and ([.data[].name] | index("Masala Dosa")) != null'
check GET "/foods?category=Biryani" "category filter" 200 '.count >= 1 and .data[0].category == "Biryani"'
check GET "/foods?isVeg=true" "veg filter" 200 '.count >= 1 and ([.data[].isVeg] | unique) == [true]'
check GET "/foods/bad-id" "food bad id -> 400" 400
check GET "/foods/$GHOST" "food missing -> 404" 404
FOOD_ID=$(curl -s "$BASE/foods?search=dosa" | jq -r '.data[] | select(.name == "Masala Dosa") | ._id')
check GET "/foods/$FOOD_ID" "GET food populated" 200 '.data.restaurant.name == "Spice Garden"'

echo "--- FOOD WRITE (admin only) ---"
TOKEN=""
check POST "/admin/foods" "no token -> 401" 401
TOKEN=$SAVED_TOKEN
BODY="{\"name\":\"Test kebab\",\"price\":150,\"category\":\"Starters\",\"restaurant\":\"$SPICE\",\"description\":\"module 3 test item\"}"
check POST "/admin/foods" "POST valid -> 201" 201 '.data.price == 150 and .data.isAvailable == true'
NEW_FOOD=$(jq -r '.data._id' "$TMP")
BODY='{"name":"X","price":10,"category":"Starters","restaurant":"bad-id"}'
check POST "/admin/foods" "bad rest id -> 400" 400
BODY="{\"name\":\"X\",\"price\":10,\"category\":\"Starters\",\"restaurant\":\"$GHOST\"}"
check POST "/admin/foods" "missing rest -> 400" 400
BODY="{\"name\":\"X\",\"price\":10,\"category\":\"Sushi\",\"restaurant\":\"$SPICE\"}"
check POST "/admin/foods" "invalid category -> 400" 400
BODY="{\"name\":\"X\",\"price\":-5,\"category\":\"Starters\",\"restaurant\":\"$SPICE\"}"
check POST "/admin/foods" "negative price -> 400" 400
BODY=""
TOKEN=""
check PUT "/admin/foods/$NEW_FOOD" "no token -> 401" 401
TOKEN=$SAVED_TOKEN
BODY='{"price":175}'
check PUT "/admin/foods/$NEW_FOOD" "PUT price" 200 '.data.price == 175'
BODY='{"price":0}'
check PUT "/admin/foods/$NEW_FOOD" "PUT price 0 rejected" 400
BODY='{"hacked":true}'
check PUT "/admin/foods/$NEW_FOOD" "unknown field -> 400" 400
BODY=""
TOKEN=""
check DELETE "/admin/foods/$NEW_FOOD" "no token -> 401" 401
TOKEN=$SAVED_TOKEN
check DELETE "/admin/foods/$NEW_FOOD" "DELETE soft" 200 '.data.isAvailable == false'
BODY=""
check GET "/foods/$NEW_FOOD" "deleted food GET -> 404" 404
check GET "/foods?search=Test" "deleted food not in list" 200 '.count == 0'
BODY='{"isAvailable":true}'
check PUT "/admin/foods/$NEW_FOOD" "restore food" 200 '.data.isAvailable == true'
BODY=""
check GET "/foods?search=Test" "restored food visible" 200 '.count == 1'
BODY=""
check DELETE "/admin/foods/$NEW_FOOD" "remove test food again" 200

echo "--- ERROR HANDLING ---"
TOKEN=""; BODY=""
check GET "/nope" "unknown route -> 404" 404
BODY='{"name": broken json'
check POST "/admin/restaurants" "invalid JSON -> 400" 400
BODY=""
check GET "/foods?limit=999" "limit capped" 200 '.count <= 50'

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && echo "MODULE 3: ALL TESTS PASSED" || echo "MODULE 3: FAILURES PRESENT"
