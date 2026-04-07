# StockFlow – Take-Home Assessment

## Structure

```
stockflow/
├── part1-code-review/
│   └── REVIEW.md           # Bug analysis + corrected Flask endpoint
├── part2-database-design/
│   ├── DESIGN.md           # Schema walkthrough, decisions, open questions
│   └── schema.sql          # Runnable PostgreSQL DDL
└── part3-api/
    ├── src/
    │   ├── app.js              # Express entry point
    │   ├── routes/alerts.js    # Low-stock alert endpoint
    │   ├── db/pool.js          # PostgreSQL connection pool
    │   └── middleware/auth.js  # Auth middleware (placeholder)
    ├── package.json
    ├── .env.example
    └── NOTES.md            # Assumptions, edge cases, what I'd add next
```

## Assumptions log

A few things were ambiguous in the spec and I had to make calls. I've documented them in each part's file, but here's the summary:

- **SKU uniqueness is per-company**, not global. Two different companies can reuse the same SKU string.
- **"Recent sales activity"** means at least one sale in the last 30 days.
- **Bundles** don't carry their own stock — their components do. Alerts fire on components.
- **Suppliers are global** (shared across companies). I'd confirm this before shipping.
- **`days_until_stockout`** is a simple linear projection based on 30-day average velocity. Returns `null` when it can't be computed rather than showing a misleading number.
- Part 3 uses the schema from Part 2. If the actual DB differs, the query would need adjusting.

## How to run Part 3

```bash
cd part3-api
cp .env.example .env     # add your DB credentials
npm install
npm run dev

# Test it:
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/companies/1/alerts/low-stock
```
