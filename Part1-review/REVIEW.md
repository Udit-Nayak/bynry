# Part 1 – Code Review & Bug Analysis

## Issues Found

### 1. No input validation whatsoever

The code blindly does `data['name']`, `data['sku']`, etc. If the request body is missing any of these keys, Python throws a `KeyError` and the whole thing crashes with a 500. Even worse — if someone sends malformed JSON, `request.json` returns `None`, and then `None['name']` blows up in a completely confusing way.

**What breaks in prod:** Any bad request (missing field, wrong content-type, empty body) results in an unhandled 500 instead of a clean 400 with a helpful message. Users get no idea what they did wrong.

---

### 2. SKU uniqueness isn't enforced at the application layer

The requirements say SKUs must be unique platform-wide. This code just inserts without checking. Sure, you *could* put a unique constraint at the DB level — but the code doesn't handle that case either. If a duplicate SKU is submitted, the DB throws an `IntegrityError` and again you get an ugly 500.

**What breaks in prod:** Two products end up with the same SKU, or the request fails with a cryptic database error instead of "SKU already exists."

---

### 3. Two separate commits = broken atomicity

This is the sneakiest bug. The code commits the `Product` first, then creates the `Inventory` record in a second commit. If anything goes wrong between those two commits (network hiccup, server restart, the inventory insert itself failing), you end up with a Product in the database that has no inventory record attached to it. The product exists but is essentially invisible to the warehouse system.

**What breaks in prod:** Orphaned product records. The product was "created" but nobody can find it in any warehouse. Support nightmare.

---

### 4. Price has no validation

`price` is stored as-is. Nothing checks that it's actually a number, that it's positive, or that it doesn't have more than 2 decimal places. Someone could send `"price": -50` or `"price": "free"` and it either crashes or stores garbage.

**What breaks in prod:** Negative prices causing calculation errors downstream, or type errors when trying to do any arithmetic on the price later.

---

### 5. No authentication or authorization check

There's no check that the requester actually has permission to add products to the given `warehouse_id`. Any authenticated (or even unauthenticated, depending on setup) user could POST to this endpoint and inject products into any warehouse.

**What breaks in prod:** A user from Company A could add products to Company B's warehouse if they know the warehouse ID.

---

### 6. `initial_quantity` could be missing or negative

It's used directly without any check. If it's missing → crash. If someone sends `-100` → you'd have negative stock from the moment a product is created.

---

### 7. No error response structure

Even the happy path just returns `{"message": "Product created"}`. There's no consistency with what the rest of the API probably looks like, no HTTP status code explicitly set (Flask defaults to 200, but for a creation endpoint it should be 201), and errors return whatever Python/Flask feels like returning.

---

## Fixed Version

```python
from flask import request, jsonify
from sqlalchemy.exc import IntegrityError
from marshmallow import Schema, fields, ValidationError, validate

class CreateProductSchema(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=1, max=255))
    sku = fields.Str(required=True, validate=validate.Length(min=1, max=100))
    price = fields.Decimal(required=True, places=2, as_string=False)
    warehouse_id = fields.Int(required=True)
    initial_quantity = fields.Int(load_default=0, validate=validate.Range(min=0))
    description = fields.Str(load_default=None)

product_schema = CreateProductSchema()

@app.route('/api/products', methods=['POST'])
@require_auth 
def create_product():
    raw_data = request.get_json(silent=True)
    if not raw_data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    try:
        data = product_schema.load(raw_data)
    except ValidationError as e:
        return jsonify({"error": "Validation failed", "details": e.messages}), 400

    if data['price'] <= 0:
        return jsonify({"error": "Price must be greater than zero"}), 400

    warehouse = Warehouse.query.get(data['warehouse_id'])
    if not warehouse:
        return jsonify({"error": "Warehouse not found"}), 404

    existing = Product.query.filter_by(sku=data['sku']).first()
    if existing:
        return jsonify({"error": f"SKU '{data['sku']}' is already in use"}), 409

    try:
        product = Product(
            name=data['name'],
            sku=data['sku'],
            price=data['price'],
            description=data.get('description'),
        )
        db.session.add(product)
        db.session.flush()  # get product.id without committing yet

        inventory = Inventory(
            product_id=product.id,
            warehouse_id=data['warehouse_id'],
            quantity=data['initial_quantity'],
        )
        db.session.add(inventory)

        db.session.commit()  
    except IntegrityError:
        db.session.rollback()
        # Race condition: SKU was taken between our check and the insert
        return jsonify({"error": "SKU conflict, please try again"}), 409
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Failed to create product: {e}")
        return jsonify({"error": "Something went wrong, please try again later"}), 500

    return jsonify({
        "message": "Product created successfully",
        "product_id": product.id,
        "sku": product.sku,
    }), 201
```

### What changed and why

- **Single transaction**: `db.session.flush()` gets the product ID without committing. Both records are committed together at the end. If anything fails, `rollback()` cleans up everything.
- **Schema validation**: Marshmallow handles type checking, required fields, and defaults. Much cleaner than a pile of if-statements.
- **Explicit SKU check**: Returns a 409 with a clear message instead of letting the DB throw.
- **201 status code**: Correct HTTP semantics for resource creation.
- **`get_json(silent=True)`**: Won't crash on a non-JSON body.
- **IntegrityError catch**: Handles the race condition where two requests try to create the same SKU simultaneously.
