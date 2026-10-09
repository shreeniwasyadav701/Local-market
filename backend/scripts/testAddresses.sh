#!/bin/bash
BASE="http://localhost:5000/api"
DB=local_market
PASS=0; FAIL=0
TMP=/tmp/opencode/addresses_body.json
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

# --- setup ---
SUF=$(date +%s)
A_EMAIL="mod11a$SUF@example.com"
B_EMAIL="mod11b$SUF@example.com"
register() {
  curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
    -d "{\"name\":\"$1\",\"email\":\"$2\",\"phone\":\"$3\",\"password\":\"secret123\"}" | jq -r '.data.token'
}
TOKEN_A=$(register "Address User A" "$A_EMAIL" "9876543223")
TOKEN_B=$(register "Address User B" "$B_EMAIL" "9876543224")
[ -z "$TOKEN_A" ] || [ "$TOKEN_A" = "null" ] && { echo "FATAL: no token A"; exit 1; }
[ -z "$TOKEN_B" ] || [ "$TOKEN_B" = "null" ] && { echo "FATAL: no token B"; exit 1; }

BASE_COUNTS=$(mongosh --quiet $DB --eval 'print([db.orders.countDocuments({}), db.carts.countDocuments({}), db.favorites.countDocuments({}), db.addresses.countDocuments({})].join(","))')
ORDER_BASE=$(echo "$BASE_COUNTS" | cut -d, -f1)
CART_BASE=$(echo "$BASE_COUNTS" | cut -d, -f2)
FAV_BASE=$(echo "$BASE_COUNTS" | cut -d, -f3)
echo "baselines: orders=$ORDER_BASE carts=$CART_BASE favorites=$FAV_BASE"

GHOST=6ac695f9e5c9d8a1ffffff00
DOSA=$(curl -s "$BASE/foods?search=dosa" | jq -r '.data[] | select(.name == "Masala Dosa") | ._id')

FULL_ADDR_A='{"fullName":"Shreeniwas Yadav","phone":"9876543210","houseNumber":"12A","street":"Main Road","area":"Sowcarpet","city":"Chennai","state":"Tamil Nadu","pincode":"600001","landmark":"Near Main Market","addressType":"HOME","isDefault":true}'

echo "--- FEATURE 10: AUTH REQUIRED (401) ---"
check GET "/addresses" "list no token -> 401" 401
check POST "/addresses" "create no token -> 401" 401
check GET "/addresses/$GHOST" "single no token -> 401" 401
check PUT "/addresses/$GHOST" "update no token -> 401" 401
check DELETE "/addresses/$GHOST" "delete no token -> 401" 401
check PATCH "/addresses/$GHOST/default" "default no token -> 401" 401

echo "--- FEATURE 2: ADD ADDRESS (user A) ---"
TOKEN=$TOKEN_A
BODY="$FULL_ADDR_A"
check POST "/addresses" "spec example -> 201" 201 \
  '.message == "Address added" and .data.fullName == "Shreeniwas Yadav" and
   .data.pincode == "600001" and .data.addressType == "HOME" and
   .data.isDefault == true and .data.landmark == "Near Main Market" and
   (.data | has("user") | not)'
A1=$(json_field '.data._id')
BODY='{"fullName":"Priya Sharma","phone":"9000000001","houseNumber":"5B","street":"Lake View Road","area":"Adyar","city":"Chennai","state":"Tamil Nadu","pincode":"600020","isDefault":false,"hacked":true,"user":"6ac695f9e5c9d8a1ffffff00"}'
check POST "/addresses" "second add, default HOME, fields stripped" 201 \
  '.data.addressType == "HOME" and (.data | has("hacked") | not) and (.data | has("user") | not)'
A2=$(json_field '.data._id')
BODY='{"fullName":"Bad Phone","phone":"12345","houseNumber":"1","street":"s","area":"a","city":"c","state":"st","pincode":"600001"}'
check POST "/addresses" "invalid phone -> 400" 400 '.message | contains("Phone must be exactly 10 digits")'
BODY='{"fullName":"Bad Phone","phone":"987654321a","houseNumber":"1","street":"s","area":"a","city":"c","state":"st","pincode":"600001"}'
check POST "/addresses" "phone with letter -> 400" 400
BODY='{"fullName":"Bad Pin","phone":"9876543210","houseNumber":"1","street":"s","area":"a","city":"c","state":"st","pincode":"012345"}'
check POST "/addresses" "pincode starts with 0 -> 400" 400 '.message | contains("pincode must be a valid 6 digit")'
BODY='{"fullName":"Bad Pin","phone":"9876543210","houseNumber":"1","street":"s","area":"a","city":"c","state":"st","pincode":"12345"}'
check POST "/addresses" "5 digit pincode -> 400" 400
BODY='{"fullName":"Bad Type","phone":"9876543210","houseNumber":"1","street":"s","area":"a","city":"c","state":"st","pincode":"600001","addressType":"OFFICE"}'
check POST "/addresses" "invalid addressType -> 400" 400 '.message | contains("addressType must be one of")'
BODY='{"fullName":"Low Type","phone":"9876543210","houseNumber":"1","street":"s","area":"a","city":"c","state":"st","pincode":"600001","addressType":"home"}'
check POST "/addresses" "lowercase type rejected (strict) -> 400" 400
BODY='{"phone":"9876543210","houseNumber":"1","street":"s","area":"a","city":"c","state":"st","pincode":"600001"}'
check POST "/addresses" "missing fullName -> 400" 400 '.message | contains("fullName is required")'
BODY='{"fullName":"X","phone":"9876543210","street":"s","area":"a","city":"c","state":"st","pincode":"600001"}'
check POST "/addresses" "missing houseNumber -> 400" 400 '.message | contains("houseNumber is required")'
BODY='{"fullName":"X","phone":"9876543210","houseNumber":"1","area":"a","city":"c","state":"st","pincode":"600001"}'
check POST "/addresses" "missing street -> 400" 400 '.message | contains("street is required")'
BODY='{"fullName":"X","phone":"9876543210","houseNumber":"1","street":"s","city":"c","state":"st","pincode":"600001"}'
check POST "/addresses" "missing area -> 400" 400 '.message | contains("area is required")'
BODY='{"fullName":"X","phone":"9876543210","houseNumber":"1","street":"s","area":"a","state":"st","pincode":"600001"}'
check POST "/addresses" "missing city -> 400" 400 '.message | contains("city is required")'
BODY='{"fullName":"X","phone":"9876543210","houseNumber":"1","street":"s","area":"a","city":"c","pincode":"600001"}'
check POST "/addresses" "missing state -> 400" 400 '.message | contains("state is required")'
BODY='{"fullName":"X","phone":"9876543210","houseNumber":"1","street":"s","area":"a","city":"c","state":"st"}'
check POST "/addresses" "missing pincode -> 400" 400 '.message | contains("pincode")'
BODY='{"fullName":"   ","phone":"9876543210","houseNumber":"1","street":"s","area":"a","city":"c","state":"st","pincode":"600001"}'
check POST "/addresses" "whitespace fullName -> 400" 400 '.message | contains("fullName is required")'
BODY='{"fullName":"Flag Bad","phone":"9876543210","houseNumber":"1","street":"s","area":"a","city":"c","state":"st","pincode":"600001","isDefault":"yes"}'
check POST "/addresses" "non-boolean isDefault -> 400" 400 '.message | contains("isDefault must be a boolean")'
TOKEN=$TOKEN_B
BODY='{"fullName":"User B Home","phone":"9000000002","houseNumber":"9","street":"B Street","area":"B Area","city":"Coimbatore","state":"Tamil Nadu","pincode":"641001","addressType":"WORK","isDefault":true}'
check POST "/addresses" "user B adds own address -> 201" 201
B1=$(json_field '.data._id')
BODY=""

echo "--- FEATURE 3: GET MY ADDRESSES ---"
TOKEN=$TOKEN_A
check GET "/addresses" "A list shape + default first" 200 \
  '.success == true and .count == 2 and .pagination.totalItems == 2 and
   (.pagination | keys | sort) == ["limit", "page", "totalItems", "totalPages"] and
   .data[0].isDefault == true and .data[0]._id == "'"$A1"'"'
check GET "/addresses" "no sensitive fields exposed" 200 \
  '([.data[] | select(has("user"))] | length) == 0 and ([.. | objects | select(has("password"))] | length) == 0'
TOKEN=$TOKEN_B
check GET "/addresses" "B list only sees B address" 200 \
  '.pagination.totalItems == 1 and .data[0].fullName == "User B Home"'

echo "--- FEATURE 4: GET SINGLE ADDRESS ---"
TOKEN=$TOKEN_A
check GET "/addresses/$A1" "A reads own -> 200" 200 '.data.fullName == "Shreeniwas Yadav" and .data.pincode == "600001"'
check GET "/addresses/$B1" "A reads B address -> 404" 404
check GET "/addresses/bad-id" "invalid id -> 400" 400
check GET "/addresses/$GHOST" "unknown -> 404" 404

echo "--- FEATURE 5: UPDATE ADDRESS ---"
BODY='{"houseNumber":"12B"}'
check PUT "/addresses/$A1" "owner update -> 200" 200 '.data.houseNumber == "12B"'
BODY='{"user":"6ac695f9e5c9d8a1ffffff00"}'
check PUT "/addresses/$A1" "user-only body rejected -> 400" 400 '.message | contains("No updatable fields")'
BODY='{"user":"6ac695f9e5c9d8a1ffffff00","city":"Madurai"}'
check PUT "/addresses/$A1" "user field stripped, city updated" 200 '.data.city == "Madurai" and (.data | has("user") | not)'
OWNER_CHECK=$(mongosh --quiet $DB --eval "
  const a = db.users.findOne({email: '$A_EMAIL'});
  const doc = db.addresses.findOne({_id: ObjectId('$A1')});
  print(doc.user.toString() === a._id.toString() ? 'OWNER_OK' : 'OWNER_BAD');")
if echo "$OWNER_CHECK" | grep -q "OWNER_OK"; then
  PASS=$((PASS+1)); echo "PASS  ownership still user A in DB (OWNER_OK)"
else
  FAIL=$((FAIL+1)); echo "FAIL  ownership still user A in DB: $OWNER_CHECK"
fi
BODY='{"phone":"12345"}'
check PUT "/addresses/$A1" "invalid phone -> 400" 400
BODY='{"pincode":"000000"}'
check PUT "/addresses/$A1" "invalid pincode -> 400" 400
BODY='{"addressType":"OFFICE"}'
check PUT "/addresses/$A1" "invalid addressType -> 400" 400
BODY='{"fullName":"   "}'
check PUT "/addresses/$A1" "blank fullName -> 400" 400
BODY='{"city":"X"}'
check PUT "/addresses/$B1" "A updates B address -> 404" 404
check PUT "/addresses/$GHOST" "unknown -> 404" 404
check PUT "/addresses/bad-id" "invalid id -> 400" 400
BODY=""

echo "--- FEATURE 7: SINGLE DEFAULT ADDRESS ---"
PATCH_DEFAULT() { check PATCH "/addresses/$1/default" "$2" "$3" "$4"; }
PATCH_DEFAULT "$A2" "make A2 default -> 200" 200 '.data.isDefault == true'
check GET "/addresses" "exactly one default, now A2" 200 \
  '([.data[] | select(.isDefault == true)] | length) == 1 and
   [.data[] | select(.isDefault == true)][0]._id == "'"$A2"'"'
PATCH_DEFAULT "$A1" "switch default back to A1 -> 200" 200 '.data.isDefault == true'
check GET "/addresses" "exactly one default, back to A1" 200 \
  '([.data[] | select(.isDefault == true)] | length) == 1 and
   [.data[] | select(.isDefault == true)][0]._id == "'"$A1"'"'
PATCH_DEFAULT "$A1" "idempotent re-select -> 200" 200 '.data.isDefault == true'
PATCH_DEFAULT "$B1" "A selects B address -> 404" 404
PATCH_DEFAULT "$GHOST" "unknown -> 404" 404
PATCH_DEFAULT "bad-id" "invalid id -> 400" 400
DUP_OUT=$(mongosh --quiet $DB --eval "
  const u = db.users.findOne({email: '$A_EMAIL'});
  try {
    db.addresses.insertOne({
      user: u._id, fullName: 'Dup Default', phone: '9000000009',
      houseNumber: '1', street: 's', area: 'a', city: 'c', state: 'st',
      pincode: '600001', landmark: '', addressType: 'HOME', isDefault: true,
      createdAt: new Date(), updatedAt: new Date()
    });
    print('INSERTED_DUPLICATE');
  } catch (e) {
    print('ERRCODE:' + e.code);
  }")
if echo "$DUP_OUT" | grep -q "ERRCODE:11000"; then
  PASS=$((PASS+1)); echo "PASS  partial unique index blocks second default (E11000)"
else
  FAIL=$((FAIL+1)); echo "FAIL  partial unique index blocks second default: $DUP_OUT"
fi
TOKEN=$TOKEN_A
BODY='{"fullName":"Office Address","phone":"9000000003","houseNumber":"22","street":"Tech Park","area":"Guindy","city":"Chennai","state":"Tamil Nadu","pincode":"600032","addressType":"WORK"}'
check POST "/addresses" "third address (WORK) -> 201" 201 '.data.addressType == "WORK"'
A3=$(json_field '.data._id')
BODY=""

echo "--- FEATURE 12: PAGINATION ---"
check GET "/addresses" "default pagination" 200 \
  '.pagination.page == 1 and .pagination.limit == 10 and .pagination.totalItems == 3 and
   .pagination.totalPages == 1 and .count == 3 and (.data | length) == 3'
check GET "/addresses?limit=1" "limit 1" 200 '(.data | length) == 1 and .pagination.totalPages == 3'
check GET "/addresses?page=2&limit=1" "page 2" 200 '.pagination.page == 2 and (.data | length) == 1'
check GET "/addresses?page=3&limit=1" "page 3" 200 '.pagination.page == 3 and (.data | length) == 1'
check GET "/addresses?limit=999" "limit capped 50" 200 '.pagination.limit == 50'
check GET "/addresses?limit=abc" "limit garbage -> 10" 200 '.pagination.limit == 10'
check GET "/addresses?limit=-5" "limit negative -> 1" 200 '.pagination.limit == 1'
check GET "/addresses?page=0" "page 0 -> 1" 200 '.pagination.page == 1'
check GET "/addresses?page=abc" "page garbage -> 1" 200 '.pagination.page == 1'
check GET "/addresses?page=999" "page beyond end -> empty" 200 '(.data | length) == 0 and .pagination.totalItems == 3'

echo "--- FEATURE 6: DELETE ADDRESS ---"
check DELETE "/addresses/$B1" "A deletes B address -> 404" 404
TOKEN=$TOKEN_B
check GET "/addresses" "B address untouched" 200 '.pagination.totalItems == 1'
TOKEN=$TOKEN_A
check DELETE "/addresses/$A1" "A deletes own default -> 200" 200 '.data.defaultReassigned == true'
check GET "/addresses" "oldest remaining promoted to default" 200 \
  '.pagination.totalItems == 2 and ([.data[] | select(.isDefault == true)] | length) == 1 and
   [.data[] | select(.isDefault == true)][0]._id == "'"$A2"'"'
check DELETE "/addresses/$A1" "second delete -> 404" 404
check DELETE "/addresses/$GHOST" "unknown -> 404" 404
check DELETE "/addresses/bad-id" "invalid id -> 400" 400
TOKEN=$TOKEN_B
check DELETE "/addresses/$B1" "B deletes own only address -> 200" 200 '.data.defaultReassigned == false'
check GET "/addresses" "B list empty" 200 '.pagination.totalItems == 0'

echo "--- FEATURE 11: ORDER HISTORY SAFE FROM ADDRESS EDITS ---"
TOKEN=$TOKEN_A
BODY="{\"foodId\":\"$DOSA\"}"
check POST "/cart" "A adds dosa to cart" 201
BODY='{"customerName":"Snapshot User","phone":"9876543210","address":"12 Snapshot Road"}'
check POST "/orders" "A places order with address snapshot" 201 '.data.address == "12 Snapshot Road"'
ORDER_X=$(json_field '.data._id')
BODY='{"houseNumber":"999","city":"Coimbatore"}'
check PUT "/addresses/$A3" "A edits address after order" 200 '.data.houseNumber == "999"'
BODY=""
check DELETE "/addresses/$A3" "A deletes address after order" 200
check GET "/orders/$ORDER_X" "order snapshot intact after edit+delete" 200 \
  '.data.address == "12 Snapshot Road" and .data.customerName == "Snapshot User" and
   .data.phone == "9876543210" and (.data.address | type) == "string" and
   (.data | has("addressId") | not)'

echo "--- CLEANUP + RESTORE CHECK ---"
mongosh --quiet $DB --eval "
  db.addresses.deleteMany({});
  db.carts.deleteMany({user: ObjectId(db.users.findOne({email: '$A_EMAIL'})._id)});
  db.orders.deleteOne({_id: ObjectId('$ORDER_X')});
  db.users.deleteMany({email: /^(mod11)/});
  print('after:', [db.orders.countDocuments({}), db.carts.countDocuments({}), db.favorites.countDocuments({}), db.addresses.countDocuments({})].join(','));" >/dev/null
AFTER=$(mongosh --quiet $DB --eval 'print([db.orders.countDocuments({}), db.carts.countDocuments({}), db.favorites.countDocuments({}), db.addresses.countDocuments({})].join(","))')
EXPECT="$ORDER_BASE,$CART_BASE,$FAV_BASE,0"
if [ "$AFTER" = "$EXPECT" ]; then
  PASS=$((PASS+1)); echo "PASS  all collection baselines restored ($AFTER)"
else
  FAIL=$((FAIL+1)); echo "FAIL  baselines restored: expected $EXPECT, got $AFTER"
fi

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && echo "MODULE 11: ALL TESTS PASSED" || echo "MODULE 11: FAILURES PRESENT"
