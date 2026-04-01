class OrderService:
    @staticmethod
    def validate(data):
        if not data.get('user_id'):
            raise ValueError('Missing user_id')
        return True