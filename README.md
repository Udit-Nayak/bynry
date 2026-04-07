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
