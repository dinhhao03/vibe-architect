'use strict';

require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODEL_CASCADE = [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
];

const QUOTA_STATUS = new Set([429, 503]);
const QUOTA_MSGS = ['429', '503', 'quota', 'RESOURCE_EXHAUSTED', 'high demand', 'UNAVAILABLE'];
const SKIP_STATUS = new Set([404]);
const SKIP_MSGS = ['not found', 'NOT_FOUND', 'not supported'];
const BADKEY_STATUS = new Set([400, 403]);
const BADKEY_MSGS = ['API key not valid', 'API_KEY_INVALID', 'INVALID_ARGUMENT', 'Permission denied'];

const MAX_RETRIES = 2;
const RETRY_BASE_SEC = 3;
const TIMEOUT_MS = 300_000;
const MAX_API_KEYS = 10;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const CACHE_DIR = path.resolve(__dirname, '../../.cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

function cacheKey(prompt, systemInstruction) {
    return crypto.createHash('sha256').update(`${systemInstruction}||${prompt}`).digest('hex');
}

function cacheRead(key) {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    if (!fs.existsSync(filePath)) return null;

    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const cachedAt = new Date(data._cachedAt).getTime();
        if (!cachedAt || Date.now() - cachedAt > CACHE_TTL_MS) {
            fs.unlinkSync(filePath);
            return null;
        }

        console.log(`[Cache] HIT - ${Math.round((Date.now() - cachedAt) / 1000)}s old`);
        return data.response;
    } catch {
        return null;
    }
}

function cacheWrite(key, response) {
    try {
        fs.writeFileSync(
            path.join(CACHE_DIR, `${key}.json`),
            JSON.stringify({ _cachedAt: new Date().toISOString(), response }, null, 2)
        );
    } catch (error) {
        console.warn('[Cache] Write failed:', error.message);
    }
}

function loadApiKeys() {
    const keys = [];
    if (process.env.GEMINI_API_KEY?.trim()) keys.push(process.env.GEMINI_API_KEY.trim());

    for (let i = 2; i <= MAX_API_KEYS; i += 1) {
        const key = process.env[`GEMINI_API_KEY_${i}`];
        if (key?.trim()) keys.push(key.trim());
    }

    return keys;
}

function classifyError(error) {
    const message = String(error?.message ?? error);
    if (BADKEY_STATUS.has(error?.status) || BADKEY_MSGS.some(token => message.includes(token))) return 'BAD_KEY';
    if (SKIP_STATUS.has(error?.status) || SKIP_MSGS.some(token => message.includes(token))) return 'SKIP';
    if (QUOTA_STATUS.has(error?.status) || QUOTA_MSGS.some(token => message.includes(token))) return 'QUOTA';
    return 'FATAL';
}

function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

function withTimeout(promise, timeoutMs) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`AI request timed out after ${timeoutMs / 1000}s`)), timeoutMs);
        }),
    ]);
}

function parseJsonSafe(text) {
    return JSON.parse(
        text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    );
}

class AIClient {
    constructor() {
        this.apiKeys = loadApiKeys();
        this.keyIndex = 0;
        this.modelIndex = 0;
        this.isMock = this.apiKeys.length === 0;
        this.client = this.isMock ? null : new GoogleGenAI({ apiKey: this.apiKeys[0] });
        this.lastResultMeta = {
            source: this.isMock ? 'mock' : 'live',
            cacheHit: false,
            model: this.isMock ? 'Mock' : MODEL_CASCADE[0].label,
        };

        console.log(this.isMock
            ? '[AIClient] No API keys found - MOCK mode'
            : `[AIClient] ${this.apiKeys.length} key(s) loaded. Active: Key #1`);
    }

    getCurrentModelLabel() {
        if (this.isMock) return 'Mock';
        return MODEL_CASCADE[this.modelIndex]?.label ?? MODEL_CASCADE[0].label;
    }

    getLastResultMeta() {
        return { ...this.lastResultMeta };
    }

    async generate(prompt, systemInstruction = '', responseSchema = null) {
        const key = cacheKey(prompt, systemInstruction);
        const cached = cacheRead(key);
        if (cached !== null) {
            this.lastResultMeta = {
                source: 'live',
                cacheHit: true,
                model: MODEL_CASCADE[this.modelIndex]?.label ?? MODEL_CASCADE[0].label,
            };
            return cached;
        }

        if (this.isMock) {
            this.lastResultMeta = { source: 'mock', cacheHit: false, model: 'Mock' };
            return this._mock(systemInstruction);
        }

        return withTimeout(
            this._callWithFallback(prompt, systemInstruction, responseSchema, key),
            TIMEOUT_MS
        );
    }

    _rotateKey() {
        this.keyIndex += 1;
        if (this.keyIndex < this.apiKeys.length) {
            this.client = new GoogleGenAI({ apiKey: this.apiKeys[this.keyIndex] });
            this.modelIndex = 0;
            console.log(`[AIClient] Rotated to Key #${this.keyIndex + 1}`);
            return true;
        }

        return false;
    }

    async _callWithFallback(prompt, systemInstruction, responseSchema, cacheKeyValue) {
        while (true) {
            let skipToNextKey = false;

            for (let modelIdx = this.modelIndex; modelIdx < MODEL_CASCADE.length; modelIdx += 1) {
                const model = MODEL_CASCADE[modelIdx];
                console.log(`[AIClient] Key #${this.keyIndex + 1} -> ${model.label}`);

                for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
                    try {
                        const result = await this._callModel(model.id, prompt, systemInstruction, responseSchema);
                        this.modelIndex = modelIdx;
                        this.lastResultMeta = { source: 'live', cacheHit: false, model: model.label };
                        cacheWrite(cacheKeyValue, result);
                        return result;
                    } catch (error) {
                        const kind = classifyError(error);
                        const message = String(error?.message ?? error).substring(0, 160);
                        console.warn(`[AIClient] ${model.label} attempt ${attempt} [${kind}]: ${message}`);

                        if (kind === 'BAD_KEY') {
                            skipToNextKey = true;
                            break;
                        }
                        if (kind === 'SKIP') break;
                        if (kind === 'FATAL') throw error;

                        if (attempt < MAX_RETRIES) {
                            await sleep(attempt * RETRY_BASE_SEC);
                        } else {
                            break;
                        }
                    }
                }

                if (skipToNextKey) break;
            }

            if (this._rotateKey()) continue;
            break;
        }

        console.warn('[AIClient] All keys and models exhausted - using MOCK for this request only');
        this.lastResultMeta = { source: 'mock', cacheHit: false, model: 'Mock' };
        return this._mock(systemInstruction);
    }

    async _callModel(modelId, prompt, systemInstruction, responseSchema) {
        const config = {};
        if (systemInstruction) config.systemInstruction = systemInstruction;
        if (responseSchema) {
            config.responseMimeType = 'application/json';
            config.responseSchema = responseSchema;
        }

        const raw = await this.client.models.generateContent({
            model: modelId,
            contents: prompt,
            config,
        });

        return responseSchema ? parseJsonSafe(raw.text) : raw.text;
    }

    async _mock(systemInstruction) {
        return this._getMockData(systemInstruction);
    }

    _getMockData(systemInstruction) {
        return new Promise(resolve => {
            setTimeout(() => {
                if (systemInstruction.includes('Analyst')) resolve(this._mockSrs());
                else if (systemInstruction.includes('Architect')) resolve(this._mockArchitecture());
                else if (systemInstruction.includes('Developer')) resolve(this._mockBackend());
                else resolve({ message: 'mock' });
            }, 600);
        });
    }

    _mockSrs() {
        return {
            projectName: 'demo-project',
            isFlask: false,
            projectOverview: 'Mock mode - API quota exhausted or no key configured. This is a sample e-commerce project.',
            userStories: [
                { id: 'US-01', title: 'Browse Products', story: 'As a user, I want to browse available products.', acceptanceCriteria: ['Product list loads within 2s', 'Each item shows name, price, stock'] },
                { id: 'US-02', title: 'Place Order', story: 'As a user, I want to place an order for products.', acceptanceCriteria: ['Can add items to cart', 'Order is created and confirmed'] },
                { id: 'US-03', title: 'Manage Orders', story: 'As an admin, I want to manage all customer orders.', acceptanceCriteria: ['Can view all orders', 'Can update order status'] },
                { id: 'US-04', title: 'Manage Products', story: 'As an admin, I want to add and update product listings.', acceptanceCriteria: ['Can create product', 'Can update price and stock'] },
                { id: 'US-05', title: 'User Registration', story: 'As a visitor, I want to register an account.', acceptanceCriteria: ['Email is unique', 'Password is hashed on storage'] },
            ],
        };
    }

    _mockArchitecture() {
        return {
            db_structure: {
                tables: [
                    { name: 'users', columns: [{ name: 'id', type: 'int' }, { name: 'username', type: 'string' }, { name: 'email', type: 'string' }, { name: 'role', type: 'string' }] },
                    { name: 'products', columns: [{ name: 'id', type: 'int' }, { name: 'name', type: 'string' }, { name: 'price', type: 'float' }, { name: 'stock', type: 'int' }] },
                    { name: 'orders', columns: [{ name: 'id', type: 'int' }, { name: 'user_id', type: 'int' }, { name: 'total', type: 'float' }, { name: 'status', type: 'string' }] },
                    { name: 'order_items', columns: [{ name: 'id', type: 'int' }, { name: 'order_id', type: 'int' }, { name: 'product_id', type: 'int' }, { name: 'quantity', type: 'int' }, { name: 'unit_price', type: 'float' }] },
                ],
                relationships: [
                    { from: 'users', to: 'orders', type: '||--o{', label: 'places' },
                    { from: 'orders', to: 'order_items', type: '||--o{', label: 'contains' },
                    { from: 'products', to: 'order_items', type: '||--o{', label: 'included_in' },
                ],
            },
            dbml: `Table users {
  id         int         [pk, increment]
  username   varchar(50) [unique, not null]
  email      varchar(100)[unique, not null]
  role       varchar(20) [default: 'user']
  created_at timestamp   [default: \`now()\`]
}

Table products {
  id         int            [pk, increment]
  name       varchar(100)   [not null]
  price      decimal(12,2)  [not null]
  stock      int            [default: 0]
  created_at timestamp      [default: \`now()\`]
}

Table orders {
  id         int           [pk, increment]
  user_id    int           [ref: > users.id]
  status     varchar(20)   [default: 'PENDING']
  total      decimal(12,2) [default: 0]
  created_at timestamp     [default: \`now()\`]
}

Table order_items {
  id         int           [pk, increment]
  order_id   int           [ref: > orders.id]
  product_id int           [ref: > products.id]
  quantity   int           [not null]
  unit_price decimal(12,2) [not null]
}`,
            sql: `CREATE TABLE users (
  id         SERIAL PRIMARY KEY,
  username   VARCHAR(50)   UNIQUE NOT NULL,
  email      VARCHAR(100)  UNIQUE NOT NULL,
  role       VARCHAR(20)   NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100)  NOT NULL,
  price      NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  stock      INT           NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
  id         SERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id) ON DELETE SET NULL,
  status     VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
  total      NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  quantity   INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL
);

CREATE INDEX idx_orders_user_id    ON orders(user_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_prod  ON order_items(product_id);`,
        };
    }

    _mockBackend() {
        return {
            isFlask: false,
            readme: `# Demo Project\n\nGenerated by **Vibe Architect** (Mock Mode).\n\n## Quick Start\n\n\`\`\`bash\nnpm install\ncp .env.example .env\nnpm run dev\n\`\`\`\n\nHealth: http://localhost:3000/api/health\n\n## API Endpoints\n\n| Method | Endpoint | Description |\n|--------|----------|-------------|\n| GET | /api/products | List products |\n| POST | /api/products | Create product |\n| GET | /api/orders | List orders |\n| POST | /api/orders | Create order |\n| PATCH | /api/orders/:id/status | Update order status |\n\n## Tech Stack\n- Node.js + Express.js\n- PostgreSQL (pg)\n- MVC Architecture`,
            dependencies: ['express', 'cors', 'dotenv', 'pg', 'helmet', 'express-rate-limit'],
            dbCode: `const { Pool } = require('pg');\nrequire('dotenv').config();\n\nconst pool = new Pool({ connectionString: process.env.DATABASE_URL });\npool.on('error', err => console.error('[DB] Pool error:', err));\n\nmodule.exports = {\n  query: (text, params) => pool.query(text, params),\n  pool,\n};`,
            appCode: `const express   = require('express');\nconst cors      = require('cors');\nconst helmet    = require('helmet');\nconst rateLimit = require('express-rate-limit');\nrequire('dotenv').config();\n\nconst productRoutes = require('./routes/productRoutes');\nconst orderRoutes   = require('./routes/orderRoutes');\n\nconst app = express();\napp.use(helmet());\napp.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));\napp.use(express.json());\napp.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));\n\napp.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));\napp.use('/api/products', productRoutes);\napp.use('/api/orders', orderRoutes);\n\napp.use((_, res) => res.status(404).json({ error: 'Route not found' }));\napp.use((err, _req, res, _next) => {\n  console.error('[Error]', err.stack);\n  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });\n});\n\nmodule.exports = app;`,
            serverCode: `const app = require('./app');\nconst PORT = process.env.PORT || 3000;\n\nconst server = app.listen(PORT, () => {\n  console.log(\`Server running -> http://localhost:\${PORT}\`);\n  console.log(\`Health check -> http://localhost:\${PORT}/api/health\`);\n});\n\nprocess.on('SIGTERM', () => server.close(() => process.exit(0)));\nprocess.on('SIGINT', () => server.close(() => process.exit(0)));`,
            controllers: [
                {
                    filename: 'productController.js',
                    code: `const ProductService = require('../services/productService');

class ProductController {
  static async getAll(req, res, next) {
    try { res.json({ success: true, data: await ProductService.findAll() }); }
    catch (e) { next(e); }
  }
}
module.exports = ProductController;`,
                },
            ],
            services: [
                {
                    filename: 'productService.js',
                    code: `class ProductService {
  static async findAll() {
    return [];
  }
}
module.exports = ProductService;`,
                },
            ],
            routes: [
                {
                    filename: 'productRoutes.js',
                    code: `const router = require('express').Router();
const ProductController = require('../controllers/productController');

router.get('/', ProductController.getAll);

module.exports = router;`,
                },
            ],
        };
    }
}

let instance;
module.exports = (() => {
    if (!instance) instance = new AIClient();
    return instance;
})();

