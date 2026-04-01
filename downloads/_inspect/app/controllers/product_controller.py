from flask import jsonify, request

class ProductController:
    @staticmethod
    def get_all():
        products = [{'id': 1, 'name': 'Sample Product', 'price': 99.99}]
        return jsonify({'success': True, 'data': products})

    @staticmethod
    def create():
        data = request.get_json()
        return jsonify({'success': True, 'data': data}), 201