#!/bin/bash
BASE="http://localhost:5000/api"
DB=local_market
PASS=0; FAIL=0
TMP=/tmp/opencode/checkout_body.json
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
    FAIL=$((FAIL+1)); echo "FAIL  $label (expected $expected, got $got)"; head -c 400 "$TMP"; echo
  fi
}

json_field() { jq -r "$1" "$TMP"; }

db_count() { mongosh --quiet $DB --eval "print(db.$1.countDocuments({}))"; }

assert_count() {
  local label=$1 coll=$2 expected=$3 got
  got=$(db_count "$coll")
  if [ "$got" = "$expected" ]; then
    PASS=$((PASS+1)); echo "PASS  $label ($got)"
  else
    FAIL=$((FAIL+1)); echo "FAIL  $label (expected $expected, got $got)"
  fi
}

assert_db() {
  local label=$1 expr=$2 want=$3 got
  got=$(mongosh --quiet $DB --eval "print($expr)")
  if [ "$got" = "$want" ]; then
    PASS=$((PASS+1)); echo "PASS  $label ($got)"
  else
    FAIL=$((FAIL+1)); echo "FAIL  $label (expected $want, got $got)"
  fi
}

# --- setup ---
SUF=$(date +%s)
A_EMAIL="mod12a$SUF@example.com"
B_EMAIL="mod12b$SUF@example.com"
register() {
  curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
    -d "{\"name\":\"$1\",\"email\":\"$2\",\"phone\":\"$3\",\"password\":\"secret123\"}" | jq -r '.data.token'
}
TOKEN_A=$(register "Checkout User A" "$A_EMAIL" "9876543221")
TOKEN_B=$(register "Checkout User B" "$B_EMAIL" "9876543222")
{ [ -z "$TOKEN_A" ] || [ "$TOKEN_A" = "null" ]; } && { echo "FATAL: no token A"; exit 1; }
{ [ -z "$TOKEN_B" ] || [ "$TOKEN_B" = "null" ]; } && { echo "FATAL: no token B"; exit 1; }

BASE_COUNTS=$(mongosh --quiet $DB --eval 'print([db.orders.countDocuments({}), db.carts.countDocuments({}), db.addresses.countDocuments({})].join(","))')
ORDER_BASE=$(echo "$BASE_COUNTS" | cut -d, -f1)
CART_BASE=$(echo "$BASE_COUNTS" | cut -d, -f2)
ADDR_BASE=$(echo "$BASE_COUNTS" | cut -d, -f3)
echo "baselines: orders=$ORDER_BASE carts=$CART_BASE addresses=$ADDR_BASE"

GHOST=6ac695f9e5c9d8a1ffffff00
DOSA=$(curl -s "$BASE/foods?search=dosa" | jq -r '.data[] | select(.name == "Masala Dosa") | ._id')
NAAN=$(curl -s "$BASE/foods?search=naan" | jq -r '.data[] | select(.name == "Butter Naan") | ._id')
TANDOORI=$(curl -s "$BASE/foods?search=tandoori" | jq -r '.data[] | select(.name == "Tandoori Chicken") | ._id')
{ [ -z "$DOSA" ] || [ -z "$NAAN" ] || [ -z "$TANDOORI" ]; } && { echo "FATAL: seed foods not found"; exit 1; }

echo "--- SECTION 1: AUTH REQUIRED ---"
check GET "/checkout" "preview no token -> 401" 401
BODY='{"addressId":"'$GHOST'"}'
check POST "/orders" "place order no token -> 401" 401
BODY=""
TOKEN=$TOKEN_A
check GET "/checkout?addressId=bad-id" "preview invalid address id -> 400" 400 '.message | contains("Invalid address id")'
check GET "/checkout?addressId=" "preview empty address id -> 400" 400

echo "--- SECTION 2: EMPTY CART PREVIEW ---"
check GET "/checkout" "empty cart preview -> zeros" 200 \
  '.success == true and (.data.items | length) == 0 and .data.itemCount == 0 and
   .data.subtotal == 0 and .data.deliveryCharge == 0 and .data.total == 0 and
   .data.freeDeliveryThreshold == 499 and (.data.issues | length) == 0 and
   (.data.addresses | length) == 0 and .data.selectedAddress == null'

echo "--- SECTION 3: PREVIEW MATH + LIVE PRICES ---"
BODY="{\"foodId\":\"$DOSA\",\"quantity\":2}"
check POST "/cart" "add dosa x2 -> 201" 201
BODY="{\"foodId\":\"$NAAN\",\"quantity\":1}"
check POST "/cart" "add naan x1 -> 201" 201
check GET "/checkout" "preview 280 -> charge 30 total 310" 200 \
  '(.data.items | length) == 2 and .data.itemCount == 3 and .data.subtotal == 280 and
   .data.deliveryCharge == 30 and .data.total == 310 and (.data.issues | length) == 0 and
   .data.items[0].name == "Masala Dosa" and .data.items[0].price == 120 and
   .data.items[0].quantity == 2 and .data.items[0].itemTotal == 240 and
   .data.items[0].isAvailable == true and (.data.items[0].restaurant.name | length) > 0 and
   .data.items[1].name == "Butter Naan" and .data.items[1].price == 40 and
   .data.items[1].itemTotal == 40 and .data.items[1].restaurant.isActive == true and
   ([.data.items[].itemTotal] | add) == .data.subtotal'
BODY="{\"foodId\":\"$TANDOORI\",\"quantity\":1}"
check POST "/cart" "add tandoori x1 -> 201" 201
check GET "/checkout" "preview 540 -> free delivery" 200 \
  '.data.subtotal == 540 and .data.deliveryCharge == 0 and .data.total == 540 and .data.itemCount == 4'
TID=$(curl -s -H "Authorization: Bearer $TOKEN_A" "$BASE/cart" | jq -r '.data.items[] | select(.name == "Tandoori Chicken") | ._id')
BODY=""
check DELETE "/cart/$TID" "remove tandoori -> 200" 200
check GET "/checkout" "back to 280 -> charge 30" 200 \
  '.data.subtotal == 280 and .data.deliveryCharge == 30 and .data.total == 310 and .data.itemCount == 3'
check GET "/checkout?addressId=$GHOST" "preview ghost address -> 404" 404 '.message == "Address not found"'

echo "--- SECTION 4: ADDRESS SELECTION IN PREVIEW ---"
BODY='{"fullName":"Checkout Addr A","phone":"9876543211","houseNumber":"12A","street":"Main Road","area":"Sowcarpet","city":"Chennai","state":"Tamil Nadu","pincode":"600001","landmark":"Near Market","addressType":"HOME","isDefault":true}'
check POST "/addresses" "A creates default address -> 201" 201
ADDR_A=$(json_field '.data._id')
BODY='{"fullName":"Checkout Addr B","phone":"9876543212","houseNumber":"9","street":"B Lane","area":"Adyar","city":"Chennai","state":"Tamil Nadu","pincode":"600020","addressType":"WORK","isDefault":true}'
TOKEN=$TOKEN_B
check POST "/addresses" "B creates own address -> 201" 201
ADDR_B=$(json_field '.data._id')
TOKEN=$TOKEN_A
BODY=""
check GET "/checkout?addressId=$ADDR_A" "A preview picks own address" 200 \
  '.data.selectedAddress._id == "'"$ADDR_A"'" and (.data.addresses | length) == 1'
check GET "/checkout" "no id -> A default selected" 200 \
  '.data.selectedAddress._id == "'"$ADDR_A"'" and .data.selectedAddress.isDefault == true'
TOKEN=$TOKEN_B
check GET "/checkout" "B default selected for B" 200 '.data.selectedAddress._id == "'"$ADDR_B"'"'
TOKEN=$TOKEN_A
check GET "/checkout?addressId=$ADDR_B" "A picks B address -> 404" 404 '.message == "Address not found"'

echo "--- SECTION 5: PLACE ORDER WITH SAVED ADDRESS ---"
BODY='{"addressId":"'$ADDR_A'","paymentMethod":"crypto"}'
check POST "/orders" "invalid payment method -> 400" 400 '.message | contains("cod or upi")'
BODY='{"addressId":"'$ADDR_A'","subtotal":1,"total":999999,"deliveryCharge":0,"customerName":"HACKED"}'
check POST "/orders" "addressId order, tampered totals ignored -> 201" 201 \
  '.message == "Order placed successfully" and
   .data.subtotal == 280 and .data.deliveryCharge == 30 and .data.total == 310 and
   .data.status == "placed" and (.data.statusHistory | length) == 1 and
   .data.statusHistory[0].status == "placed" and .data.paymentMethod == "cod" and
   .data.paymentStatus == "pending" and
   .data.customerName == "Checkout Addr A" and .data.customerName != "HACKED" and
   .data.phone == "9876543211" and
   (.data.address | contains("12A")) and (.data.address | contains("600001")) and
   (.data.address | contains("Near Market")) and
   .data.deliveryAddress.fullName == "Checkout Addr A" and
   .data.deliveryAddress.pincode == "600001" and .data.deliveryAddress.addressType == "HOME" and
   .data.deliveryAddress.houseNumber == "12A" and .data.deliveryAddress.landmark == "Near Market" and
   .data.items[0].name == "Masala Dosa" and .data.items[0].itemSubtotal == 240 and
   .data.items[1].name == "Butter Naan" and .data.items[1].itemSubtotal == 40 and
   .order.orderId == .data._id and .order.status == "placed" and
   .order.subtotal == 280 and .order.deliveryCharge == 30 and .order.total == 310 and
   .order.address == .data.address and .order.deliveryAddress.pincode == "600001" and
   (.order.items | length) == 2 and (.order.createdAt | length) > 0'
ORDER1=$(json_field '.data._id')
BODY=""
check GET "/cart" "cart cleared after addressId order" 200 '.data.items == []'
assert_count "orders incremented by 1" orders $((ORDER_BASE + 1))
assert_db "order stored deliveryAddress snapshot in DB" \
  "db.orders.findOne({_id: ObjectId('$ORDER1')}).deliveryAddress.city" "Chennai"

echo "--- SECTION 6: EMPTY CART BLOCKED ---"
BODY='{"addressId":"'$ADDR_A'"}'
check POST "/orders" "addressId order but empty cart -> 400" 400 \
  '.message | ascii_downcase | contains("cart is empty")'
assert_count "no order created on empty cart" orders $((ORDER_BASE + 1))

echo "--- SECTION 7: ADDRESS CHECKED BEFORE CART ---"
BODY='{"addressId":"'$GHOST'"}'
check POST "/orders" "ghost address with empty cart -> 404" 404 '.message == "Address not found"'
BODY='{"addressId":"bad-id"}'
check POST "/orders" "malformed address id -> 400" 400 '.message | contains("Invalid address id")'
TOKEN=$TOKEN_B
BODY='{"addressId":"'$ADDR_A'"}'
check POST "/orders" "B uses A address -> 404" 404 '.message == "Address not found"'
BODY='{"addressId":"'$ADDR_B'"}'
check POST "/orders" "B own address, empty cart -> 400" 400 \
  '.message | ascii_downcase | contains("cart is empty")'
TOKEN=$TOKEN_A
BODY=""

echo "--- SECTION 8: UNAVAILABLE / INACTIVE / ORPHAN ITEMS ---"
BODY="{\"foodId\":\"$DOSA\"}"
check POST "/cart" "add dosa for failure tests" 201
BODY=""
mongosh --quiet $DB --eval "db.foods.updateOne({_id: ObjectId('$DOSA')}, {\$set: {isAvailable: false}})" >/dev/null
BODY='{"customerName":"Checkout Fail","phone":"9876543210","address":"1 Fail Road"}'
check POST "/orders" "unavailable food -> 400 names item" 400 \
  '.message | contains("These items are no longer available: Masala Dosa")'
assert_count "no order on unavailable food" orders $((ORDER_BASE + 1))
check GET "/cart" "cart untouched on unavailable food" 200 '.data.items | length == 1'
check GET "/checkout" "preview flags unavailable item" 200 \
  '.data.issues | length == 1' 
check GET "/checkout" "unavailable item details" 200 \
  '.data.items[0].isAvailable == false and .data.subtotal == 120 and
   .data.issues[0] == "Masala Dosa is unavailable" and .data.itemCount == 0'
mongosh --quiet $DB --eval "db.foods.updateOne({_id: ObjectId('$DOSA')}, {\$set: {isAvailable: true}})" >/dev/null

TEMP_RID=$(mongosh --quiet $DB --eval "print(db.restaurants.insertOne({name: 'Checkout Closed Diner $SUF', image: 'x.jpg', cuisine: 'Indian', deliveryTime: '30 min', rating: 4.2, address: '1 Test Road', isActive: true, createdAt: new Date(), updatedAt: new Date()}).insertedId.toString())")
TEMP_FID=$(mongosh --quiet $DB --eval "print(db.foods.insertOne({name: 'Checkout Closed Food $SUF', price: 90, image: 'x.jpg', category: 'Indian', description: 'temp', restaurant: ObjectId('$TEMP_RID'), isAvailable: true, createdAt: new Date(), updatedAt: new Date()}).insertedId.toString())")
BODY="{\"foodId\":\"$TEMP_FID\"}"
check POST "/cart" "add temp food while restaurant active" 201
mongosh --quiet $DB --eval "db.restaurants.updateOne({_id: ObjectId('$TEMP_RID')}, {\$set: {isActive: false}})" >/dev/null
BODY='{"customerName":"Checkout Fail","phone":"9876543210","address":"1 Fail Road"}'
check POST "/orders" "inactive restaurant -> 400" 400 \
  '.message | contains("One of your restaurants is not accepting orders right now")'
assert_count "no order on inactive restaurant" orders $((ORDER_BASE + 1))
check GET "/cart" "cart untouched on inactive restaurant" 200 '.data.items | length == 2'
check GET "/checkout" "preview flags inactive restaurant" 200 \
  '(.data.issues | length) == 1 and (.data.issues[0] | contains("not accepting orders right now"))'
BODY=""

check DELETE "/cart" "clear cart" 200
mongosh --quiet $DB --eval "db.restaurants.updateOne({_id: ObjectId('$TEMP_RID')}, {\$set: {isActive: true}})" >/dev/null
ORPHAN_FID=$(mongosh --quiet $DB --eval "print(db.foods.insertOne({name: 'Checkout Orphan Food $SUF', price: 75, image: 'x.jpg', category: 'Indian', description: 'temp', restaurant: ObjectId('$TEMP_RID'), isAvailable: true, createdAt: new Date(), updatedAt: new Date()}).insertedId.toString())")
BODY="{\"foodId\":\"$ORPHAN_FID\"}"
check POST "/cart" "add orphan food" 201
BODY=""
mongosh --quiet $DB --eval "db.foods.deleteOne({_id: ObjectId('$ORPHAN_FID')})" >/dev/null
BODY='{"customerName":"Checkout Fail","phone":"9876543210","address":"1 Fail Road"}'
check POST "/orders" "hard-deleted food -> 400 names item" 400 \
  '.message | contains("Checkout Orphan Food")'
assert_count "no order on orphan food" orders $((ORDER_BASE + 1))
check GET "/cart" "cart untouched on orphan food" 200 '.data.items | length == 1'
check GET "/checkout" "preview flags orphan item" 200 \
  '((.data.issues[0] | contains("Checkout Orphan Food")) and
    (.data.issues[0] | contains("is no longer available"))) and
   .data.items[0].isAvailable == false and .data.items[0].price == 0 and
   .data.items[0].restaurant == null and .data.subtotal == 0 and
   .data.deliveryCharge == 0 and .data.total == 0 and .data.itemCount == 0'
BODY=""

echo "--- SECTION 9: LIVE PRICE FLOWS INTO PREVIEW AND ORDER ---"
check DELETE "/cart" "clear cart" 200
BODY="{\"foodId\":\"$DOSA\",\"quantity\":2}"
check POST "/cart" "add dosa x2" 201
BODY="{\"foodId\":\"$NAAN\",\"quantity\":1}"
check POST "/cart" "add naan x1" 201
mongosh --quiet $DB --eval "db.foods.updateOne({_id: ObjectId('$NAAN')}, {\$set: {price: 60}})" >/dev/null
check GET "/checkout" "preview shows new DB price 300" 200 \
  '.data.items[1].price == 60 and .data.items[1].itemTotal == 60 and
   .data.subtotal == 300 and .data.deliveryCharge == 30 and .data.total == 330'
BODY='{"customerName":"Live Price","phone":"9876543210","address":"2 Live Road","subtotal":1,"total":999999}'
check POST "/orders" "order at live price 300/30/330 -> 201" 201 \
  '.data.subtotal == 300 and .data.deliveryCharge == 30 and .data.total == 330'
ORDER2=$(json_field '.data._id')
assert_count "orders incremented by 2" orders $((ORDER_BASE + 2))
mongosh --quiet $DB --eval "db.foods.updateOne({_id: ObjectId('$NAAN')}, {\$set: {price: 40}})" >/dev/null
BODY=""
check GET "/cart" "cart cleared after live price order" 200 '.data.items == []'

echo "--- SECTION 10: OWNERSHIP, TRACKING, CANCEL ---"
check GET "/orders/$ORDER1" "A reads own addressId order -> 200" 200 \
  '.data.deliveryAddress.fullName == "Checkout Addr A" and .data.status == "placed"'
check GET "/orders/$ORDER1/tracking" "tracking endpoint -> 200" 200
TOKEN=$TOKEN_B
check GET "/orders/$ORDER1" "B reads A order -> 404" 404
TOKEN=$TOKEN_A
check PUT "/orders/$ORDER1/cancel" "cancel placed order -> 200" 200 '.data.status == "cancelled"'
check PUT "/orders/$ORDER1/cancel" "cancel again -> 200 idempotent" 200 \
  '.message == "Order is already cancelled"'

echo "--- SECTION 11: LEGACY PATH UNCHANGED ---"
BODY="{\"foodId\":\"$DOSA\"}"
check POST "/cart" "add dosa for legacy check" 201
BODY='{"customerName":"Legacy Spot","phone":"9876543210","address":"9 Legacy St","subtotal":1,"total":999999}'
check POST "/orders" "legacy body -> 201, no addressId path fields" 201 \
  '.data.customerName == "Legacy Spot" and .data.subtotal == 120 and
   .data.deliveryCharge == 30 and .data.total == 150 and
   (.data | has("deliveryAddress") | not) and
   .order.orderId == .data._id and .order.status == "placed" and
   .order.address == "9 Legacy St" and (.order | has("deliveryAddress") | not)'
BODY="{\"foodId\":\"$NAAN\"}"
check POST "/cart" "add naan for mixed body" 201
BODY='{"addressId":"'$ADDR_A'","customerName":"HACKED","phone":"0000000000","address":"evil"}'
check POST "/orders" "addressId wins over legacy fields -> 201" 201 \
  '.data.customerName == "Checkout Addr A" and .data.phone == "9876543211" and
   (.data.address | contains("12A"))'
assert_count "orders incremented by 4" orders $((ORDER_BASE + 4))
BODY=""

echo "--- CLEANUP + RESTORE CHECK ---"
mongosh --quiet $DB --eval "
  const naan = db.foods.findOne({name: 'Butter Naan'});
  if (naan && naan.price !== 40) db.foods.updateOne({_id: naan._id}, {\$set: {price: 40}});
  db.foods.updateOne({name: 'Masala Dosa'}, {\$set: {isAvailable: true}});
  db.foods.deleteMany({name: /^Checkout (Closed|Orphan) Food/});
  db.restaurants.deleteMany({name: /^Checkout Closed Diner/});
  const ids = db.users.find({email: /^mod12/}).toArray().map(u => u._id);
  db.orders.deleteMany({user: {\$in: ids}});
  db.carts.deleteMany({user: {\$in: ids}});
  db.addresses.deleteMany({user: {\$in: ids}});
  db.users.deleteMany({email: /^mod12/});
  print('done');" >/dev/null
AFTER=$(mongosh --quiet $DB --eval 'print([db.orders.countDocuments({}), db.carts.countDocuments({}), db.addresses.countDocuments({})].join(","))')
EXPECT="$ORDER_BASE,$CART_BASE,$ADDR_BASE"
if [ "$AFTER" = "$EXPECT" ]; then
  PASS=$((PASS+1)); echo "PASS  all collection baselines restored ($AFTER)"
else
  FAIL=$((FAIL+1)); echo "FAIL  baselines restored: expected $EXPECT, got $AFTER"
fi
LEFTOVER_REST=$(mongosh --quiet $DB --eval 'print(db.restaurants.countDocuments({name: /^Checkout/}))')
if [ "$LEFTOVER_REST" = "0" ]; then
  PASS=$((PASS+1)); echo "PASS  no leftover Checkout restaurants"
else
  FAIL=$((FAIL+1)); echo "FAIL  leftover Checkout restaurants: $LEFTOVER_REST"
fi
LEFTOVER=$(mongosh --quiet $DB --eval 'print(db.foods.countDocuments({name: /^Checkout/}))')
if [ "$LEFTOVER" = "0" ]; then
  PASS=$((PASS+1)); echo "PASS  no leftover Checkout foods"
else
  FAIL=$((FAIL+1)); echo "FAIL  leftover Checkout foods: $LEFTOVER"
fi
NANNACTUAL=$(mongosh --quiet $DB --eval "print(db.foods.findOne({name: 'Butter Naan'}).price)")
if [ "$NANNACTUAL" = "40" ]; then
  PASS=$((PASS+1)); echo "PASS  Butter Naan price restored to 40"
else
  FAIL=$((FAIL+1)); echo "FAIL  Butter Naan price restored: $NANNACTUAL"
fi
HEALTH=$(curl -s "$BASE/health" | jq -r '.success and .database == "connected"')
if [ "$HEALTH" = "true" ]; then
  PASS=$((PASS+1)); echo "PASS  server healthy after suite"
else
  FAIL=$((FAIL+1)); echo "FAIL  server health after suite"
fi

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && echo "MODULE 12: ALL TESTS PASSED" || echo "MODULE 12: FAILURES PRESENT"
