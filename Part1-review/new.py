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