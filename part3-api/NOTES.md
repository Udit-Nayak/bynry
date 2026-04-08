# Part 3 – Notes & Assumptions


## The main decisions I made

**What counts as "recent sales activity"?**

I went with 30 days. The spec says "recent" but doesn't define it. 30 days is a common default for inventory velocity calculations and gives enough data points to make a meaningful average. This should probably be a configurable setting per company down the line.

**How is `days_until_stockout` calculated?**

`current_stock / avg_daily_sales`, where avg daily sales = total units sold in the last 30 days / 30.

It's a simple linear projection and won't account for seasonal spikes, but it's honest about what it is. A fancier version could use a weighted moving average (recent days count more than older ones), but I'd want to validate whether the product team even wants that complexity before building it.

Returns `null` if we can't compute it. Showing a fake number is worse than showing nothing.

**Why alert per warehouse, not per product?**

A product might be adequately stocked in one warehouse and critically low in another. Collapsing those into one alert would hide the location-specific problem. The frontend can always aggregate if they want a product-level summary view.

**Bundles are excluded**

Bundles don't have their own physical stock — their components do. Alerting on bundle stock doesn't make sense with this model. Component alerts will fire instead. If the product team wants bundle-level alerts calculated from component availability, that's a separate piece of work.

---

## Edge cases handled

- **Company doesn't exist**: 404, not a silent empty list
- **Invalid company_id param**: 400 before we even query the DB
- **Product has no supplier**: `supplier` field comes back as `null` (not an empty object, which would be confusing)
- **Avg daily sales is 0**: `days_until_stockout` is `null`. Can't divide by zero and shouldn't guess.
- **Inactive warehouses/products**: Filtered out. You don't want alerts for things that aren't actually in use.
- **DB connection error**: Caught, logged server-side, generic 500 returned to client

---

## What I'd add with more time

- **Pagination**: If a company has thousands of low-stock products, returning them all at once will be slow. Cursor-based pagination would be the right call here.
- **Caching**: This query is read-heavy and the data doesn't change by the second. A 5-minute Redis cache per company_id would take a lot of pressure off the DB.
- **Configurable time window**: Right now `RECENT_SALES_WINDOW_DAYS` is hardcoded. It could be a query param (`?window=7`) or a company-level setting.
- **Unit tests**: The SQL logic and the response shaping are both testable. I'd mock the DB pool and write tests against known fixture data.
- **Rate limiting**: Low-stock alerts might get polled frequently by a dashboard. Worth throttling to protect the DB.
