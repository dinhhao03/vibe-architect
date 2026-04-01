const { GoogleGenAI } = require('@google/genai');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
dotenv.config();

// ===== CASCADING MODEL PRIORITY =====
const MODEL_CASCADE = [
    { id: 'gemini-2.5-pro',             label: 'Gemini 2.5 Pro' },
    { id: 'gemini-1.5-pro',             label: 'Gemini 1.5 Pro' },
    { id: 'gemini-2.5-flash',           label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.0-flash',           label: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-flash',           label: 'Gemini 1.5 Flash' },
    { id: 'gemini-2.5-flash-lite',      label: 'Gemini 2.5 Flash Lite' },
    { id: 'gemini-2.0-flash-lite',      label: 'Gemini 2.0 Flash Lite' },
];

// ===== RESPONSE CACHE (Chống tịt khi demo) =====
const CACHE_DIR = path.resolve(process.cwd(), '.cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function getCacheKey(prompt, systemInstruction) {
    const raw = `${systemInstruction}||${prompt}`;
    return crypto.createHash('md5').update(raw).digest('hex');
}

function readCache(key) {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    if (fs.existsSync(filePath)) {
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            console.log(`[Cache] HIT — Loaded cached response (saved ${data._cachedAt})`);
            return data.response;
        } catch (e) { /* cache corrupt → ignore */ }
    }
    return null;
}

function writeCache(key, response) {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    try {
        fs.writeFileSync(filePath, JSON.stringify({
            _cachedAt: new Date().toISOString(),
            response
        }, null, 2));
        console.log(`[Cache] SAVED response for future use.`);
    } catch (e) { /* write error → ignore */ }
}

// ===== MULTI-KEY ROTATION =====
function getAllApiKeys() {
    const keys = [];
    // Đọc GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, ...
    if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
    for (let i = 2; i <= 10; i++) {
        const key = process.env[`GEMINI_API_KEY_${i}`];
        if (key && key.trim()) keys.push(key.trim());
    }
    return keys;
}

class AIClient {
    constructor() {
        if (!AIClient.instance) {
            this.apiKeys = getAllApiKeys();
            this.currentKeyIndex = 0;

            if (this.apiKeys.length > 0) {
                this.ai = new GoogleGenAI({ apiKey: this.apiKeys[0] });
                console.log(`[AIClient] Loaded ${this.apiKeys.length} API key(s). Active: Key #1`);
            } else {
                console.log("[AIClient] No API keys found → MOCK mode.");
                this.isMock = true;
            }
            this.currentModelIndex = 0;
            AIClient.instance = this;
        }
        return AIClient.instance;
    }

    _switchToNextKey() {
        this.currentKeyIndex++;
        if (this.currentKeyIndex < this.apiKeys.length) {
            this.ai = new GoogleGenAI({ apiKey: this.apiKeys[this.currentKeyIndex] });
            this.currentModelIndex = 0; // Reset model cascade cho key mới
            console.log(`[AIClient] 🔑 Switched to API Key #${this.currentKeyIndex + 1}`);
            return true;
        }
        return false; // Hết key
    }

    getCurrentModelLabel() {
        if (this.isMock) return 'Local Mock';
        return MODEL_CASCADE[this.currentModelIndex]?.label || 'Unknown';
    }

    async generate(prompt, systemInstruction = '', responseSchema = null) {
        // ===== CHECK CACHE FIRST =====
        const cacheKey = getCacheKey(prompt, systemInstruction);
        const cached = readCache(cacheKey);
        if (cached) return cached;

        // ===== MOCK MODE =====
        if (this.isMock) {
            const mockResult = await this._getMockData(systemInstruction);
            writeCache(cacheKey, mockResult);
            return mockResult;
        }

        // ===== CASCADING MODEL + KEY ROTATION =====
        while (true) {
            for (let modelIdx = this.currentModelIndex; modelIdx < MODEL_CASCADE.length; modelIdx++) {
                const model = MODEL_CASCADE[modelIdx];
                console.log(`[AIClient] Trying: ${model.label} (Key #${this.currentKeyIndex + 1})`);

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

                        if (responseSchema) {
                            let textStr = response.text.trim();
                            if (textStr.startsWith('```json')) {
                                textStr = textStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
                            } else if (textStr.startsWith('```')) {
                                textStr = textStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
                            }
                            const parsed = JSON.parse(textStr);
                            writeCache(cacheKey, parsed);
                            return parsed;
                        }
                        writeCache(cacheKey, response.text);
                        return response.text;

                    } catch (e) {
                        const errStr = String(e.message || e);
                        console.warn(`[AIClient] ${model.label} attempt ${attempt} failed: ${errStr.substring(0, 120)}`);

                        const isQuota = (
                            e.status === 503 || e.status === 429 ||
                            errStr.includes('503') || errStr.includes('429') ||
                            errStr.includes('high demand') || errStr.includes('UNAVAILABLE') ||
                            errStr.includes('quota') || errStr.includes('RESOURCE_EXHAUSTED')
                        );

                        const isNotFound = (
                            e.status === 404 ||
                            errStr.includes('not found') || errStr.includes('NOT_FOUND') ||
                            errStr.includes('not supported')
                        );

                        if (isNotFound) {
                            console.warn(`[AIClient] ⚠️ ${model.label} not available → Skip`);
                            this.currentModelIndex = modelIdx + 1;
                            break;
                        } else if (isQuota && attempt < 2) {
                            const waitSec = attempt * 3;
                            console.log(`[AIClient] Retrying in ${waitSec}s...`);
                            await new Promise(r => setTimeout(r, waitSec * 1000));
                        } else if (isQuota) {
                            console.warn(`[AIClient] ⚠️ ${model.label} exhausted → Next model`);
                            this.currentModelIndex = modelIdx + 1;
                            break;
                        } else {
                            throw e;
                        }
                    }
                }
            }

            // Tất cả model cho key hiện tại đã hết → thử key tiếp
            if (this._switchToNextKey()) {
                console.log(`[AIClient] 🔑 Trying all models again with new API key...`);
                continue; // Restart vòng while với key mới
            }

            // Hết tất cả key + model → Mock
            break;
        }

        console.warn("[AIClient] ⚠️ All keys & models exhausted → MOCK fallback");
        this.isMock = true;
        const mockResult = await this._getMockData(systemInstruction);
        writeCache(cacheKey, mockResult);
        return mockResult;
    }

    // ===== MOCK DATA =====
    _getMockData(systemInstruction) {
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
        const readme = [
            "# E-Commerce Backend API",
            "",
            "RESTful API server sinh bởi **Vibe Architect** — AI Scaffolding Engine.",
            "",
            "## Quick Start",
            "",
            "```bash",
            "# 1. Install dependencies",
            "npm install",
            "",
            "# 2. Configure environment",
            "cp .env.example .env",
            "",
            "# 3. Setup database",
            "psql -U postgres -f database/schema.sql",
            "",
            "# 4. Start server",
            "npm start",
            "```",
            "",
            "## API Endpoints",
            "",
            "| Method | Endpoint | Description |",
            "|--------|----------|-------------|",
            "| GET | `/api/products` | List all products |",
            "| POST | `/api/products` | Create a product |",
            "| GET | `/api/orders` | List all orders |",
            "| POST | `/api/orders` | Create an order |",
            "",
            "## Project Structure",
            "",
            "```",
            "├── src/",
            "│   ├── app.js          # Express app setup",
            "│   ├── server.js       # Entry point",
            "│   ├── db.js           # PostgreSQL Pool",
            "│   ├── controllers/    # Request handlers",
            "│   ├── services/       # Business logic",
            "│   └── routes/         # API routes",
            "├── database/schema.sql",
            "├── docs/ (SRS.md, ERD.mmd)",
            "├── .env.example",
            "└── package.json",
            "```",
            "",
            "## Tech Stack",
            "- Node.js + Express.js",
            "- PostgreSQL",
            "- MVC Architecture"
        ].join("\\n");

        return {
            readme: readme,
            dependencies: ["express", "cors", "dotenv", "pg"],
            dbCode: "const { Pool } = require('pg');\\nrequire('dotenv').config();\\n\\nconst pool = new Pool({\\n  connectionString: process.env.DATABASE_URL,\\n});\\n\\npool.on('error', (err) => {\\n  console.error('Database pool error:', err);\\n});\\n\\nmodule.exports = {\\n  query: (text, params) => pool.query(text, params),\\n  pool\\n};",
            appCode: "const express = require('express');\\nconst cors = require('cors');\\nrequire('dotenv').config();\\n\\nconst productRoutes = require('./routes/ProductRoute');\\nconst orderRoutes = require('./routes/OrderRoute');\\n\\nconst app = express();\\n\\napp.use(cors());\\napp.use(express.json());\\napp.use(express.urlencoded({ extended: true }));\\n\\napp.get('/api/health', (req, res) => {\\n  res.json({ status: 'ok', timestamp: new Date().toISOString() });\\n});\\n\\napp.use('/api/products', productRoutes);\\napp.use('/api/orders', orderRoutes);\\n\\napp.use((req, res) => {\\n  res.status(404).json({ error: 'Route not found' });\\n});\\n\\napp.use((err, req, res, next) => {\\n  console.error('[Error]', err.stack);\\n  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });\\n});\\n\\nmodule.exports = app;",
            serverCode: "const app = require('./app');\\nconst PORT = process.env.PORT || 3000;\\n\\nconst server = app.listen(PORT, () => {\\n  console.log(`Server running at http://localhost:${PORT}`);\\n  console.log(`Health: http://localhost:${PORT}/api/health`);\\n});\\n\\nprocess.on('SIGTERM', () => {\\n  server.close(() => process.exit(0));\\n});",
            controllers: [
                { filename: "ProductController.js", code: "const db = require('../db');\\nconst ProductService = require('../services/ProductService');\\n\\nclass ProductController {\\n  static async getAll(req, res, next) {\\n    try {\\n      const result = await db.query('SELECT * FROM Products ORDER BY id');\\n      res.json({ success: true, data: result.rows });\\n    } catch (err) { next(err); }\\n  }\\n\\n  static async getById(req, res, next) {\\n    try {\\n      const result = await db.query('SELECT * FROM Products WHERE id = $1', [req.params.id]);\\n      if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });\\n      res.json({ success: true, data: result.rows[0] });\\n    } catch (err) { next(err); }\\n  }\\n\\n  static async create(req, res, next) {\\n    try {\\n      ProductService.validate(req.body);\\n      const { name, price, stock } = req.body;\\n      const result = await db.query('INSERT INTO Products (name, price, stock) VALUES ($1, $2, $3) RETURNING *', [name, price, stock || 0]);\\n      res.status(201).json({ success: true, data: result.rows[0] });\\n    } catch (err) { next(err); }\\n  }\\n\\n  static async update(req, res, next) {\\n    try {\\n      const { name, price, stock } = req.body;\\n      const result = await db.query('UPDATE Products SET name=COALESCE($1,name), price=COALESCE($2,price), stock=COALESCE($3,stock) WHERE id=$4 RETURNING *', [name, price, stock, req.params.id]);\\n      if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });\\n      res.json({ success: true, data: result.rows[0] });\\n    } catch (err) { next(err); }\\n  }\\n\\n  static async delete(req, res, next) {\\n    try {\\n      const result = await db.query('DELETE FROM Products WHERE id=$1 RETURNING id', [req.params.id]);\\n      if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });\\n      res.json({ success: true, message: 'Deleted' });\\n    } catch (err) { next(err); }\\n  }\\n}\\nmodule.exports = ProductController;" },
                { filename: "OrderController.js", code: "const db = require('../db');\\nconst OrderService = require('../services/OrderService');\\n\\nclass OrderController {\\n  static async getAll(req, res, next) {\\n    try {\\n      const result = await db.query('SELECT * FROM Orders ORDER BY created_at DESC');\\n      res.json({ success: true, data: result.rows });\\n    } catch (err) { next(err); }\\n  }\\n\\n  static async getById(req, res, next) {\\n    try {\\n      const result = await db.query('SELECT * FROM Orders WHERE id=$1', [req.params.id]);\\n      if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });\\n      res.json({ success: true, data: result.rows[0] });\\n    } catch (err) { next(err); }\\n  }\\n\\n  static async create(req, res, next) {\\n    try {\\n      OrderService.validate(req.body);\\n      const { user_id, total } = req.body;\\n      const result = await db.query('INSERT INTO Orders (user_id, total) VALUES ($1, $2) RETURNING *', [user_id, total]);\\n      res.status(201).json({ success: true, data: result.rows[0] });\\n    } catch (err) { next(err); }\\n  }\\n\\n  static async updateStatus(req, res, next) {\\n    try {\\n      const { status } = req.body;\\n      const result = await db.query('UPDATE Orders SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);\\n      if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });\\n      res.json({ success: true, data: result.rows[0] });\\n    } catch (err) { next(err); }\\n  }\\n}\\nmodule.exports = OrderController;" }
            ],
            services: [
                { filename: "ProductService.js", code: "class ProductService {\\n  static validate(data) {\\n    if (!data.name || typeof data.name !== 'string') {\\n      const err = new Error('Product name is required');\\n      err.status = 400; throw err;\\n    }\\n    if (data.price === undefined || data.price <= 0) {\\n      const err = new Error('Price must be positive');\\n      err.status = 400; throw err;\\n    }\\n    return true;\\n  }\\n}\\nmodule.exports = ProductService;" },
                { filename: "OrderService.js", code: "class OrderService {\\n  static validate(data) {\\n    if (!data.user_id) {\\n      const err = new Error('user_id is required');\\n      err.status = 400; throw err;\\n    }\\n    if (data.total !== undefined && data.total < 0) {\\n      const err = new Error('Total cannot be negative');\\n      err.status = 400; throw err;\\n    }\\n    return true;\\n  }\\n}\\nmodule.exports = OrderService;" }
            ],
            routes: [
                { filename: "ProductRoute.js", code: "const router = require('express').Router();\\nconst C = require('../controllers/ProductController');\\n\\nrouter.get('/', C.getAll);\\nrouter.get('/:id', C.getById);\\nrouter.post('/', C.create);\\nrouter.put('/:id', C.update);\\nrouter.delete('/:id', C.delete);\\n\\nmodule.exports = router;" },
                { filename: "OrderRoute.js", code: "const router = require('express').Router();\\nconst C = require('../controllers/OrderController');\\n\\nrouter.get('/', C.getAll);\\nrouter.get('/:id', C.getById);\\nrouter.post('/', C.create);\\nrouter.patch('/:id/status', C.updateStatus);\\n\\nmodule.exports = router;" }
            ]
        };
    }

    _getMockFlask() {
        return {
            readme: "# Flask Backend API\\n\\nSinh bởi **Vibe Architect** — AI Scaffolding Engine.\\n\\n## Quick Start\\n\\n```bash\\npip install -r requirements.txt\\ncp .env.example .env\\npython run.py\\n```\\n\\nServer: http://localhost:5000\\n\\n## API\\n| Method | Endpoint | Description |\\n|--------|----------|-------------|\\n| GET | /api/products | List products |\\n| POST | /api/products | Create product |\\n| GET | /api/orders | List orders |\\n| POST | /api/orders | Create order |\\n\\n## Structure\\n```\\n├── run.py\\n├── app/\\n│   ├── __init__.py      # Factory\\n│   ├── config.py\\n│   ├── controllers/\\n│   ├── services/\\n│   └── routes/\\n├── requirements.txt\\n└── .env.example\\n```",
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

module.exports = new AIClient();
