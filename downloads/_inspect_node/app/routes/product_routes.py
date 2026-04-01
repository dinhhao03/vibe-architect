from flask import Blueprint
from app.controllers.product_controller import ProductController

product_bp = Blueprint('products', __name__)

@product_bp.route('/', methods=['GET'])
def get_all():
    return ProductController.get_all()

@product_bp.route('/', methods=['POST'])
def create():
    return ProductController.create()