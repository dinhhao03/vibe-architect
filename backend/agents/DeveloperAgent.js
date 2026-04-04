'use strict';

const aiClient = require('../services/AIClient');

// ─── Shared base rules ────────────────────────────────────────────────────────
const BASE_RULES = `
Bạn là một Senior Backend Developer chuyên nghiệp (Developer).
Nhiệm vụ: Sinh toàn bộ source code backend dựa trên SRS, ERD, và SQL schema đã cung cấp.

QUY TẮC BẮT BUỘC:
1. Code phải CHẠY ĐƯỢC ngay sau npm install / pip install. KHÔNG placeholder, KHÔNG "TODO implement".
2. Mỗi bảng chính trong SQL schema = 1 controller file + 1 service file + 1 route file.
3. Controller: CHỈ xử lý HTTP — parse req, gọi service, trả res. KHÔNG SQL, KHÔNG business logic.
4. Service: Toàn bộ DB queries + business logic + validation đầu vào.
5. Route: Khai báo endpoint, map đến controller method.
6. Validation trong Service: throw Error với .status = 400 cho input không hợp lệ.
7. Error handling: next(err) pattern / raise Exception. Response JSON luôn có field "error".
8. HTTP status: 200 OK, 201 Created, 400 Bad Request, 404 Not Found, 500 Internal Server Error.
9. KHÔNG markdown fences trong code (không có \`\`\`js, \`\`\`python, \`\`\`).
10. README: project name, quick start, bảng API endpoints đầy đủ, cấu trúc thư mục, tech stack.
11. Sinh code cho TẤT CẢ bảng chính trong schema. Không bỏ sót entity nào.
`.trim();

// ─── Express ──────────────────────────────────────────────────────────────────
const EXPRESS_SYSTEM = `${BASE_RULES}

STACK: Node.js + Express.js + PostgreSQL (pg)
DEPENDENCIES BẮT BUỘC: express, cors, dotenv, pg, helmet, express-rate-limit

FILE NAMING: camelCase — productController.js, productService.js, productRoutes.js

DB PATTERN (src/db.js):
  const { Pool } = require('pg'); — singleton pool, export { query, pool }

APP PATTERN (src/app.js):
  helmet() + cors() + express.json() + rateLimit() + routes + 404 handler + error handler (4 args)

SERVER PATTERN (src/server.js):
  app.listen() + graceful SIGTERM/SIGINT shutdown với server.close()

SERVICE PATTERN:
  class XService { static async findAll() {...} static validate(data) { if(!ok) throw Object.assign(new Error('msg'), {status:400}) } }

CONTROLLER PATTERN:
  class XController { static async getAll(req,res,next) { try { ... } catch(e){next(e)} } }`;

const EXPRESS_SCHEMA = {
    type: 'OBJECT',
    required: ['isFlask', 'readme', 'dependencies', 'dbCode', 'appCode', 'serverCode', 'controllers', 'services', 'routes'],
    properties: {
        isFlask: { type: 'BOOLEAN' },
        readme: { type: 'STRING' },
        dependencies: { type: 'ARRAY', items: { type: 'STRING' } },
        dbCode: { type: 'STRING', description: 'Complete src/db.js — pg Pool singleton' },
        appCode: { type: 'STRING', description: 'Complete src/app.js — Express app with all middleware and routes' },
        serverCode: { type: 'STRING', description: 'Complete src/server.js — app.listen + graceful shutdown' },
        controllers: { type: 'ARRAY', items: { type: 'OBJECT', required: ['filename', 'code'], properties: { filename: { type: 'STRING' }, code: { type: 'STRING' } } } },
        services: { type: 'ARRAY', items: { type: 'OBJECT', required: ['filename', 'code'], properties: { filename: { type: 'STRING' }, code: { type: 'STRING' } } } },
        routes: { type: 'ARRAY', items: { type: 'OBJECT', required: ['filename', 'code'], properties: { filename: { type: 'STRING' }, code: { type: 'STRING' } } } },
    },
};

// ─── Flask ────────────────────────────────────────────────────────────────────
const FLASK_SYSTEM = `${BASE_RULES}

STACK: Python + Flask + PostgreSQL (psycopg2-binary)
DEPENDENCIES BẮT BUỘC: flask, flask-cors, python-dotenv, psycopg2-binary, flask-limiter

FILE NAMING: snake_case — product_controller.py, product_service.py, product_routes.py

DB PATTERN (app/db.py):
  psycopg2.pool.SimpleConnectionPool — get_db() / release_db(conn). Luôn try/finally để release.

FACTORY PATTERN (app/__init__.py):
  def create_app(): — register blueprints, CORS, Limiter, health endpoint /api/health, error handlers 404 + 500.

SERVICE PATTERN:
  Trả về dict hoặc list[dict] (KHÔNG trả Row objects). validate() raise ValueError với message rõ ràng.

CONTROLLER PATTERN:
  Static methods, return jsonify(). Import service từ app.services.X

BLUEPRINT PATTERN:
  Blueprint với typed URL converters: <int:item_id>`;

const FLASK_SCHEMA = {
    type: 'OBJECT',
    required: ['isFlask', 'readme', 'dependencies', 'runCode', 'initCode', 'configCode', 'dbCode', 'controllers', 'services', 'routes'],
    properties: {
        isFlask: { type: 'BOOLEAN' },
        readme: { type: 'STRING' },
        dependencies: { type: 'ARRAY', items: { type: 'STRING' } },
        runCode: { type: 'STRING', description: 'Complete run.py — create_app() call and __main__ guard' },
        initCode: { type: 'STRING', description: 'Complete app/__init__.py — create_app() factory with all blueprint registrations' },
        configCode: { type: 'STRING', description: 'Complete app/config.py — Config class with os.getenv()' },
        dbCode: { type: 'STRING', description: 'Complete app/db.py — psycopg2 connection pool with get_db() and release_db()' },
        controllers: { type: 'ARRAY', items: { type: 'OBJECT', required: ['filename', 'code'], properties: { filename: { type: 'STRING' }, code: { type: 'STRING' } } } },
        services: { type: 'ARRAY', items: { type: 'OBJECT', required: ['filename', 'code'], properties: { filename: { type: 'STRING' }, code: { type: 'STRING' } } } },
        routes: { type: 'ARRAY', items: { type: 'OBJECT', required: ['filename', 'code'], properties: { filename: { type: 'STRING' }, code: { type: 'STRING' } } } },
    },
};

// ─── Agent ────────────────────────────────────────────────────────────────────
class DeveloperAgent {
    /**
     * @param {object} srs          - AnalystAgent output
     * @param {object} architecture - ArchitectAgent output
     * @returns {Promise<BackendResult>}
     */
    async run(srs, architecture) {
        const isFlask = srs.isFlask === true;
        console.log(`[Agent 3 — Developer] Building ${isFlask ? 'Flask' : 'Express'} backend…`);

        const storiesSummary = srs.userStories
            .map(u => [
                `  - ${u.id}: ${u.title}`,
                `    Story: ${u.story}`,
                `    AC: ${(u.acceptanceCriteria ?? []).join('; ')}`,
            ].join('\n'))
            .join('\n');

        // Build mermaid from structured JSON for context
        const erdText = this._buildMermaid(architecture.db_structure);

        const prompt = [
            `Project: ${srs.projectName}`,
            `Overview: ${srs.projectOverview}`,
            ``,
            `User Stories:`,
            storiesSummary,
            ``,
            `ERD (Mermaid — for reference):`,
            erdText,
            ``,
            `SQL Schema (PostgreSQL — source of truth for entities):`,
            architecture.sql,
            ``,
            `CRITICAL: isFlask trong response PHẢI = ${isFlask}.`,
            `Sinh code cho TẤT CẢ entity được định nghĩa trong SQL schema.`,
        ].join('\n');

        const schema = isFlask ? FLASK_SCHEMA : EXPRESS_SCHEMA;
        const system = isFlask ? FLASK_SYSTEM : EXPRESS_SYSTEM;

        const result = await aiClient.generate(prompt, system, schema);

        // Enforce isFlask from SRS — trust SRS, not LLM response
        result.isFlask = isFlask;

        this._validate(result, isFlask);
        this._stripFences(result);

        console.log(`[Agent 3 — Developer] Done — ${result.controllers.length} controllers, ${result.services.length} services`);
        return result;
    }

    _buildMermaid(data) {
        if (!data?.tables) return 'erDiagram';
        let m = 'erDiagram\n';
        data.tables.forEach(t => {
            m += `  ${t.name} {\n`;
            (t.columns ?? []).forEach(c => {
                // Sanitize: single word types only
                const safeType = (c.type ?? 'string').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20) || 'string';
                m += `    ${safeType} ${c.name}\n`;
            });
            m += `  }\n`;
        });
        (data.relationships ?? []).forEach(r => {
            const label = r.label ? ` : "${r.label}"` : '';
            m += `  ${r.from} ${r.type} ${r.to}${label}\n`;
        });
        return m;
    }

    _validate(r, isFlask) {
        const requiredScalar = isFlask
            ? ['runCode', 'initCode', 'configCode', 'dbCode']
            : ['dbCode', 'appCode', 'serverCode'];

        for (const f of requiredScalar) {
            if (!r?.[f]?.trim()) throw new Error(`[Developer] Missing or empty field: "${f}"`);
        }
        if (!r?.readme?.trim()) throw new Error('[Developer] Missing readme');
        if (!Array.isArray(r.controllers) || r.controllers.length === 0) throw new Error('[Developer] controllers is empty');
        if (!Array.isArray(r.services) || r.services.length === 0) throw new Error('[Developer] services is empty');
        if (!Array.isArray(r.routes) || r.routes.length === 0) throw new Error('[Developer] routes is empty');

        // Validate each file entry
        for (const arr of [r.controllers, r.services, r.routes]) {
            for (const f of arr) {
                if (!f?.filename?.trim()) throw new Error('[Developer] File entry missing filename');
                if (!f?.code?.trim()) throw new Error(`[Developer] File "${f.filename}" has empty code`);
            }
        }
    }

    _stripFences(r) {
        // Remove markdown code fences that models may inject despite responseMimeType=json
        const clean = s => (s ?? '').replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '').trim();
        const cleanFiles = arr => arr?.forEach(f => { if (f) f.code = clean(f.code); });

        for (const field of ['dbCode', 'appCode', 'serverCode', 'runCode', 'initCode', 'configCode']) {
            if (r[field]) r[field] = clean(r[field]);
        }
        cleanFiles(r.controllers);
        cleanFiles(r.services);
        cleanFiles(r.routes);
    }
}

module.exports = new DeveloperAgent();