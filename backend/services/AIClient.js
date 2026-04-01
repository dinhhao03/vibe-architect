const { GoogleGenAI } = require('@google/genai');
const dotenv = require('dotenv');
dotenv.config();

// Danh sách Model ưu tiên: Pro → Flash → Mock
const MODEL_CASCADE = [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }
];

class AIClient {
    constructor() {
        if (!AIClient.instance) {
            this.apiKey = process.env.GEMINI_API_KEY;
            if (this.apiKey && this.apiKey !== '') {
                this.ai = new GoogleGenAI({ apiKey: this.apiKey });
            } else {
                console.log("[AIClient] No GEMINI_API_KEY found → MOCK mode.");
                this.isMock = true;
            }
            this.currentModelIndex = 0; // Bắt đầu từ Pro
            AIClient.instance = this;
        }
        return AIClient.instance;
    }

    getCurrentModelLabel() {
        if (this.isMock) return 'Local Mock';
        return MODEL_CASCADE[this.currentModelIndex]?.label || 'Unknown';
    }

    async generate(prompt, systemInstruction = '', responseSchema = null) {
        // ===== MOCK MODE =====
        if (this.isMock) {
            return this._getMockData(systemInstruction);
        }

        // ===== CASCADING MODEL LOGIC =====
        // Duyệt từ model hiện tại → cuối danh sách → Mock
        for (let modelIdx = this.currentModelIndex; modelIdx < MODEL_CASCADE.length; modelIdx++) {
            const model = MODEL_CASCADE[modelIdx];
            console.log(`[AIClient] Trying model: ${model.label} (${model.id})`);

            // Mỗi model được retry 2 lần trước khi chuyển sang model tiếp
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    const config = {};
                    if (systemInstruction) config.systemInstruction = systemInstruction;
                    if (responseSchema) {
                        config.responseMimeType = "application/json";
                        config.responseSchema = responseSchema;
                    }

                    const response = await this.ai.models.generateContent({
                        model: model.id,
                        contents: prompt,
                        config: config
                    });

                    // Parse JSON nếu có schema
                    if (responseSchema) {
                        let textStr = response.text.trim();
                        // Strip markdown wrapping nếu AI tự bọc
                        if (textStr.startsWith('```json')) {
                            textStr = textStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
                        } else if (textStr.startsWith('```')) {
                            textStr = textStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
                        }
                        return JSON.parse(textStr);
                    }
                    return response.text;

                } catch (e) {
                    const errStr = String(e.message || e);
                    console.warn(`[AIClient] ${model.label} attempt ${attempt} failed: ${errStr.substring(0, 120)}`);

                    const isQuotaOrOverload = (
                        e.status === 503 || e.status === 429 ||
                        errStr.includes('503') || errStr.includes('429') ||
                        errStr.includes('high demand') || errStr.includes('UNAVAILABLE') ||
                        errStr.includes('quota') || errStr.includes('RESOURCE_EXHAUSTED')
                    );

                    if (isQuotaOrOverload && attempt < 2) {
                        // Retry cùng model sau delay
                        const waitSec = attempt * 3;
                        console.log(`[AIClient] Retrying ${model.label} in ${waitSec}s...`);
                        await new Promise(r => setTimeout(r, waitSec * 1000));
                    } else if (isQuotaOrOverload) {
                        // Hết retry cho model này → chuyển sang model tiếp
                        console.warn(`[AIClient] ⚠️ ${model.label} exhausted → Cascading to next model...`);
                        this.currentModelIndex = modelIdx + 1; // Ghi nhớ để các Agent sau dùng luôn model mới
                        break; // Thoát vòng retry, vào vòng model tiếp
                    } else {
                        // Lỗi khác (API key sai, network...) → throw luôn
                        throw e;
                    }
                }
            }
        }

        // ===== TẤT CẢ MODEL ĐỀ THẤT BẠI → FALLBACK MOCK =====
        console.warn("[AIClient] ⚠️ All cloud models failed → Falling back to LOCAL MOCK data.");
        this.isMock = true;
        return this._getMockData(systemInstruction);
    }

    // ===== MOCK DATA (Tầng cuối cùng, luôn hoạt động) =====
    _getMockData(systemInstruction) {
        // Giả lập delay AI
        return new Promise(resolve => {
            setTimeout(() => {
                if (systemInstruction.includes("Analyst")) {
                    resolve({
                        projectName: "Demo Project (Mock)",
                        projectOverview: "Dự án Demo sinh từ chế độ Mock Local (API hết quota hoặc không có key). Chức năng: Quản lý đơn hàng, Sản phẩm.",
                        userStories: [
                            { id: "US-01", title: "Xem sản phẩm", story: "Là người dùng, tôi muốn xem danh sách sản phẩm." },
                            { id: "US-02", title: "Đặt hàng", story: "Là người dùng, tôi muốn đặt mua sản phẩm." },
                            { id: "US-03", title: "Quản lý đơn", story: "Là admin, tôi muốn quản lý các đơn hàng." }
                        ]
                    });
                } else if (systemInstruction.includes("Architect")) {
                    resolve({
                        erd: 'erDiagram\n  Users {\n    int id PK\n    string username\n    string email\n    string role\n  }\n  Products {\n    int id PK\n    string name\n    float price\n    int stock\n  }\n  Orders {\n    int id PK\n    int user_id FK\n    float total\n    string status\n  }\n  OrderItems {\n    int id PK\n    int order_id FK\n    int product_id FK\n    int quantity\n  }\n  Users ||--o{ Orders : "places"\n  Orders ||--o{ OrderItems : "contains"\n  Products ||--o{ OrderItems : "included_in"',
                        sql: 'CREATE TABLE Users (id SERIAL PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL, email VARCHAR(100), role VARCHAR(20) DEFAULT \'user\');\nCREATE TABLE Products (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, price DECIMAL(10,2) NOT NULL, stock INT DEFAULT 0);\nCREATE TABLE Orders (id SERIAL PRIMARY KEY, user_id INT REFERENCES Users(id), total DECIMAL(10,2), status VARCHAR(20) DEFAULT \'PENDING\', created_at TIMESTAMP DEFAULT NOW());\nCREATE TABLE OrderItems (id SERIAL PRIMARY KEY, order_id INT REFERENCES Orders(id) ON DELETE CASCADE, product_id INT REFERENCES Products(id), quantity INT NOT NULL);'
                    });
                } else if (systemInstruction.includes("Developer")) {
                    // Detect Flask vs Node
                    if (systemInstruction.includes("Flask") || systemInstruction.includes("Python")) {
                        resolve(this._getMockFlask());
                    } else {
                        resolve(this._getMockNode());
                    }
                } else {
                    resolve({ message: "Mock fallback" });
                }
            }, 1500);
        });
    }

    _getMockNode() {
        return {
            readme: "# Mock Node.js Backend\n\n```bash\nnpm install\nnpm start\n```\n\nServer chạy tại http://localhost:3000",
            dependencies: ["express", "cors", "dotenv"],
            dbCode: "// Database connection placeholder\nconst pool = { query: async (sql) => ({ rows: [] }) };\nmodule.exports = pool;",
            appCode: "const express = require('express');\nconst cors = require('cors');\nconst productRoutes = require('./routes/ProductRoute');\nconst orderRoutes = require('./routes/OrderRoute');\n\nconst app = express();\napp.use(cors());\napp.use(express.json());\napp.use('/api/products', productRoutes);\napp.use('/api/orders', orderRoutes);\n\nmodule.exports = app;",
            serverCode: "const app = require('./app');\nconst PORT = process.env.PORT || 3000;\napp.listen(PORT, () => console.log(`Server running on port ${PORT}`));",
            controllers: [
                { filename: "ProductController.js", code: "const db = require('../db');\n\nclass ProductController {\n  static async getAll(req, res) {\n    try {\n      const result = await db.query('SELECT * FROM Products');\n      res.json({ success: true, data: result.rows });\n    } catch (err) { res.status(500).json({ error: err.message }); }\n  }\n  static async create(req, res) {\n    const { name, price, stock } = req.body;\n    try {\n      const result = await db.query('INSERT INTO Products (name, price, stock) VALUES ($1,$2,$3) RETURNING *', [name, price, stock]);\n      res.status(201).json({ success: true, data: result.rows[0] });\n    } catch (err) { res.status(500).json({ error: err.message }); }\n  }\n}\nmodule.exports = ProductController;" },
                { filename: "OrderController.js", code: "const db = require('../db');\n\nclass OrderController {\n  static async getAll(req, res) {\n    try {\n      const result = await db.query('SELECT * FROM Orders');\n      res.json({ success: true, data: result.rows });\n    } catch (err) { res.status(500).json({ error: err.message }); }\n  }\n  static async create(req, res) {\n    const { user_id, total } = req.body;\n    try {\n      const result = await db.query('INSERT INTO Orders (user_id, total) VALUES ($1,$2) RETURNING *', [user_id, total]);\n      res.status(201).json({ success: true, data: result.rows[0] });\n    } catch (err) { res.status(500).json({ error: err.message }); }\n  }\n}\nmodule.exports = OrderController;" }
            ],
            services: [
                { filename: "ProductService.js", code: "class ProductService {\n  static validate(data) {\n    if (!data.name || data.price <= 0) throw new Error('Invalid product');\n    return true;\n  }\n}\nmodule.exports = ProductService;" },
                { filename: "OrderService.js", code: "class OrderService {\n  static validate(data) {\n    if (!data.user_id) throw new Error('Missing user_id');\n    return true;\n  }\n}\nmodule.exports = OrderService;" }
            ],
            routes: [
                { filename: "ProductRoute.js", code: "const router = require('express').Router();\nconst ProductController = require('../controllers/ProductController');\n\nrouter.get('/', ProductController.getAll);\nrouter.post('/', ProductController.create);\n\nmodule.exports = router;" },
                { filename: "OrderRoute.js", code: "const router = require('express').Router();\nconst OrderController = require('../controllers/OrderController');\n\nrouter.get('/', OrderController.getAll);\nrouter.post('/', OrderController.create);\n\nmodule.exports = router;" }
            ]
        };
    }

    _getMockFlask() {
        return {
            readme: "# Mock Flask Backend\n\n```bash\npip install -r requirements.txt\npython run.py\n```\n\nServer chạy tại http://localhost:5000",
            dependencies: ["flask", "flask-cors", "python-dotenv"],
            runCode: "from app import create_app\n\napp = create_app()\n\nif __name__ == '__main__':\n    app.run(debug=True, port=5000)",
            initCode: "from flask import Flask\nfrom flask_cors import CORS\n\ndef create_app():\n    app = Flask(__name__)\n    CORS(app)\n\n    from app.routes.product_routes import product_bp\n    from app.routes.order_routes import order_bp\n    app.register_blueprint(product_bp, url_prefix='/api/products')\n    app.register_blueprint(order_bp, url_prefix='/api/orders')\n\n    return app",
            configCode: "import os\nfrom dotenv import load_dotenv\nload_dotenv()\n\nclass Config:\n    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret')\n    DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///app.db')",
            controllers: [
                { filename: "product_controller.py", code: "from flask import jsonify, request\n\nclass ProductController:\n    @staticmethod\n    def get_all():\n        products = [{'id': 1, 'name': 'Sample Product', 'price': 99.99}]\n        return jsonify({'success': True, 'data': products})\n\n    @staticmethod\n    def create():\n        data = request.get_json()\n        return jsonify({'success': True, 'data': data}), 201" },
                { filename: "order_controller.py", code: "from flask import jsonify, request\n\nclass OrderController:\n    @staticmethod\n    def get_all():\n        orders = [{'id': 1, 'user_id': 1, 'total': 199.99, 'status': 'PENDING'}]\n        return jsonify({'success': True, 'data': orders})\n\n    @staticmethod\n    def create():\n        data = request.get_json()\n        return jsonify({'success': True, 'data': data}), 201" }
            ],
            services: [
                { filename: "product_service.py", code: "class ProductService:\n    @staticmethod\n    def validate(data):\n        if not data.get('name') or data.get('price', 0) <= 0:\n            raise ValueError('Invalid product data')\n        return True" },
                { filename: "order_service.py", code: "class OrderService:\n    @staticmethod\n    def validate(data):\n        if not data.get('user_id'):\n            raise ValueError('Missing user_id')\n        return True" }
            ],
            routes: [
                { filename: "product_routes.py", code: "from flask import Blueprint\nfrom app.controllers.product_controller import ProductController\n\nproduct_bp = Blueprint('products', __name__)\n\n@product_bp.route('/', methods=['GET'])\ndef get_all():\n    return ProductController.get_all()\n\n@product_bp.route('/', methods=['POST'])\ndef create():\n    return ProductController.create()" },
                { filename: "order_routes.py", code: "from flask import Blueprint\nfrom app.controllers.order_controller import OrderController\n\norder_bp = Blueprint('orders', __name__)\n\n@order_bp.route('/', methods=['GET'])\ndef get_all():\n    return OrderController.get_all()\n\n@order_bp.route('/', methods=['POST'])\ndef create():\n    return OrderController.create()" }
            ]
        };
    }
}

// Singleton export
module.exports = new AIClient();
