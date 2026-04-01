class ProductService:
    @staticmethod
    def validate(data):
        if not data.get('name') or data.get('price', 0) <= 0:
            raise ValueError('Invalid product data')
        return True