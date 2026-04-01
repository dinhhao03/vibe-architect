from flask import Blueprint
from app.controllers.order_controller import OrderController

order_bp = Blueprint('orders', __name__)

@order_bp.route('/', methods=['GET'])
def get_all():
    return OrderController.get_all()

@order_bp.route('/', methods=['POST'])
def create():
    return OrderController.create()