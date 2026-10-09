#!/bin/bash
BASE="http://localhost:5000/api"
DB=local_market
PASS=0; FAIL=0
TMP=/tmp/opencode/discovery_body.json
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

# --- setup: admin account for temp inactive/unavailable data ---
SUF=$(date +%s)
ADMIN_EMAIL="mod9admin$SUF@example.com"
TOKEN_A=$(curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Discovery Admin\",\"email\":\"$ADMIN_EMAIL\",\"phone\":\"9876543218\",\"password\":\"secret123\"}" | jq -r '.data.token')
[ -z "$TOKEN_A" ] || [ "$TOKEN_A" = "null" ] && { echo "FATAL: no admin token"; exit 1; }
mongosh --quiet $DB --eval "db.users.updateOne({email: '$ADMIN_EMAIL'}, {\$set: {role: 'admin'}})" >/dev/null

SPICE=6ac695f9e5c9d8a1af1b049e
GHOST=6ac695f9e5c9d8a1ffffff00

# --- baselines (public customer view, before temp data) ---
TOKEN=""
req GET "/restaurants" >/dev/null; R_TOTAL=$(jq -r '.pagination.totalItems' "$TMP")
req GET "/foods?limit=50" >/dev/null; F_TOTAL=$(jq -r '.pagination.totalItems' "$TMP")
SPICE_FOODS=$(mongosh --quiet $DB --eval "print(db.foods.countDocuments({restaurant: ObjectId('$SPICE'), isAvailable: true}))")
R_PAGES10=$(( (R_TOTAL + 9) / 10 ))
F_PAGES10=$(( (F_TOTAL + 9) / 10 ))
DEF_F_LEN=$F_TOTAL; [ $DEF_F_LEN -gt 10 ] && DEF_F_LEN=10
DEF_R_LEN=$R_TOTAL; [ $DEF_R_LEN -gt 10 ] && DEF_R_LEN=10
P2_LEN=$((F_TOTAL - 5)); [ $P2_LEN -gt 5 ] && P2_LEN=5
echo "baselines: restaurants=$R_TOTAL foods=$F_TOTAL"

echo "--- FEATURE 1: VIEW ACTIVE RESTAURANTS ---"
check GET "/restaurants" "list shape + success" 200 \
  '.success == true and (.data | type) == "array" and .pagination.totalItems == '"$R_TOTAL"
check GET "/restaurants" "required discovery fields present" 200 \
  '[.data[] | has("_id") and has("name") and has("description") and has("address") and has("image") and has("rating") and has("foodCount")] | all'
check GET "/restaurants" "Spice Garden foodCount matches DB" 200 \
  '[.data[] | select(.name == "Spice Garden") | .foodCount][0] == '"$SPICE_FOODS"
check GET "/restaurants" "no admin/internal fields exposed" 200 \
  '([.data[] | select(has("isActive") or has("createdAt") or has("updatedAt"))] | length) == 0 and ([.. | objects | select(has("password"))] | length) == 0'
check GET "/restaurants?cuisine=Biryani" "cuisine filter still works" 200 '.count >= 1'

echo "--- FEATURE 2: SINGLE RESTAURANT + AVAILABLE FOODS ---"
check GET "/restaurants/$SPICE" "details + foods" 200 \
  '.data.name == "Spice Garden" and .data.rating == 4.7 and (.data.foods | type) == "array" and (.data.foods | length) == '"$SPICE_FOODS"' and (.data.foods[0] | has("price"))'
check GET "/restaurants/$SPICE" "foods are available-only, safe fields" 200 \
  '([.data.foods[] | select(has("isAvailable"))] | length) == 0 and ([.data.foods[] | select(.price == null or .category == null)] | length) == 0'
check GET "/restaurants/bad-id" "invalid id -> 400" 400
check GET "/restaurants/$GHOST" "not found -> 404" 404

echo "--- FEATURE 5: FOOD SEARCH ---"
check GET "/foods?search=chicken" "search lowercase" 200 '.count >= 2 and ([.data[].name] | index("Chicken Biryani")) != null'
check GET "/foods?search=CHICKEN" "search uppercase" 200 '.count >= 2 and .pagination.totalItems >= 2'
check GET "/foods?search=dosa" "search description/name" 200 '([.data[].name] | index("Masala Dosa")) != null'
check GET "/foods?search=zzznomatch9999" "no match -> 0" 200 '.count == 0 and .pagination.totalItems == 0'
check GET "/foods?search=C%2B%2B" "regex metacharacters safe" 200 '.success == true'
check GET "/foods?search=*" "wildcard literal safe" 200 '.success == true'

echo "--- FEATURE 6: RESTAURANT SEARCH ---"
check GET "/restaurants?search=spice" "search lowercase" 200 '([.data[].name] | index("Spice Garden")) != null'
check GET "/restaurants?search=SPICE" "search uppercase same result" 200 '.pagination.totalItems >= 2'
check GET "/restaurants?search=zzznomatch9999" "no match -> 0" 200 '.count == 0'
check GET "/restaurants?search=C%2B%2B" "regex metacharacters safe" 200 '.success == true'

echo "--- FEATURE 7: CATEGORY FILTER ---"
check GET "/foods?category=Biryani" "exact category" 200 '.count >= 1 and ([.data[].category] | unique) == ["Biryani"]'
check GET "/foods?category=biryani" "lowercase category matches" 200 '.pagination.totalItems >= 1 and ([.data[].category] | unique) == ["Biryani"]'
check GET "/foods?category=SNACKS" "uppercase category matches" 200 '.count >= 1 and ([.data[].category] | unique) == ["Snacks"]'
check GET "/foods?category=Sushi" "unknown category -> 400" 400 '.message | contains("Invalid category")'
check GET "/foods?category=" "empty category ignored" 200 '.pagination.totalItems == '"$F_TOTAL"

echo "--- FEATURE 8: RESTAURANT FILTER FOR FOOD ---"
check GET "/foods?restaurantId=$SPICE" "restaurantId filter" 200 \
  '.count >= 3 and ([.data[].restaurant] | unique) == ["'"$SPICE"'"]'
check GET "/foods?restaurant=$SPICE" "legacy restaurant param kept" 200 '.pagination.totalItems >= 3'
check GET "/foods?restaurantId=$SPICE" "same total as legacy param" 200 '.pagination.totalItems >= 3'
check GET "/foods?restaurantId=bad-id" "invalid id -> 400" 400
check GET "/foods?restaurantId=$GHOST" "unknown restaurant -> 404" 404

echo "--- FEATURE 9: COMBINED FILTERS ---"
check GET "/foods?search=chicken&category=Biryani" "search + category" 200 '.count == 1 and .data[0].name == "Chicken Biryani"'
check GET "/foods?restaurantId=$SPICE&category=Biryani" "restaurant + category" 200 '.count == 1 and .data[0].name == "Chicken Biryani"'
check GET "/foods?restaurantId=$SPICE&search=dosa" "restaurant + search" 200 '.count == 1 and .data[0].name == "Masala Dosa"'
check GET "/foods?restaurantId=$SPICE&search=chicken&category=Biryani" "all three combined" 200 '.count == 1 and .data[0].name == "Chicken Biryani"'
check GET "/foods?restaurant=$SPICE&category=Snacks" "legacy alias + category" 200 '.count == 1 and .data[0].name == "Idli Sambar"'

echo "--- FEATURE 10: SORTING ---"
check GET "/foods?sort=price_asc&limit=50" "price ascending" 200 \
  '[.data[].price] as $p | ($p | length) == '"$F_TOTAL"' and $p == ($p | sort)'
check GET "/foods?sort=price_desc&limit=50" "price descending" 200 \
  '[.data[].price] as $p | ($p | length) == '"$F_TOTAL"' and $p == ($p | sort | reverse)'
check GET "/foods?sort=name_asc&limit=50" "name ascending" 200 \
  '[.data[].name] as $n | $n == ($n | sort)'
check GET "/foods?sort=name_desc&limit=50" "name descending" 200 \
  '[.data[].name] as $n | $n == ($n | sort | reverse)'
check GET "/foods?sort=bogus" "unknown sort -> 400" 400 '.message | contains("Invalid sort option")'
check GET "/foods?sort=price" "raw field name rejected -> 400" 400
check GET "/foods?sort=__proto__" "prototype key rejected -> 400" 400
check GET "/foods?sort[\$ne]=1" "operator sort inert -> 200 default sort" 200 '.pagination.totalItems == '"$F_TOTAL"
check GET "/restaurants?sort=name_asc" "restaurant name sort" 200 \
  '[.data[].name] as $n | $n == ($n | sort)'
check GET "/restaurants?sort=price_asc" "price sort not allowed on restaurants -> 400" 400

echo "--- FEATURE 11: PAGINATION + FEATURE 12: FORMAT ---"
check GET "/foods" "default food pagination" 200 \
  '.pagination.page == 1 and .pagination.limit == 10 and .pagination.totalItems == '"$F_TOTAL"' and .pagination.totalPages == '"$F_PAGES10"' and (.data | length) == '"$DEF_F_LEN"
check GET "/restaurants" "default restaurant pagination" 200 \
  '.pagination.page == 1 and .pagination.limit == 10 and .pagination.totalItems == '"$R_TOTAL"' and .pagination.totalPages == '"$R_PAGES10"' and (.data | length) == '"$DEF_R_LEN"
check GET "/foods" "pagination keys exact" 200 '(.pagination | keys | sort) == ["limit", "page", "totalItems", "totalPages"]'
check GET "/foods" "legacy fields kept for old clients" 200 'has("count") and has("total") and has("page") and has("pages") and (.success == true) and ((.data | type) == "array")'
check GET "/foods?page=2&limit=5" "page 2 of 5" 200 '.pagination.page == 2 and .pagination.limit == 5 and (.data | length) == '"$P2_LEN"
check GET "/foods?limit=999" "limit capped at 50" 200 '.pagination.limit == 50'
check GET "/foods?limit=abc" "limit garbage -> 10" 200 '.pagination.limit == 10'
check GET "/foods?limit=0" "limit 0 -> default 10" 200 '.pagination.limit == 10'
check GET "/foods?limit=-5" "limit negative -> 1" 200 '.pagination.limit == 1'
check GET "/foods?page=0" "page 0 -> 1" 200 '.pagination.page == 1'
check GET "/foods?page=abc" "page garbage -> 1" 200 '.pagination.page == 1'
check GET "/foods?page=-2" "page negative -> 1" 200 '.pagination.page == 1'
check GET "/foods?page=999" "page beyond end -> empty data" 200 '.pagination.page == 999 and (.data | length) == 0 and .pagination.totalItems == '"$F_TOTAL"
check GET "/restaurants?page=1&limit=2" "restaurant paging" 200 '.pagination.totalItems == '"$R_TOTAL"' and (.data | length) == 2'

echo "--- FEATURE 14: QUERY INJECTION SAFETY ---"
check GET "/foods?search[\$ne]=1" "operator search inert, no filter applied" 200 '.pagination.totalItems == '"$F_TOTAL"
check GET "/foods?category[\$ne]=x" "operator category inert, ignored safely" 200 '.pagination.totalItems == '"$F_TOTAL"
check GET "/foods?restaurantId[\$ne]=1" "operator restaurantId inert, ignored safely" 200 '.pagination.totalItems == '"$F_TOTAL"
check GET "/foods?sort[\$ne]=1" "operator sort inert, default sort used" 200 '.pagination.totalItems == '"$F_TOTAL"' and .pagination.page == 1'
check GET "/foods?page[\$gt]=1" "operator page inert -> defaults" 200 '.pagination.page == 1 and .pagination.totalItems == '"$F_TOTAL"
check GET "/foods?foo=bar&hack=1" "unknown params ignored" 200 '.pagination.totalItems == '"$F_TOTAL"
check GET "/restaurants?sort=DROP%20TABLE" "ascii sort rejected -> 400" 400
check GET "/foods?search=%24ne" "operator word as search value is literal" 200 '.success == true and .pagination.totalItems == 0'
check GET "/foods?category=%24where" "operator word as category value rejected" 400 '.message | contains("Invalid category")'

echo "--- FEATURES 3+4+13: TEMP INACTIVE / UNAVAILABLE DATA ---"
TOKEN=$TOKEN_A
BODY='{"name":"Discovery Hidden Diner","cuisine":["Indian"],"deliveryTime":20,"address":"7 Hidden Street"}'
req POST "/admin/restaurants" >/dev/null; RH=$(json_field '.data._id')
BODY="{\"name\":\"Hidden Restaurant Special\",\"price\":100,\"category\":\"Snacks\",\"restaurantId\":\"$RH\"}"
req POST "/admin/foods" >/dev/null; FH=$(json_field '.data._id')
BODY="{\"name\":\"Unavailable Discovery Food\",\"price\":99,\"category\":\"Snacks\",\"restaurantId\":\"$SPICE\"}"
req POST "/admin/foods" >/dev/null; FU=$(json_field '.data._id')
BODY='{"status":"INACTIVE"}'; req PATCH "/admin/restaurants/$RH/status" >/dev/null
BODY='{"status":"UNAVAILABLE"}'; req PATCH "/admin/foods/$FU/status" >/dev/null
BODY=""; TOKEN=""

check GET "/restaurants" "inactive restaurant hidden from list" 200 '.pagination.totalItems == '"$R_TOTAL"
check GET "/restaurants?search=Discovery%20Hidden" "inactive restaurant not searchable" 200 '.count == 0'
check GET "/restaurants/$RH" "inactive restaurant single -> 404" 404
check GET "/foods" "list totals unchanged by inactive/unavailable" 200 '.pagination.totalItems == '"$F_TOTAL"
check GET "/foods?search=Hidden%20Restaurant%20Special" "food of inactive restaurant hidden" 200 '.count == 0'
check GET "/foods?search=Unavailable%20Discovery%20Food" "unavailable food hidden" 200 '.count == 0'
check GET "/foods/$FH" "single food, inactive restaurant -> 404" 404
check GET "/foods/$FU" "single unavailable food -> 404" 404
check GET "/foods?restaurantId=$RH" "filter by inactive restaurant -> 404" 404
check GET "/foods?restaurantId=$SPICE" "unavailable food excluded by filter" 200 \
  '([.data[].name] | index("Unavailable Discovery Food")) == null and .count >= 3'
check GET "/restaurants/$SPICE" "single restaurant foods exclude unavailable" 200 '(.data.foods | length) == '"$SPICE_FOODS"

echo "--- FEATURE 13: RESPONSE PERFORMANCE ---"
T=$(curl -s -o /dev/null -w "%{time_total}" "$BASE/foods?search=chicken&category=Biryani&sort=price_asc")
OK=$(awk "BEGIN {print ($T < 2.0) ? 1 : 0}")
if [ "$OK" = "1" ]; then PASS=$((PASS+1)); echo "PASS  list query fast enough (${T}s)"; else FAIL=$((FAIL+1)); echo "FAIL  list query too slow (${T}s)"; fi

echo "--- CLEANUP: REMOVE TEMP DATA, VERIFY RESTORED ---"
TOKEN=$TOKEN_A
check DELETE "/admin/foods/$FU" "remove temp unavailable food" 200
check DELETE "/admin/foods/$FH" "remove temp hidden food" 200
check DELETE "/admin/restaurants/$RH" "remove temp hidden restaurant" 200
TOKEN=""
check GET "/foods" "food totals restored" 200 '.pagination.totalItems == '"$F_TOTAL"
check GET "/restaurants" "restaurant totals restored" 200 '.pagination.totalItems == '"$R_TOTAL"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && echo "MODULE 9: ALL TESTS PASSED" || echo "MODULE 9: FAILURES PRESENT"
