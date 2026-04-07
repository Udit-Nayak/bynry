# Part 2 – Database Design

## How I approached this

The requirements are intentionally vague in a few spots, so I made some calls and flagged the ones where I'd need to loop in the product team before going to production. I'll explain my reasoning as I go rather than just dumping a schema.

---

## The Schema

```sql
CREATE TABLE companies (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    email       VARCHAR(255) UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE warehouses (
    id          SERIAL PRIMARY KEY,
    company_id  INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    location    TEXT,                         -- city/address, kept flexible for now
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_warehouses_company ON warehouses(company_id);

CREATE TABLE suppliers (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    contact_email   VARCHAR(255),
    contact_phone   VARCHAR(50),
    website         VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
    id                  SERIAL PRIMARY KEY,
    company_id          INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    supplier_id         INT REFERENCES suppliers(id) ON DELETE SET NULL,
    name                VARCHAR(255) NOT NULL,
    sku                 VARCHAR(100) NOT NULL,
    description         TEXT,
    price               NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    product_type        VARCHAR(50) NOT NULL DEFAULT 'standard', -- 'standard' | 'bundle'
    low_stock_threshold INT NOT NULL DEFAULT 10,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(company_id, sku)   
);

CREATE INDEX idx_products_company ON products(company_id);
CREATE INDEX idx_products_supplier ON products(supplier_id);

CREATE TABLE bundle_items (
    bundle_product_id       INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    component_product_id    INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity                INT NOT NULL CHECK (quantity > 0),

    PRIMARY KEY (bundle_product_id, component_product_id),
    CHECK (bundle_product_id != component_product_id)
);

CREATE TABLE inventory (
    id              SERIAL PRIMARY KEY,
    product_id      INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    warehouse_id    INT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    quantity        INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(product_id, warehouse_id)
);

CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_warehouse ON inventory(warehouse_id);

CREATE TABLE inventory_movements (
    id              SERIAL PRIMARY KEY,
    inventory_id    INT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    movement_type   VARCHAR(50) NOT NULL,   -- 'sale', 'purchase', 'adjustment', 'transfer'
    quantity_delta  INT NOT NULL,            -- negative for stock going out, positive for in
    reference_id    INT,                     -- e.g. order_id or purchase_order_id
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_movements_inventory ON inventory_movements(inventory_id);
CREATE INDEX idx_movements_created ON inventory_movements(created_at);

CREATE TABLE purchase_orders (
    id              SERIAL PRIMARY KEY,
    company_id      INT NOT NULL REFERENCES companies(id),
    supplier_id     INT NOT NULL REFERENCES suppliers(id),
    status          VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending','confirmed','received','cancelled'
    ordered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expected_at     TIMESTAMPTZ,
    received_at     TIMESTAMPTZ,
    notes           TEXT
);

CREATE TABLE purchase_order_items (
    id                  SERIAL PRIMARY KEY,
    purchase_order_id   INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id          INT NOT NULL REFERENCES products(id),
    quantity_ordered    INT NOT NULL CHECK (quantity_ordered > 0),
    quantity_received   INT NOT NULL DEFAULT 0,
    unit_cost           NUMERIC(12, 2)
);
```

---

## Design Decisions Worth Explaining

**Why `NUMERIC(12,2)` for price instead of `FLOAT`?**
Floating point types are notorious for rounding errors in financial data. `NUMERIC` is exact. I've seen bugs in prod where `FLOAT` addition gives you `19.999999998` instead of `20.00`. Not worth the risk.

**Why a separate `inventory_movements` table instead of just updating the quantity?**
Two reasons. First, it gives you a complete history — you can see exactly what happened to stock levels over time, which is invaluable for debugging and for customer disputes. Second, it lets you calculate sales velocity (how fast a product is selling), which is exactly what the low-stock alert endpoint needs to estimate days until stockout.

**Why `ON DELETE SET NULL` for supplier on products?**
If a supplier is removed from the system, you probably don't want to cascade-delete all the products they supplied. The product still exists, it just no longer has a linked supplier. `RESTRICT` would prevent supplier deletion entirely which is probably too aggressive.

**Why `UNIQUE(company_id, sku)`?**
I made the call that SKUs are unique per company, not globally. It'd be unusual for a B2B platform to enforce global SKU uniqueness — Company A's "WID-001" and Company B's "WID-001" are different products. That said, this is definitely something to confirm with the product team.

**The `low_stock_threshold` on the product itself:**
The spec says threshold varies by product type. I put it directly on the product row so each product can have its own threshold, which is more flexible than a lookup table per type. Could be changed later if needed.

---

## Questions I'd Ask the Product Team

**1. Are suppliers global or per-company?**
Right now suppliers are a shared table. But maybe each company manages their own supplier list? That changes the schema significantly (supplier_id would need a company_id FK).

**2. Can one product have multiple suppliers?**
I modeled it as one supplier per product. But what if a company sources the same product from two different suppliers depending on price? That would need a junction table.

**3. What does "bundle" mean for inventory?**
Does selling a bundle deduct stock from the individual components, or does the bundle itself have its own stock level? The schema supports component tracking, but the deduction logic depends on the answer.

**4. Do we need multi-currency support?**
All prices are in a single currency right now. If companies operate internationally, we'd need a currency column or a separate pricing table.

**5. Should inventory quantities ever go negative?**
I have `CHECK (quantity >= 0)`, which prevents it at the DB level. But some businesses legitimately allow backorders (selling items you don't have yet). Worth clarifying before that constraint causes issues.

**6. What does "recent sales activity" mean for low-stock alerts?**
Last 7 days? Last 30 days? This matters a lot for calculating velocity. I assumed 30 days in the API implementation.

**7. Are warehouses soft-deleted or hard-deleted?**
I have `is_active` on warehouses for soft delete. But ON DELETE CASCADE on inventory would hard-delete stock records if a warehouse is removed. These need to be consistent.
