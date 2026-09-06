#!/usr/bin/env bash
#
# Prove what the DEPLOYED rules actually do, with two real signed-in phones.
#
#   npx -y firebase-tools deploy --only database --project chill-box-e5d6b
#   bash scripts/verify-rules.sh
#
# Nine audit rounds kept finding rules claims that were true in the file and
# false in the database, or the reverse. Reading the rules is not verifying
# them: round 7 shipped a force-release rule that could never fire, and every
# rehearsal passed because every seeded boat is unbound. This asks the
# database.
#
# It writes only under `harbours/ruletest`, which the app never loads — the
# three real harbour ids are fixed in src/data/harbours.ts. Delete that node
# whenever you like; nothing reads it. Note it leaves three ledger rows that
# nobody can delete, because the ledger is append-only by rule, which is
# itself one of the things this checks.
#
# Needs .env.local for the web API key and the database URL. Neither is a
# secret — both ship in the bundle — but neither is echoed here.
set -u
cd "$(dirname "$0")/.."

KEY=$(grep -i "VITE_FIREBASE_API_KEY" .env.local | cut -d= -f2- | tr -d '"' | tr -d "\r")
DB=$(grep -i "DATABASE_URL" .env.local | cut -d= -f2- | tr -d '"' | tr -d "\r")
# A FRESH namespace every run, and it has to be.
#
# A boat can never be deleted and its `uid` can never be reassigned — both
# deliberate, both verified below — so the second run of this script under a
# fixed name found boat 01 bound to a uid from the first run and every
# legitimate write refused. The probe reported fourteen failures that were
# entirely its own. Residue is the price of testing rules whose whole point
# is that they refuse to forget: delete `harbours/probe-*` from the console
# when it bothers you. Nothing reads it.
H="$DB/harbours/probe-$(date +%s)"
[ -z "$KEY" ] || [ -z "$DB" ] && { echo "no .env.local config"; exit 1; }

signup() {
  curl -s -X POST -H 'Content-Type: application/json' -d '{"returnSecureToken":true}' \
    "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$KEY"
}
A=$(signup); B=$(signup)
TA=$(echo "$A" | grep -o '"idToken": *"[^"]*"' | cut -d'"' -f4)
TB=$(echo "$B" | grep -o '"idToken": *"[^"]*"' | cut -d'"' -f4)
UA=$(echo "$A" | grep -o '"localId": *"[^"]*"' | cut -d'"' -f4)
UB=$(echo "$B" | grep -o '"localId": *"[^"]*"' | cut -d'"' -f4)
[ -z "$TA" ] || [ -z "$TB" ] && { echo "sign-in FAILED — is Anonymous auth enabled?"; exit 1; }

fails=0
# want(PASS|DENY) label method path token [body]
check() {
  want=$1; label=$2; method=$3; path=$4; tok=$5; body=${6:-}
  if [ -n "$body" ]; then
    out=$(curl -s -X "$method" -H 'Content-Type: application/json' -d "$body" "$H/$path.json?auth=$tok")
  else
    out=$(curl -s -X "$method" "$H/$path.json?auth=$tok")
  fi
  denied=$(echo "$out" | grep -c "Permission denied")
  if { [ "$want" = DENY ] && [ "$denied" = 1 ]; } || { [ "$want" = PASS ] && [ "$denied" = 0 ]; }; then
    echo "  ok   [$want] $label"
  else
    fails=$((fails + 1))
    echo "  FAIL [$want] $label -> $(echo "$out" | tr -d '\n' | head -c 160)"
  fi
}

NOW=$(( $(date +%s) * 1000 ))
OLD=$(( NOW - 7*3600*1000 ))          # deposited 7 h ago: past the 6 h overstay
EXPIRED=$(( NOW - 5*3600*1000 ))      # reserved 5 h ago: past the 4 h hold
BOAT='{"name":"Probe","owner":"Probe Owner","mobileLast4":"1234","status":"active","registeredAt":'"$NOW"'}'
SLOT_R='{"status":"reserved","boatId":"01","species":"prawn","reservedAt":'"$NOW"'}'

echo "== what the app itself must be allowed to do =="
check PASS "register a boat bound to this phone"   PUT   "boats/01" "$TA" "${BOAT%\}},\"uid\":\"$UA\"}"
check PASS "register a boat with no binding"       PUT   "boats/02" "$TB" "$BOAT"
check PASS "claim an unbound boat"                 PUT   "boats/02/uid" "$TB" "\"$UB\""
check PASS "hold a crate"                          PUT   "boxes/box1/0" "$TA" "$SLOT_R"
check PASS "deposit into it"                       PUT   "boxes/box1/0" "$TA" '{"status":"occupied","boatId":"01","species":"prawn","depositedAt":'"$NOW"',"plannedOutAt":'"$NOW"'}'
check PASS "release it"                            PUT   "boxes/box1/0" "$TA" '{"status":"empty"}'
check PASS "approve a boat (a child write)"        PATCH "boats/01" "$TA" '{"status":"active"}'
check PASS "seed several slots at once"            PATCH "boxes" "$TA" '{"box2/0":{"status":"empty"},"box2/1":{"status":"empty"}}'

echo "== a crate belongs to a boat, and a boat to a phone =="
check DENY "B cannot reassign A's boat"            PUT   "boats/01/uid" "$TB" "\"$UB\""
check DENY "B cannot drop the binding"             PUT   "boats/01" "$TB" "$BOAT"
check PASS "A holds a crate again"                 PUT   "boxes/box1/0" "$TA" "$SLOT_R"
check DENY "B cannot claim a slot for A's boat"    PUT   "boxes/box1/1" "$TB" "$SLOT_R"
check DENY "B cannot overwrite A's live hold"      PUT   "boxes/box1/0" "$TB" '{"status":"empty"}'
check DENY "B cannot delete A's slot"              DELETE "boxes/box1/0" "$TB"
check DENY "B cannot empty the boxes node"         PATCH "boxes" "$TB" '{"box1/0":{"status":"empty"}}'
check DENY "B cannot invent box9"                  PUT   "boxes/box9/0" "$TB" '{"status":"empty"}'
check DENY "B cannot invent slot 47"               PUT   "boxes/box1/47" "$TB" '{"status":"empty"}'
check DENY "…nor by writing one child of it"       PUT   "boxes/box1/47/status" "$TB" '"empty"'

# These run on box3, not box1, and deliberately. Erasing `depositedAt` is
# what makes a crate unclearable, so doing it on the slot the next section
# force-releases turned one failure into two and hid which was which.
echo "== a slot always stays a well-formed slot =="
check PASS "A stores a crate on box3"              PUT   "boxes/box3/0" "$TA" '{"status":"occupied","boatId":"01","depositedAt":'"$OLD"'}'
check DENY "even A cannot erase its timestamp"     DELETE "boxes/box3/0/depositedAt" "$TA"
check DENY "even A cannot erase its status"        DELETE "boxes/box3/0/status" "$TA"
check DENY "a crate cannot be stored with no boat" PUT   "boxes/box2/0" "$TB" '{"status":"occupied","depositedAt":'"$NOW"'}'

echo "== the harbour can take back what it has given up on =="
check PASS "A stores a crate, 7 h ago"             PUT   "boxes/box1/0" "$TA" '{"status":"occupied","boatId":"01","depositedAt":'"$OLD"'}'
check PASS "B CAN clear a crate 7 h overdue"       PUT   "boxes/box1/0" "$TB" '{"status":"empty"}'
check PASS "A stores a crate just now"             PUT   "boxes/box1/0" "$TA" '{"status":"occupied","boatId":"01","depositedAt":'"$NOW"'}'
check DENY "B cannot clear one still in time"      PUT   "boxes/box1/0" "$TB" '{"status":"empty"}'
check PASS "A holds a crate, reserved 5 h ago"     PUT   "boxes/box1/2" "$TA" '{"status":"reserved","boatId":"01","reservedAt":'"$EXPIRED"'}'
check PASS "B CAN take a hold that ran out"        PUT   "boxes/box1/2" "$TB" '{"status":"empty"}'

echo "== identity cannot be rewritten =="
check DENY "B cannot change A's last four digits"  PATCH "boats/01" "$TB" '{"mobileLast4":"9999"}'
check DENY "…nor erase them to reset the rule"     DELETE "boats/01/mobileLast4" "$TB"
check DENY "…nor erase the owner's name"           DELETE "boats/01/owner" "$TB"
check DENY "a boat can never be deleted"           DELETE "boats/01" "$TA"

echo "== the ledger is append-only =="
ROW='{"boatId":"01","boxId":"box1","crates":1,"depositedAt":'"$OLD"',"releasedAt":'"$NOW"',"overstay":false}'
check PASS "anyone may append a row"               PUT    "ledger/probe-$NOW" "$TA" "$ROW"
check DENY "nobody may edit it"                    PUT    "ledger/probe-$NOW" "$TB" "$ROW"
check DENY "nobody may edit one field of it"       PATCH  "ledger/probe-$NOW" "$TA" '{"crates":2}'
check DENY "nobody may delete it"                  DELETE "ledger/probe-$NOW" "$TA"

echo
if [ "$fails" = 0 ]; then
  echo "all checks passed against the deployed rules"
else
  echo "$fails CHECK(S) FAILED — the deployed rules do not match the file"
fi
exit "$fails"
