from flask import jsonify, request

class OrderController:
    @staticmethod
    def get_all():
        orders = [{'id': 1, 'user_id': 1, 'total': 199.99, 'status': 'PENDING'}]
        return jsonify({'success': True, 'data': orders})

    @staticmethod
    def create():
        data = request.get_json()
        return jsonify({'success': True, 'data': data}), 201