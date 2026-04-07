const express = require("express");
const router = express.Router();
const pool = require("../db/pool");

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/companies/:company_id/alerts/low-stock
//
// Returns a list of products that are below their low-stock threshold
// and have had at least one sale in the last 30 days.
//
// Assumptions I made (things I'd normally clarify first):
//  - "Recent sales activity" = at least 1 sale movement in the last 30 days.
//    The spec didn't define "recent" so 30 days felt reasonable for inventory.
//  - Sales are tracked as negative quantity_delta rows with movement_type='sale'
//    in the inventory_movements table.
//  - days_until_stockout is calculated as: current_qty / avg_daily_sales.
//    If avg daily sales rounds to 0, we return null (can't divide by zero, and
//    it'd be misleading to show a number there).
//  - We alert per warehouse, not per product globally. A product might be fine
//    in one warehouse but critically low in another — those should be separate alerts.
//  - Bundles are excluded from alerts for now. Their components are tracked instead.
//    This is something I'd validate with the product team.
// ─────────────────────────────────────────────────────────────────────────────

const RECENT_SALES_WINDOW_DAYS = 30;

router.get("/companies/:company_id/alerts/low-stock", async (req, res) => {
  const { company_id } = req.params;

  if (!company_id || isNaN(parseInt(company_id))) {
    return res
      .status(400)
      .json({ error: "company_id must be a valid integer" });
  }

  const companyId = parseInt(company_id);

  try {
    const companyCheck = await pool.query(
      "SELECT id FROM companies WHERE id = $1",
      [companyId],
    );
    if (companyCheck.rows.length === 0) {
      return res.status(404).json({ error: "Company not found" });
    }

    // 1. We join products → inventory → warehouses to get current stock per
    //    warehouse.
    //
    // 2. We LEFT JOIN to a subquery (recent_sales) that sums up all outbound
    //    movements in the last 30 days. LEFT JOIN because a product might have
    //    zero sales — we still want it in the result so we can filter on it.
    //
    // 3. We filter: only rows where current quantity < threshold AND total
    //    units sold in the window > 0 (the "recent activity" requirement).
    //
    // 4. We pull in supplier info via another LEFT JOIN. Not every product
    //    has a supplier so LEFT JOIN is correct here too.
    //
    // 5. avg_daily_sales is (total sold / window days). We NULLIF the divisor
    //    to avoid a division-by-zero error if somehow the window is 0.

    const query = `
      WITH recent_sales AS (
        -- Sum up all units sold per inventory record over the last N days.
        -- quantity_delta is negative for sales, so we ABS it.
        SELECT
          im.inventory_id,
          SUM(ABS(im.quantity_delta)) AS total_sold
        FROM inventory_movements im
        WHERE
          im.movement_type = 'sale'
          AND im.created_at >= NOW() - INTERVAL '${RECENT_SALES_WINDOW_DAYS} days'
        GROUP BY im.inventory_id
      )

      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.sku,
        p.low_stock_threshold AS threshold,
        w.id AS warehouse_id,
        w.name AS warehouse_name,
        i.quantity AS current_stock,
        COALESCE(rs.total_sold, 0) AS total_sold_in_window,
        ROUND(
          COALESCE(rs.total_sold, 0)::NUMERIC
          / NULLIF(${RECENT_SALES_WINDOW_DAYS}, 0),
          2
        ) AS avg_daily_sales,
        CASE
          WHEN COALESCE(rs.total_sold, 0) = 0 THEN NULL
          ELSE CEIL(
            i.quantity::NUMERIC
            / (COALESCE(rs.total_sold, 0)::NUMERIC / ${RECENT_SALES_WINDOW_DAYS})
          )
        END AS days_until_stockout,
        s.id AS supplier_id,
        s.name AS supplier_name,
        s.contact_email AS supplier_email

      FROM products p
      JOIN inventory i          ON i.product_id    = p.id
      JOIN warehouses w         ON w.id            = i.warehouse_id
      LEFT JOIN recent_sales rs ON rs.inventory_id = i.id
      LEFT JOIN suppliers s     ON s.id            = p.supplier_id

      WHERE
        p.company_id    = $1
        AND p.is_active = TRUE
        AND w.is_active = TRUE
        AND p.product_type != 'bundle'         -- bundles don't have direct stock
        AND i.quantity < p.low_stock_threshold -- below threshold
        AND COALESCE(rs.total_sold, 0) > 0     -- must have had recent sales

      ORDER BY
        -- Sort by most urgent first: lowest days_until_stockout.
        -- NULLs go to the end since we couldn't estimate them.
        days_until_stockout ASC NULLS LAST,
        current_stock ASC
    `;

    const result = await pool.query(query, [companyId]);

    const alerts = result.rows.map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      sku: row.sku,
      warehouse_id: row.warehouse_id,
      warehouse_name: row.warehouse_name,
      current_stock: row.current_stock,
      threshold: row.threshold,
      days_until_stockout:
        row.days_until_stockout !== null
          ? parseInt(row.days_until_stockout)
          : null,
      supplier: row.supplier_id
        ? {
            id: row.supplier_id,
            name: row.supplier_name,
            contact_email: row.supplier_email,
          }
        : null, // null instead of an empty object — cleaner for the frontend to handle
    }));

    return res.status(200).json({
      alerts,
      total_alerts: alerts.length,
    });
  } catch (err) {
    // Don't leak internal error details to the client.
    // Log the full thing server-side and return something generic.
    console.error(`[low-stock] Error for company ${companyId}:`, err);
    return res
      .status(500)
      .json({ error: "Something went wrong, please try again later" });
  }
});

module.exports = router;
