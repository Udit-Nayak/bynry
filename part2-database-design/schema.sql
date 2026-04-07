-- StockFlow Database Schema
-- PostgreSQL

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
    location    TEXT,
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
    product_type        VARCHAR(50) NOT NULL DEFAULT 'standard',
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
    movement_type   VARCHAR(50) NOT NULL,
    quantity_delta  INT NOT NULL,
    reference_id    INT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_movements_inventory ON inventory_movements(inventory_id);
CREATE INDEX idx_movements_created ON inventory_movements(created_at);

CREATE TABLE purchase_orders (
    id              SERIAL PRIMARY KEY,
    company_id      INT NOT NULL REFERENCES companies(id),
    supplier_id     INT NOT NULL REFERENCES suppliers(id),
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
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
