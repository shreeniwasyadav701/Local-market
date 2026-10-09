#!/bin/bash
BASE="http://localhost:5000/api"
DB=local_market
PASS=0; FAIL=0
TMP=/tmp/opencode/payments_body.json
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

assert_count() {
  local label=$1 coll=$2 expected=$3 got
  got=$(mongosh --quiet $DB --eval "print(db.$coll.countDocuments({}))")
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
ADMIN_EMAIL="mod13admin$SUF@example.com"
A_EMAIL="mod13a$SUF@example.com"
B_EMAIL="mod13b$SUF@example.com"
register() {
  curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
    -d "{\"name\":\"$1\",\"email\":\"$2\",\"phone\":\"$3\",\"password\":\"secret123\"}" | jq -r '.data.token'
}
TOKEN_ADMIN=$(register "Payment Admin" "$ADMIN_EMAIL" "9876543241")
TOKEN_A=$(register "Payer A" "$A_EMAIL" "9876543242")
TOKEN_B=$(register "Payer B" "$B_EMAIL" "9876543243")
{ [ -z "$TOKEN_A" ] || [ "$TOKEN_A" = "null" ]; } && { echo "FATAL: no token A"; exit 1; }
{ [ -z "$TOKEN_B" ] || [ "$TOKEN_B" = "null" ]; } && { echo "FATAL: no token B"; exit 1; }
{ [ -z "$TOKEN_ADMIN" ] || [ "$TOKEN_ADMIN" = "null" ]; } && { echo "FATAL: no admin token"; exit 1; }
mongosh --quiet $DB --eval "db.users.updateOne({email: '$ADMIN_EMAIL'}, {\$set: {role: 'admin'}})" >/dev/null

BASE_COUNTS=$(mongosh --quiet $DB --eval 'print([db.orders.countDocuments({}), db.carts.countDocuments({}), db.addresses.countDocuments({}), db.payments.countDocuments({})].join(","))')
ORDER_BASE=$(echo "$BASE_COUNTS" | cut -d, -f1)
CART_BASE=$(echo "$BASE_COUNTS" | cut -d, -f2)
ADDR_BASE=$(echo "$BASE_COUNTS" | cut -d, -f3)
PAY_BASE=$(echo "$BASE_COUNTS" | cut -d, -f4)
gpay() { TOKEN=$TOKEN_ADMIN; curl -s -g -H "Authorization: Bearer $TOKEN_ADMIN" "$BASE/admin/payments$1" | jq -r '.pagination.totalPayments'; TOKEN=""; }
BASE_SUCC=$(gpay "?status=SUCCESS")
BASE_PEND=$(gpay "?status=PENDING")
BASE_FAIL=$(gpay "?status=FAILED")
BASE_REF=$(gpay "?status=REFUNDED")
echo "baselines: orders=$ORDER_BASE carts=$CART_BASE addresses=$ADDR_BASE payments=$PAY_BASE succ=$BASE_SUCC pend=$BASE_PEND fail=$BASE_FAIL ref=$BASE_REF"

GHOST=6ac695f9e5c9d8a1ffffff00
DOSA=$(curl -s "$BASE/foods?search=dosa" | jq -r '.data[] | select(.name == "Masala Dosa") | ._id')
NAAN=$(curl -s "$BASE/foods?search=naan" | jq -r '.data[] | select(.name == "Butter Naan") | ._id')
{ [ -z "$DOSA" ] || [ -z "$NAAN" ]; } && { echo "FATAL: seed foods not found"; exit 1; }

echo "--- SECTION 1: AUTH / AUTHZ ---"
check POST "/payments/mock" "create payment no token -> 401" 401
check GET "/payments" "history no token -> 401" 401
check GET "/payments/order/$GHOST" "status no token -> 401" 401
check GET "/admin/payments" "admin list no token -> 401" 401
TOKEN=$TOKEN_A
check GET "/admin/payments" "admin list as customer -> 403" 403
check PATCH "/admin/payments/$GHOST/refund" "refund as customer -> 403" 403
BODY=""

echo "--- SECTION 2: SETUP ORDERS (MODULE 12 FLOW) ---"
TOKEN=$TOKEN_A
BODY="{\"foodId\":\"$DOSA\",\"quantity\":2}"
check POST "/cart" "A add dosa x2" 201
BODY="{\"foodId\":\"$NAAN\",\"quantity\":1}"
check POST "/cart" "A add naan x1" 201
BODY='{"customerName":"Payer A","phone":"9876543242","address":"1 Pay Road"}'
check POST "/orders" "A places ORDER_A -> 201" 201 '.data.total == 310'
ORDER_A=$(json_field '.data._id')
BODY="{\"foodId\":\"$DOSA\",\"quantity\":1}"
check POST "/cart" "A add dosa x1 for COD order" 201
BODY='{"customerName":"Payer A","phone":"9876543242","address":"1 Pay Road"}'
check POST "/orders" "A places ORDER_A2 (COD) -> 201" 201 '.data.total == 150'
ORDER_A2=$(json_field '.data._id')
BODY="{\"foodId\":\"$DOSA\",\"quantity\":1}"
check POST "/cart" "A add dosa x1 for A3" 201
BODY='{"customerName":"Payer A","phone":"9876543242","address":"1 Pay Road"}'
check POST "/orders" "A places ORDER_A3 -> 201" 201 '.data.total == 150'
ORDER_A3=$(json_field '.data._id')
TOKEN=$TOKEN_B
BODY="{\"foodId\":\"$DOSA\",\"quantity\":1}"
check POST "/cart" "B add dosa x1" 201
BODY='{"customerName":"Payer B","phone":"9876543243","address":"2 B Road"}'
check POST "/orders" "B places ORDER_B -> 201" 201 '.data.total == 150'
ORDER_B=$(json_field '.data._id')
BODY=""
assert_count "orders = baseline + 4" orders $((ORDER_BASE + 4))

echo "--- SECTION 3: MOCK PAYMENT SUCCESS ---"
TOKEN=$TOKEN_A
BODY="{\"orderId\":\"$ORDER_A\",\"paymentMethod\":\"MOCK_CARD\"}"
check POST "/payments/mock" "MOCK_CARD success -> 201" 201 \
  '.success == true and .message == "Mock payment successful" and
   .payment.status == "SUCCESS" and .payment.amount == 310 and
   .payment.currency == "INR" and .payment.method == null and
   .payment.paymentMethod == "MOCK_CARD" and
   (.payment.transactionId | startswith("MOCK_TXN_")) and
   (.payment.paymentId | length) > 0 and .payment.orderId == "'"$ORDER_A"'"'
A1_PID=$(json_field '.payment.paymentId')
A1_TXN=$(json_field '.payment.transactionId')
BODY=""
assert_count "no duplicate order created" orders $((ORDER_BASE + 4))
assert_db "order marked paid, status untouched" \
  "(o => o.paymentStatus + '|' + o.status + '|' + o.statusHistory.length + '|' + o.total)(db.orders.findOne({_id: ObjectId('$ORDER_A')}))" \
  "paid|placed|1|310"
assert_db "no second SUCCESS payment row" \
  "db.payments.countDocuments({orderId: ObjectId('$ORDER_A'), paymentStatus: 'SUCCESS'})" "1"

echo "--- SECTION 4: DUPLICATE PAYMENT BLOCKED ---"
BODY="{\"orderId\":\"$ORDER_A\",\"paymentMethod\":\"MOCK_CARD\"}"
check POST "/payments/mock" "repeat MOCK_CARD -> 409" 409 '.message == "Order has already been paid"'
BODY="{\"orderId\":\"$ORDER_A\",\"paymentMethod\":\"MOCK_UPI\"}"
check POST "/payments/mock" "MOCK_UPI after success -> 409" 409 '.message == "Order has already been paid"'
BODY="{\"orderId\":\"$ORDER_A\",\"paymentMethod\":\"COD\"}"
check POST "/payments/mock" "COD after success -> 409" 409 '.message == "Order has already been paid"'
BODY=""
assert_count "payments count unchanged after dupes" payments $((PAY_BASE + 1))

echo "--- SECTION 5: MOCK PAYMENT FAILURE ---"
TOKEN=$TOKEN_B
BODY="{\"orderId\":\"$ORDER_B\",\"paymentMethod\":\"MOCK_CARD\",\"testResult\":\"FAILED\"}"
check POST "/payments/mock" "explicit FAILED -> 201" 201 \
  '.message == "Mock payment failed" and .payment.status == "FAILED" and
   .payment.amount == 150 and (.payment.transactionId | startswith("MOCK_TXN_"))'
assert_db "failed payment leaves order pending" \
  "db.orders.findOne({_id: ObjectId('$ORDER_B')}).paymentStatus" "pending"
BODY="{\"orderId\":\"$ORDER_B\",\"paymentMethod\":\"MOCK_CARD\",\"testResult\":\"CANCELLED\"}"
check POST "/payments/mock" "arbitrary testResult -> 400" 400 '.message | contains("Invalid test result")'
BODY="{\"orderId\":\"$ORDER_B\",\"paymentMethod\":\"MOCK_CARD\",\"testResult\":\"SUCCESS\"}"
check POST "/payments/mock" "testResult SUCCESS -> 201" 201 '.payment.status == "SUCCESS"'
BODY=""
assert_count "payments count = base + 3" payments $((PAY_BASE + 3))
UPI_PID=$(json_field '.payment.paymentId')
BODY="{\"orderId\":\"$ORDER_B\",\"paymentMethod\":\"MOCK_UPI\"}"
check POST "/payments/mock" "B duplicate after success -> 409" 409 '.message == "Order has already been paid"'
BODY=""

echo "--- SECTION 6: AMOUNT NEVER TRUSTED ---"
TOKEN=$TOKEN_A
BODY="{\"orderId\":\"$ORDER_A3\",\"paymentMethod\":\"MOCK_CARD\",\"amount\":1}"
check POST "/payments/mock" "amount 1 -> 400 mismatch" 400 '.message == "Amount does not match order total"'
assert_db "A3 still unpaid after amount attack" \
  "db.orders.findOne({_id: ObjectId('$ORDER_A3')}).paymentStatus" "pending"
assert_count "no payment created on amount attack" payments $((PAY_BASE + 3))
BODY="{\"orderId\":\"$ORDER_A3\",\"paymentMethod\":\"MOCK_CARD\",\"amount\":\"abc\"}"
check POST "/payments/mock" "amount abc -> 400 mismatch" 400 '.message == "Amount does not match order total"'
BODY=""

echo "--- SECTION 7: COD PAYMENT ---"
BODY="{\"orderId\":\"$ORDER_A2\",\"paymentMethod\":\"cod\"}"
check POST "/payments/mock" "COD lowercase input -> 201 pending" 201 \
  '.message == "COD payment is pending" and .payment.status == "PENDING" and
   .payment.paymentMethod == "COD" and .payment.transactionId == null and
   .payment.amount == 150'
COD_PID=$(json_field '.payment.paymentId')
assert_db "COD leaves order paymentStatus pending" \
  "db.orders.findOne({_id: ObjectId('$ORDER_A2')}).paymentStatus" "pending"
BODY="{\"orderId\":\"$ORDER_A2\",\"paymentMethod\":\"COD\",\"testResult\":\"FAILED\"}"
check POST "/payments/mock" "COD repeat with testResult -> 200 idempotent" 200 \
  '.message == "COD payment is pending" and .payment.paymentId == "'"$COD_PID"'"'
BODY=""
assert_count "no duplicate COD row" payments $((PAY_BASE + 4))

echo "--- SECTION 8: GET PAYMENT STATUS ---"
check GET "/payments/order/$ORDER_A" "owner reads success status" 200 \
  '.data.paymentId == "'"$A1_PID"'" and .data.orderId == "'"$ORDER_A"'" and
   .data.amount == 310 and .data.currency == "INR" and
   .data.paymentMethod == "MOCK_CARD" and .data.paymentStatus == "SUCCESS" and
   .data.transactionId == "'"$A1_TXN"'" and
   (.data.createdAt | length) > 0 and (.data.updatedAt | length) > 0'
check GET "/payments/order/$ORDER_A2" "COD status visible" 200 \
  '.data.paymentStatus == "PENDING" and .data.transactionId == null and
   .data.paymentMethod == "COD"'
check GET "/payments/order/$ORDER_A3" "unpaid order -> 404" 404 '.message == "Payment not found"'
check GET "/payments/order/bad-id" "invalid order id -> 400" 400 '.message | contains("Invalid orderId")'
check GET "/payments/order/$GHOST" "ghost order -> 404" 404 '.message == "Order not found"'
TOKEN=$TOKEN_B
check GET "/payments/order/$ORDER_A" "B reads A status -> 404" 404 '.message == "Order not found"'
check GET "/payments/order/$ORDER_B" "B reads own status -> 200" 200 '.data.paymentStatus == "SUCCESS"'
TOKEN=$TOKEN_ADMIN
check GET "/payments/order/$ORDER_A" "admin reads any status -> 200" 200 '.data.paymentStatus == "SUCCESS"'

echo "--- SECTION 9: PAYMENT HISTORY ---"
TOKEN=$TOKEN_A
check GET "/payments" "A history -> 2 newest first" 200 \
  '.count == 2 and .pagination.totalItems == 2 and .pagination.totalPages == 1 and
   .data[0].paymentStatus == "PENDING" and .data[0].paymentMethod == "COD" and
   .data[0].transactionId == null and
   .data[1].paymentStatus == "SUCCESS" and
   (.data[1].transactionId | startswith("MOCK_TXN_")) and
   ([.. | objects | select(has("cardNumber"))] | length) == 0 and
   ([.. | objects | select(has("cvv"))] | length) == 0 and
   ([.. | objects | select(has("upiPin"))] | length) == 0'
check GET "/payments" "A history fields complete" 200 \
  '.data[0] | has("paymentId") and has("orderId") and has("amount") and
   has("paymentMethod") and has("paymentStatus") and has("transactionId") and
   has("createdAt")'
check GET "/payments?limit=1" "history limit 1" 200 \
  '.count == 1 and .pagination.totalItems == 2 and .pagination.totalPages == 2'
check GET "/payments?limit=1&page=2" "history page 2" 200 '.count == 1 and .pagination.page == 2'
check GET "/payments?page=999" "history page beyond end" 200 '.count == 0'
check GET "/payments?limit=999" "history limit capped 50" 200 '.pagination.limit == 50'
check GET "/payments?limit=abc" "history limit garbage" 200 '.pagination.limit == 10'
check GET "/payments?page=abc" "history page garbage" 200 '.pagination.page == 1'
TOKEN=$TOKEN_B
check GET "/payments" "B history only own 2" 200 \
  '.count == 2 and .pagination.totalItems == 2 and
   ([.data[].paymentStatus] | sort) == ["FAILED", "SUCCESS"]'

echo "--- SECTION 10: ADMIN PAYMENT LIST ---"
TOKEN=$TOKEN_ADMIN
check GET "/admin/payments" "admin list all" 200 \
  '.count == 4 and .pagination.totalPayments == '"$((PAY_BASE + 4))"' and
   .pagination.page == 1 and .pagination.limit == 10 and
   (.payments[0].customer.name | length) > 0 and
   ([.payments[].customer | select(has("email"))] | length) == 0 and
   ([.. | objects | select(has("password"))] | length) == 0'
check GET "/admin/payments?status=SUCCESS" "admin filter SUCCESS" 200 \
  '.pagination.totalPayments == '"$((BASE_SUCC + 2))"' and
   ([.payments[].paymentStatus] | unique) == ["SUCCESS"]'
check GET "/admin/payments?status=PENDING" "admin filter PENDING" 200 \
  '.pagination.totalPayments == '"$((BASE_PEND + 1))"' and
   ([.payments[].paymentStatus] | unique) == ["PENDING"]'
check GET "/admin/payments?status=FAILED" "admin filter FAILED" 200 \
  '.pagination.totalPayments == '"$((BASE_FAIL + 1))"' and
   ([.payments[].paymentStatus] | unique) == ["FAILED"]'
check GET "/admin/payments?status=REFUNDED" "admin filter REFUNDED (none yet)" 200 \
  '.pagination.totalPayments == '"$BASE_REF"' and (.payments | length) == 0'
check GET "/admin/payments?status=success" "admin filter lowercase success" 200 \
  '.pagination.totalPayments == '"$((BASE_SUCC + 2))"''
check GET "/admin/payments?status=PAID" "admin invalid status -> 400" 400 \
  '.message | contains("Invalid status value")'
check GET "/admin/payments?limit=1" "admin pagination limit 1" 200 \
  '.count == 1 and .pagination.totalPages == 4'

echo "--- SECTION 11: MOCK REFUND ---"
check PATCH "/admin/payments/$A1_PID/refund" "refund success payment -> 200" 200 \
  '.message == "Payment refunded" and .payment.status == "REFUNDED" and
   .payment.paymentId == "'"$A1_PID"'" and .payment.amount == 310 and
   .payment.updatedAt != .payment.createdAt'
check PATCH "/admin/payments/$A1_PID/refund" "refund again -> 409" 409 \
  '.message == "Payment has already been refunded"'
check PATCH "/admin/payments/$COD_PID/refund" "refund COD pending -> 400" 400 \
  '.message | contains("Only successful payments can be refunded")'
FAIL_PID=$(mongosh --quiet $DB --eval "print(db.payments.findOne({paymentStatus: 'FAILED'})._id.toString())")
check PATCH "/admin/payments/$FAIL_PID/refund" "refund FAILED -> 400" 400 \
  '.message | contains("Only successful payments can be refunded")'
check PATCH "/admin/payments/$GHOST/refund" "refund ghost -> 404" 404 '.message == "Payment not found"'
check PATCH "/admin/payments/bad-id/refund" "refund bad id -> 400" 400 '.message | contains("Invalid paymentId")'
TOKEN=$TOKEN_A
check GET "/payments/order/$ORDER_A" "status now REFUNDED" 200 \
  '.data.paymentStatus == "REFUNDED" and .data.paymentId == "'"$A1_PID"'"'
BODY="{\"orderId\":\"$ORDER_A\",\"paymentMethod\":\"MOCK_UPI\"}"
check POST "/payments/mock" "re-pay after refund -> 201 new payment" 201 \
  '.payment.status == "SUCCESS" and .payment.paymentId != "'"$A1_PID"'" and
   .payment.paymentMethod == "MOCK_UPI"'
A2_PID=$(json_field '.payment.paymentId')
BODY="{\"orderId\":\"$ORDER_A\",\"paymentMethod\":\"MOCK_CARD\"}"
check POST "/payments/mock" "duplicate after re-pay -> 409" 409 '.message == "Order has already been paid"'
BODY=""
assert_count "payments = baseline + 5 at end" payments $((PAY_BASE + 5))
TOKEN=$TOKEN_ADMIN
check GET "/admin/payments?status=REFUNDED" "admin sees 1 refunded" 200 \
  '.pagination.totalPayments == '"$((BASE_REF + 1))"''

echo "--- SECTION 12: SECURITY / INPUT VALIDATION ---"
TOKEN=$TOKEN_B
BODY="{\"orderId\":\"$ORDER_A\",\"paymentMethod\":\"MOCK_CARD\"}"
check POST "/payments/mock" "B pays A order -> 404" 404 '.message == "Order not found"'
TOKEN=$TOKEN_A
BODY="{\"orderId\":\"$GHOST\",\"paymentMethod\":\"MOCK_CARD\"}"
check POST "/payments/mock" "ghost order -> 404" 404 '.message == "Order not found"'
BODY="{\"orderId\":\"bad-id\",\"paymentMethod\":\"MOCK_CARD\"}"
check POST "/payments/mock" "malformed order id -> 400" 400 '.message | contains("Invalid order id")'
BODY="{}"
check POST "/payments/mock" "empty body -> 400" 400 '.message == "orderId is required"'
BODY="{\"orderId\":\"$ORDER_A3\"}"
check POST "/payments/mock" "missing method -> 400" 400 '.message == "paymentMethod is required"'
BODY="{\"orderId\":\"$ORDER_A3\",\"paymentMethod\":\"STRIPE\"}"
check POST "/payments/mock" "unknown method -> 400" 400 '.message | contains("Invalid payment method")'
BODY="{\"orderId\":\"$ORDER_A3\",\"paymentMethod\":\"mock_card\",\"currency\":\"USD\",\"cardNumber\":\"4111111111111111\",\"cvv\":\"123\",\"upiPin\":\"9999\",\"otp\":\"000000\",\"bankPassword\":\"hunter2\"}"
check POST "/payments/mock" "extra card fields ignored -> 201" 201 \
  '.payment.status == "SUCCESS" and .payment.paymentMethod == "MOCK_CARD" and
   .payment.currency == "INR" and
   (.payment | has("cardNumber") | not) and (.payment | has("cvv") | not) and
   (.payment | has("upiPin") | not) and (.payment | has("otp") | not) and
   (.payment | has("bankPassword") | not)'
BODY=""
assert_count "orders still baseline + 4" orders $((ORDER_BASE + 4))
assert_db "historical order total untouched" \
  "db.orders.findOne({_id: ObjectId('$ORDER_A')}).total" "310"
assert_db "no credential fields stored on payment docs" \
  "db.payments.countDocuments({\$or: [{cardNumber: {\$exists: true}}, {cvv: {\$exists: true}}, {upiPin: {\$exists: true}}, {otp: {\$exists: true}}, {bankPassword: {\$exists: true}}]})" "0"

echo "--- CLEANUP + RESTORE ---"
mongosh --quiet $DB --eval "
  const ids = db.users.find({email: /^mod13/}).toArray().map(u => u._id);
  db.payments.deleteMany({userId: {\$in: ids}});
  db.orders.deleteMany({user: {\$in: ids}});
  db.carts.deleteMany({user: {\$in: ids}});
  db.addresses.deleteMany({user: {\$in: ids}});
  db.users.deleteMany({email: /^mod13/});
  print('done');" >/dev/null
AFTER=$(mongosh --quiet $DB --eval 'print([db.orders.countDocuments({}), db.carts.countDocuments({}), db.addresses.countDocuments({}), db.payments.countDocuments({})].join(","))')
EXPECT="$ORDER_BASE,$CART_BASE,$ADDR_BASE,$PAY_BASE"
if [ "$AFTER" = "$EXPECT" ]; then
  PASS=$((PASS+1)); echo "PASS  all collection baselines restored ($AFTER)"
else
  FAIL=$((FAIL+1)); echo "FAIL  baselines restored: expected $EXPECT, got $AFTER"
fi
LEFTOVER=$(mongosh --quiet $DB --eval 'print(db.users.countDocuments({email: /^mod13/}))')
if [ "$LEFTOVER" = "0" ]; then
  PASS=$((PASS+1)); echo "PASS  no leftover mod13 users"
else
  FAIL=$((FAIL+1)); echo "FAIL  leftover mod13 users: $LEFTOVER"
fi
HEALTH=$(curl -s "$BASE/health" | jq -r '.success and .database == "connected"')
if [ "$HEALTH" = "true" ]; then
  PASS=$((PASS+1)); echo "PASS  server healthy after suite"
else
  FAIL=$((FAIL+1)); echo "FAIL  server health after suite"
fi

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && echo "MODULE 13: ALL TESTS PASSED" || echo "MODULE 13: FAILURES PRESENT"
