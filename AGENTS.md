# AGENTS.md — how to work on Chill-Box

Read this before changing anything. It is the contract, not a suggestion.
`MEMORY.md` says where we are; this says how we work.

---

## 1. The vision

**Twenty fishermen share three solar cold-boxes. Nobody is in charge. This app
is the harbour master.**

A skipper lands at 4 a.m. with a catch worth a week's income and needs one
question answered in one glance: *is there room, and where?* If the app is
slow, wrong, or confusing, the fish spoil. That is the entire product.

Everything below follows from that. When a decision is unclear, ask: **does
this help a tired person with wet hands read the truth faster?**

### Who we build for

- Low-literacy Telugu speakers. Telugu is the default, not a translation.
- Low-end Android phones, cracked screens, one bar of 2G.
- Direct coastal sun. Salt spray. Gloves. One hand on a moving boat.
- People who will not read instructions, ever.

### What success looks like

Fewer spoiled catches and fewer disputes at the quay. Not feature count.

---

## 2. Non-negotiable rules

### Never lie to the user

This is the first rule because every other rule is downstream of it.

- If data may be stale, **say so with a timestamp**. Never show a confident
  number you cannot stand behind.
- If something is refused, give the **real reason**. A blocked boat must not
  be told its hold expired.
- If a control cannot work, **disable it and say why**. Never a dead button.
- **A comment or README line that overstates the code is a defect.** Two
  audits scored this project down for exactly that. If you change behaviour,
  re-derive the comment from the code.

### Honesty about limits

We ship a client-only app with no server-side authorisation. Say so. Do not
describe the PIN, the audit chain, or the booking rules as "secure",
"tamper-proof" or "guaranteed". They are a lock on a shared phone and a
receipt for honest mistakes. The README's "What it is not" section is load
bearing — keep it accurate.

### Concise over clever

The user's standing instruction: **short, readable, maintainable, no
over-engineering.** They must be able to debug it themselves.

- Prefer deleting code to adding an abstraction.
- One concept, one place. `emptySlot`, `releaseSlots`, `STATUS_STYLE`,
  `capLedger` exist so a rule cannot drift between two copies. Keep it so.
- No new dependency without a clear, stated reason. We removed `lucide-react`
  and `@supabase/supabase-js` when they stopped earning their place.

### Comment the *why*, never the *what*

Every non-obvious decision carries a comment explaining the reasoning and,
where relevant, the bug that motivated it. Read a few before writing your
first. Do not write `// set the status` — write why this is a transaction, or
why the clock lives outside the store.

### Rules live in the store, never in components

`store/selectors.ts` and `store/useDockStore.ts` own every harbour rule.
Components render; they do not decide. If you find yourself writing a policy
check in a `.tsx`, it belongs in a selector with a test.

---

## 3. Constraints from the competition brief

These are hard limits. Breaking one disqualifies the entry.

- **Free tier only.** No paid APIs, no paid databases, no auth services.
  Free tiers are explicitly allowed — that is why Firebase Spark is in.
- Must run on free hosting (Vercel).
- Must be responsive and touch-friendly on low-end mobile.
- Must ship with realistic seed data so it works the moment it opens.
- The written trade-offs note must stay **under 300 words**. Check it:
  `sed '1,2d' TRADEOFFS.md | sed 's/\*\*//g' | wc -w`

---

## 4. Design language

Do not redesign. Extend what is here.

- **Sunlight first.** Warm near-white ground, near-black ink, 3 px borders.
  In glare the border survives; fills and shadows do not.
- **60–72 px** targets for primary actions, 44 px minimum for utilities.
- Status is **colour AND shape AND text**. Never colour alone.
- **12-hour clocks** with am/pm. A dock does not read 22:30.
- **Hand-drawn SVG icons only** (`src/icons/`). No emoji — they render
  differently on every Android build and cannot be recoloured for contrast.
- **Boxes are named after landmarks** (Auction Hall / Ice Plant / Diesel
  Bunk), never numbers. A building is easier to remember than a digit.
- CSS component classes live in `@layer components` so Tailwind utilities
  always win the cascade. Putting them outside caused a real bug where `.btn`
  padding silently beat `px-2.5`.

---

## 5. Workflow

### Before you finish, all four must pass

```bash
npm test          # currently 49 tests
npx tsc -b        # no errors
npx oxlint        # zero warnings, zero errors
npm run build     # clean
```

Green tooling is the floor, not the ceiling. Both audits found real defects
with all four green.

### Verify in the browser, not by reasoning

Start the dev server and actually look, at **320 px width**:

```bash
npx vite --port 5173 --strictPort
```

Several bugs here were invisible in code and obvious on screen: the map
bleeding through the tab bar, the harbour rows overlapping, the header
truncating.

### Write a test for every rule you touch

`src/store/rules.test.ts` covers the domain rules, edge cases, analytics and
security. If you fix a bug, add the failing case first.

### Audit before claiming done

For anything substantial, dispatch a subagent with a **hostile** review
prompt — tell it to assume the code is wrong and to prove defects with
reproductions. Both rounds found things worth fixing, including a fix that
had itself caused a worse bug. Then act on the report; do not just file it.

---

## 6. Traps that have already bitten us

- **Shell heredocs and `node -e` mangle template literals, `${}`, and
  non-ASCII.** Writing TypeScript through bash has corrupted files repeatedly.
  Use the Write/Edit tools for anything with backticks or Telugu text.
- **The running app re-persists state every few seconds.** Calling
  `localStorage.clear()` and navigating in one step does not reset the demo —
  the old page writes back first. Use the app's own **Reset demo** button.
- **Vite HMR goes stale** after files are renamed or heavily rewritten. If the
  browser disagrees with the source, restart the dev server and clear
  `node_modules/.vite`.
- **`applyTick` must return the same array when nothing changed.** Breaking
  that re-introduces a 1 Hz re-render and re-serialisation of the whole store.
- **Never put `now` back into the zustand store.** zustand's persist
  middleware serialises the entire store on every `set`; a clock in there cost
  ~11 ms of `JSON.stringify` every second on the target hardware.
- **Seed data must obey the app's own rules.** Seeded occupancy once exceeded
  the 2-crate cap the app advertises.
- **Cap collections per harbour, never globally.** A global `slice(-N)` over a
  list built harbour-by-harbour deleted one harbour's entire history.

---

## 7. Where things live

```
src/
  components/   screens and chrome, one concern each
  data/         harbours, rosters, seeded harbour state
  hooks/        clock, geolocation, marine, connectivity, haptics
  i18n/         one line per string, both languages side by side
  icons/        hand-drawn marine and species SVGs
  lib/          pure logic: geo, nav, time, stats, speech, adminAuth,
                download, harbourSync
  store/        zustand store + selectors — every harbour rule lives here
firebase/       security rules for the shared database
```

Harbour coordinates live in `data/harbours.ts` and **nowhere else**. A real
deployment replaces that one file with surveyed positions.

Every user-visible string goes in `i18n/dictionary.ts` — both languages on one
line, so a translation cannot silently go missing. There is a dead-key check;
run it and keep it at zero.
