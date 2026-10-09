#!/bin/bash
BASE="http://localhost:5000/api"
DB=local_market
PASS=0; FAIL=0
TMP=/tmp/opencode/favorites_body.json
BODY=""; TOKEN=""

req() {
  local method=$1 path=$2
  local args=(-g -s -o "$TMP" -w "%{http_code}" -X "$method" "$BASE$path" -H "Content-Type: application/json")
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

food_id() { # food_id searchterm exactname
  curl -s "$BASE/foods?search=$1" | jq -r --arg n "$2" '.data[] | select(.name == $n) | ._id'
}

# --- setup ---
SUF=$(date +%s)
A_EMAIL="mod10a$SUF@example.com"
B_EMAIL="mod10b$SUF@example.com"
ADM_EMAIL="mod10adm$SUF@example.com"
register() {
  curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
    -d "{\"name\":\"$1\",\"email\":\"$2\",\"phone\":\"$3\",\"password\":\"secret123\"}" | jq -r '.data.token'
}
TOKEN_A=$(register "Favorites User A" "$A_EMAIL" "9876543220")
TOKEN_B=$(register "Favorites User B" "$B_EMAIL" "9876543221")
TOKEN_ADM=$(register "Favorites Admin" "$ADM_EMAIL" "9876543222")
[ -z "$TOKEN_A" ] || [ "$TOKEN_A" = "null" ] && { echo "FATAL: no token A"; exit 1; }
[ -z "$TOKEN_B" ] || [ "$TOKEN_B" = "null" ] && { echo "FATAL: no token B"; exit 1; }
[ -z "$TOKEN_ADM" ] || [ "$TOKEN_ADM" = "null" ] && { echo "FATAL: no token admin"; exit 1; }
mongosh --quiet $DB --eval "db.users.updateOne({email: '$ADM_EMAIL'}, {\$set: {role: 'admin'}})" >/dev/null

SPICE=6ac695f9e5c9d8a1af1b049e
GHOST=6ac695f9e5c9d8a1ffffff00

TOKEN=""; BODY=""
req GET "/restaurants" >/dev/null; R_BASE=$(jq -r '.pagination.totalItems' "$TMP")
req GET "/foods?limit=50" >/dev/null; F_BASE=$(jq -r '.pagination.totalItems' "$TMP")

DOSA=$(food_id dosa "Masala Dosa")
PANEER=$(food_id paneer "Paneer Butter Masala")
BIRYANI=$(food_id biryani "Chicken Biryani")
NAAN=$(food_id naan "Butter Naan")
BROWNIE=$(food_id brownie "Chocolate Brownie")
TANDOORI=$(food_id tandoori "Tandoori Chicken")
COFFEE=$(food_id coffee "Cold Coffee")
for id in "$DOSA" "$PANEER" "$BIRYANI" "$NAAN" "$BROWNIE" "$TANDOORI" "$COFFEE"; do
  [ -z "$id" ] || [ "$id" = "null" ] && { echo "FATAL: seed food lookup failed"; exit 1; }
done
echo "baselines: restaurants=$R_BASE foods=$F_BASE"

# --- admin temp data: unavailable food, closed restaurant, orphan food ---
TOKEN=$TOKEN_ADM
BODY='{"name":"Fav Unavailable Item","price":60,"category":"Snacks","restaurantId":"'"$SPICE"'"}'
req POST "/admin/foods" >/dev/null; FU=$(json_field '.data._id')
BODY='{"name":"Fav Closed Diner","cuisine":["Indian"],"deliveryTime":20,"address":"2 Closed Street"}'
req POST "/admin/restaurants" >/dev/null; FR=$(json_field '.data._id')
BODY='{"name":"Fav Closed Food","price":55,"category":"Snacks","restaurantId":"'"$FR"'"}'
req POST "/admin/foods" >/dev/null; FC=$(json_field '.data._id')
BODY='{"name":"Fav Orphan Diner","cuisine":["Indian"],"deliveryTime":20,"address":"3 Orphan Street"}'
req POST "/admin/restaurants" >/dev/null; FO=$(json_field '.data._id')
BODY='{"name":"Fav Orphan Food","price":65,"category":"Snacks","restaurantId":"'"$FO"'"}'
req POST "/admin/foods" >/dev/null; FOR=$(json_field '.data._id')
BODY='{"status":"UNAVAILABLE"}'; req PATCH "/admin/foods/$FU/status" >/dev/null
BODY='{"status":"INACTIVE"}'; req PATCH "/admin/restaurants/$FR/status" >/dev/null
BODY=""; TOKEN=""
mongosh --quiet $DB --eval "db.restaurants.deleteOne({_id: ObjectId('$FO')})" >/dev/null

echo "--- FEATURE 7: AUTH REQUIRED (401) ---"
check POST "/favorites/$DOSA" "add no token -> 401" 401
check GET "/favorites" "list no token -> 401" 401
check DELETE "/favorites" "clear no token -> 401" 401
check DELETE "/favorites/$DOSA" "remove no token -> 401" 401
check GET "/favorites/$DOSA/status" "status no token -> 401" 401

echo "--- FEATURE 2: ADD TO FAVORITES (user A) ---"
TOKEN=$TOKEN_A
check POST "/favorites/$DOSA" "add Masala Dosa -> 201" 201 \
  '.success == true and .message == "Food added to favorites"'
check POST "/favorites/$DOSA" "duplicate add -> 409" 409 '.message | contains("already in favorites")'
check POST "/favorites/bad-id" "invalid foodId -> 400" 400
check POST "/favorites/$GHOST" "unknown food -> 404" 404
check POST "/favorites/$FU" "unavailable food -> 404" 404 '.message | contains("unavailable")'
check POST "/favorites/$FC" "inactive restaurant -> 400" 400 '.message | contains("not accepting orders")'
check POST "/favorites/$FOR" "missing restaurant -> 404" 404 '.message | contains("Restaurant not found")'
TOKEN=$TOKEN_B
check POST "/favorites/$PANEER" "user B adds Paneer -> 201" 201

echo "--- FEATURE 3: GET FAVORITES ---"
TOKEN=$TOKEN_A
check GET "/favorites" "A list shape + populated fields" 200 \
  '.data[0].food.name == "Masala Dosa" and .data[0].food.price == 120 and
   .data[0].food.category == "Main Course" and (.data[0].food | has("image")) and
   (.data[0].food | has("description")) and .data[0].food.isAvailable == true and
   .data[0].food.restaurant.name == "Spice Garden" and
   (.data[0] | has("createdAt"))'
check GET "/favorites" "no user id / no sensitive fields exposed" 200 \
  '([.data[] | select(has("user"))] | length) == 0 and ([.. | objects | select(has("password"))] | length) == 0'
check GET "/favorites" "A does not see B favorites" 200 \
  '([.data[].food.name] | index("Paneer Butter Masala")) == null and .pagination.totalItems == 1'
TOKEN=$TOKEN_B
check GET "/favorites" "B list isolated: only Paneer" 200 \
  '.pagination.totalItems == 1 and .data[0].food.name == "Paneer Butter Masala"'

echo "--- FEATURE 5: STATUS CHECK ---"
TOKEN=$TOKEN_A
check GET "/favorites/$DOSA/status" "A status true" 200 \
  '.isFavorite == true and (. | keys | sort) == ["isFavorite", "success"]'
TOKEN=$TOKEN_B
check GET "/favorites/$DOSA/status" "B status false for A favorite" 200 '.isFavorite == false'
TOKEN=$TOKEN_A
check GET "/favorites/$GHOST/status" "valid-format unknown food -> false" 200 '.isFavorite == false'
check GET "/favorites/bad-id/status" "invalid foodId -> 400" 400

echo "--- FEATURE 4: REMOVE (scoped to own list) ---"
TOKEN=$TOKEN_B
check DELETE "/favorites/$DOSA" "B cannot remove A favorite -> 404" 404 '.message | contains("Favorite not found")'
TOKEN=$TOKEN_A
check GET "/favorites/$DOSA/status" "A favorite untouched by B" 200 '.isFavorite == true'
check DELETE "/favorites/$PANEER" "A cannot remove B favorite -> 404" 404
TOKEN=$TOKEN_B
check GET "/favorites/$PANEER/status" "B favorite untouched by A" 200 '.isFavorite == true'
TOKEN=$TOKEN_A
check DELETE "/favorites/$DOSA" "A removes own favorite -> 200" 200 '.message == "Food removed from favorites"'
check GET "/favorites/$DOSA/status" "status false after remove" 200 '.isFavorite == false'
check DELETE "/favorites/$DOSA" "second remove -> 404" 404
check DELETE "/favorites/bad-id" "invalid foodId -> 400" 400

echo "--- MULTI ADD + FEATURE 10: PAGINATION ---"
for pair in "$DOSA:dosa:Masala Dosa" "$BIRYANI:biryani:Chicken Biryani" "$NAAN:naan:Butter Naan" "$BROWNIE:brownie:Chocolate Brownie" "$TANDOORI:tandoori:Tandoori Chicken" "$COFFEE:coffee:Cold Coffee"; do
  IFS=':' read -r fid sname ename <<< "$pair"
  BODY=""
  check POST "/favorites/$fid" "add $ename" 201
done
BODY=""
check GET "/favorites" "default pagination shape" 200 \
  '(.pagination | keys | sort) == ["limit", "page", "totalItems", "totalPages"] and
   .pagination.page == 1 and .pagination.limit == 10 and
   .pagination.totalItems == 6 and .pagination.totalPages == 1 and
   .count == 6 and (.data | length) == 6'
check GET "/favorites?page=1&limit=3" "page 1 of 2" 200 '.pagination.page == 1 and (.data | length) == 3 and .pagination.totalItems == 6 and .pagination.totalPages == 2'
check GET "/favorites?page=2&limit=3" "page 2 of 2" 200 '.pagination.page == 2 and (.data | length) == 3'
check GET "/favorites?limit=999" "limit capped 50" 200 '.pagination.limit == 50'
check GET "/favorites?limit=abc" "limit garbage -> 10" 200 '.pagination.limit == 10'
check GET "/favorites?limit=0" "limit 0 -> 10" 200 '.pagination.limit == 10'
check GET "/favorites?limit=-5" "limit negative -> 1" 200 '.pagination.limit == 1 and (.data | length) == 1'
check GET "/favorites?page=0" "page 0 -> 1" 200 '.pagination.page == 1'
check GET "/favorites?page=abc" "page garbage -> 1" 200 '.pagination.page == 1'
check GET "/favorites?page=999" "page beyond end -> empty" 200 '.pagination.page == 999 and (.data | length) == 0 and .pagination.totalItems == 6'
TOKEN=$TOKEN_B
check GET "/favorites" "B pagination unaffected: 1 favorite" 200 '.pagination.totalItems == 1'

echo "--- FEATURE 9: FOOD BECOMES UNAVAILABLE AFTER FAVORITING ---"
TOKEN=$TOKEN_ADM
BODY='{"status":"UNAVAILABLE"}'
check PATCH "/admin/foods/$BIRYANI/status" "admin hides favorited food" 200 '.data.isAvailable == false'
BODY=""; TOKEN=$TOKEN_A
check GET "/favorites" "favorite kept, availability flagged" 200 \
  '.pagination.totalItems == 6 and
   ([.data[].food | select(.name == "Chicken Biryani")][0].isAvailable) == false'
TOKEN=$TOKEN_ADM
BODY='{"status":"AVAILABLE"}'
check PATCH "/admin/foods/$BIRYANI/status" "admin restores food" 200 '.data.isAvailable == true'
BODY=""; TOKEN=$TOKEN_A

echo "--- FEATURE 6: CLEAR ALL ---"
check DELETE "/favorites" "A clears all -> removed 6" 200 '.data.removed == 6'
check GET "/favorites" "A list empty" 200 '.pagination.totalItems == 0 and (.data | length) == 0'
TOKEN=$TOKEN_B
check GET "/favorites" "B favorites survive A clear" 200 '.pagination.totalItems == 1 and .data[0].food.name == "Paneer Butter Masala"'
TOKEN=$TOKEN_A
check DELETE "/favorites" "A clear again idempotent" 200 '.data.removed == 0'
TOKEN=$TOKEN_B
check DELETE "/favorites" "B clears own -> removed 1" 200 '.data.removed == 1'
check GET "/favorites" "B list empty" 200 '.pagination.totalItems == 0'

echo "--- FEATURE 11: DB-LEVEL DUPLICATE PREVENTION ---"
TOKEN=$TOKEN_A
check POST "/favorites/$DOSA" "A re-adds Dosa" 201
DUP_OUT=$(mongosh --quiet $DB --eval "
  const u = db.users.findOne({email: '$A_EMAIL'});
  const f = db.foods.findOne({name: 'Masala Dosa'});
  try {
    db.favorites.insertOne({user: u._id, food: f._id, createdAt: new Date(), updatedAt: new Date()});
    print('INSERTED_DUPLICATE');
  } catch (e) {
    print('ERRCODE:' + e.code);
  }")
if echo "$DUP_OUT" | grep -q "ERRCODE:11000"; then
  PASS=$((PASS+1)); echo "PASS  unique index rejects duplicate user+food (E11000)"
else
  FAIL=$((FAIL+1)); echo "FAIL  unique index rejects duplicate user+food: $DUP_OUT"
fi
check DELETE "/favorites" "A final clear" 200 '.data.removed == 1'

echo "--- CLEANUP + RESTORE CHECK ---"
mongosh --quiet $DB --eval "
  db.favorites.deleteMany({});
  db.foods.deleteMany({name: {\$in: ['Fav Unavailable Item', 'Fav Closed Food', 'Fav Orphan Food']}});
  db.restaurants.deleteMany({name: 'Fav Closed Diner'});
  db.users.deleteMany({email: /^(mod10)/});
  print('favorites:', db.favorites.countDocuments({}))" >/dev/null
TOKEN=""
check GET "/restaurants" "restaurant baseline restored" 200 '.pagination.totalItems == '"$R_BASE"
check GET "/foods?limit=50" "food baseline restored" 200 '.pagination.totalItems == '"$F_BASE"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && echo "MODULE 10: ALL TESTS PASSED" || echo "MODULE 10: FAILURES PRESENT"
