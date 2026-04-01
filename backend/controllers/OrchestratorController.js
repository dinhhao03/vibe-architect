const express = require('express');
const router = express.Router();
const aiClient = require('../services/AIClient');
const ScaffoldFactory = require('../services/ScaffoldFactory');
const fs = require('fs');
const path = require('path');

router.get('/generate', async (req, res) => {
    // 1. Setup Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const userPrompt = req.query.prompt;
        const techStack = req.query.tech || 'Node.js';
        const isFlask = techStack.includes('Flask') || techStack.includes('Python');

        // --- AGENT 1: BUSINESS ANALYST ---
        sendEvent('progress', { message: `Đang phân tích yêu cầu ra User Stories (Agent 1)... [Model: ${aiClient.getCurrentModelLabel()}]`, step: 1 });
        
        const srsSchema = {
            type: "OBJECT",
            properties: {
                projectName: { type: "STRING" },
                projectOverview: { type: "STRING" },
                userStories: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            id: { type: "STRING" },
                            title: { type: "STRING" },
                            story: { type: "STRING" }
                        }
                    }
                }
            },
            required: ["projectName", "projectOverview", "userStories"]
        };

        const srsPrompt = `Create a software requirements specification (SRS) for: ${userPrompt}. Output a projectName, projectOverview, and userStories array. Focus on MVP features.`;
        let srsData;
        try {
            srsData = await aiClient.generate(srsPrompt, "You are a Senior Business Analyst IT.", srsSchema);
        } catch (err) {
            console.warn("[WARNING] Agent 1 (SRS) Failed:", err.message);
            srsData = {
                projectName: "Dự án Fallback MVP",
                projectOverview: "Dự án được tạo bằng Fallback. Server AI quá tải.",
                userStories: [{ id: "US-01", title: "Core MVP", story: "Hệ thống cung cấp tính năng cơ bản." }]
            };
        }
        sendEvent('srs_ready', srsData);

        // --- AGENT 2: DATA ARCHITECT ---
        sendEvent('progress', { message: `Đang thiết kế cơ sở dữ liệu và ERD (Agent 2)... [Model: ${aiClient.getCurrentModelLabel()}]`, step: 2 });
        
        const dbSchema = {
            type: "OBJECT",
            properties: {
                erd: { type: "STRING", description: "Mermaid erDiagram syntax code. Do not wrap in markdown tags." },
                sql: { type: "STRING", description: "SQL DDL queries to create the tables in 3NF with PK/FK. Do not wrap in markdown tags." }
            },
            required: ["erd", "sql"]
        };
        const dbPrompt = `Project Name: ${srsData.projectName}. Based on these user stories: ${JSON.stringify(srsData.userStories)}, design the database. Output 'erd' using Mermaid erDiagram syntax, and 'sql' using PostgreSQL syntax in 3NF.`;
        let dbData;
        try {
            dbData = await aiClient.generate(dbPrompt, "You are a Senior Database Architect.", dbSchema);
        } catch (err) {
            console.warn("[WARNING] Agent 2 (DB) Failed:", err.message);
            dbData = { sql: null, erd: null };
        }
        
        // --- VALIDATION LAYER (ERD/SQL) ---
        sendEvent('progress', { message: 'Kiểm tra tính toàn vẹn Data (Validation Layer)...', step: 3 });
        if(!dbData.sql || !dbData.sql.includes('TABLE') || !dbData.erd) {
            console.warn("Agent 2 Validation Failed! Using fallback.");
            dbData.sql = "-- Fallback SQL\nCREATE TABLE Users (id SERIAL PRIMARY KEY, name VARCHAR(255));\nCREATE TABLE Products (id SERIAL PRIMARY KEY, name VARCHAR(100), price DECIMAL(10,2));\nCREATE TABLE Orders (id SERIAL PRIMARY KEY, user_id INT REFERENCES Users(id), total DECIMAL(10,2));";
            dbData.erd = "erDiagram\n  Users { int id PK\n string name }\n  Products { int id PK\n string name\n float price }\n  Orders { int id PK\n int user_id FK\n float total }\n  Users ||--o{ Orders : \"places\"";
        }
        sendEvent('db_ready', dbData);

        // --- AGENT 3: BACKEND DEVELOPER ---
        sendEvent('progress', { message: `Đang dựng Backend ${isFlask ? 'Python Flask' : 'Node.js Express'} (Agent 3)... [Model: ${aiClient.getCurrentModelLabel()}]`, step: 3 });
        
        let backendData;

        if (isFlask) {
            // ===== PYTHON FLASK BRANCH =====
            const flaskSchema = {
                type: "OBJECT",
                properties: {
                    readme: { type: "STRING" },
                    dependencies: { type: "ARRAY", items: { type: "STRING" } },
                    runCode: { type: "STRING", description: "run.py entry point" },
                    initCode: { type: "STRING", description: "app/__init__.py with create_app factory" },
                    configCode: { type: "STRING", description: "app/config.py" },
                    controllers: { type: "ARRAY", items: { type: "OBJECT", properties: { filename: { type: "STRING" }, code: { type: "STRING" } } } },
                    services: { type: "ARRAY", items: { type: "OBJECT", properties: { filename: { type: "STRING" }, code: { type: "STRING" } } } },
                    routes: { type: "ARRAY", items: { type: "OBJECT", properties: { filename: { type: "STRING" }, code: { type: "STRING" } } } }
                },
                required: ["readme", "dependencies", "runCode", "initCode", "controllers", "routes"]
            };
            const flaskPrompt = `Project: ${srsData.projectName}. SQL: ${dbData.sql}.
Generate a Python Flask MVC backend. Use Flask Blueprints for routing. Create run.py, app/__init__.py (factory pattern), app/config.py. Limit to TOP 3 core entities. Generate controllers, services, routes. Output clean Python code without markdown.`;

            try {
                backendData = await aiClient.generate(flaskPrompt, "You are a Senior Python Flask Developer.", flaskSchema);
            } catch (err) {
                console.warn("[WARNING] Agent 3 (Flask) Failed:", err.message);
                backendData = { initCode: null };
            }

            // Validation
            if (!backendData.initCode || !backendData.controllers || backendData.controllers.length === 0) {
                backendData = {
                    readme: "# Fallback Flask Backend\nAI quá tải, đây là code mẫu.",
                    dependencies: ["flask", "flask-cors", "python-dotenv"],
                    runCode: "from app import create_app\n\napp = create_app()\n\nif __name__ == '__main__':\n    app.run(debug=True, port=5000)",
                    initCode: "from flask import Flask\nfrom flask_cors import CORS\n\ndef create_app():\n    app = Flask(__name__)\n    CORS(app)\n    return app",
                    configCode: "import os\n\nclass Config:\n    SECRET_KEY = os.getenv('SECRET_KEY', 'dev')",
                    controllers: [{ filename: "app_controller.py", code: "from flask import jsonify\n\nclass AppController:\n    @staticmethod\n    def index():\n        return jsonify({'message': 'Fallback Flask OK'})" }],
                    services: [{ filename: "app_service.py", code: "class AppService:\n    @staticmethod\n    def process():\n        return True" }],
                    routes: [{ filename: "app_routes.py", code: "from flask import Blueprint\nfrom app.controllers.app_controller import AppController\n\napp_bp = Blueprint('app', __name__)\n\n@app_bp.route('/')\ndef index():\n    return AppController.index()" }]
                };
            }
        } else {
            // ===== NODE.JS EXPRESS BRANCH (giữ nguyên logic cũ) =====
            const backendSchema = {
                type: "OBJECT",
                properties: {
                    readme: { type: "STRING", description: "A detailed README.md covering how to start the app." },
                    dependencies: { type: "ARRAY", items: { type: "STRING" }, description: "npm packages" },
                    dbCode: { type: "STRING", description: "Node.js database connection code" },
                    appCode: { type: "STRING", description: "Express app setup (middleware, routes mount)" },
                    serverCode: { type: "STRING", description: "Server entry point (app.listen)" },
                    controllers: { type: "ARRAY", items: { type: "OBJECT", properties: { filename: { type: "STRING" }, code: { type: "STRING" } } } },
                    services: { type: "ARRAY", items: { type: "OBJECT", properties: { filename: { type: "STRING" }, code: { type: "STRING" } } } },
                    routes: { type: "ARRAY", items: { type: "OBJECT", properties: { filename: { type: "STRING" }, code: { type: "STRING" } } } }
                },
                required: ["readme", "dependencies", "dbCode", "appCode", "serverCode", "controllers", "services", "routes"]
            };
            const backendPrompt = `Project: ${srsData.projectName}. SRS: ${JSON.stringify(srsData.projectOverview)} SQL: ${dbData.sql}.
Generate a PRO Node.js MVC backend. Create src/db.js, src/app.js, src/server.js. Limit to TOP 3 Core Entities. Generate controllers, services, routes. Output clean code without markdown backticks.`;

            try {
                backendData = await aiClient.generate(backendPrompt, "You are a Senior Backend Node.js Developer.", backendSchema);
            } catch (err) {
                console.warn("[WARNING] Agent 3 (Node) Failed:", err.message);
                backendData = { appCode: null };
            }

            // Validation
            if (!backendData.appCode || !backendData.controllers || backendData.controllers.length === 0) {
                backendData = {
                    readme: "# Fallback Backend\nHệ thống AI quá tải.",
                    dependencies: ["express", "dotenv", "cors"],
                    dbCode: "module.exports = {};",
                    appCode: "const express = require('express');\nconst app = express();\nmodule.exports = app;",
                    serverCode: "const app = require('./app');\nconst PORT = 3000;\napp.listen(PORT, () => console.log('Live Server'));",
                    controllers: [{ filename: "AppController.js", code: "class AppController {\n  static handle(req,res){ res.send('Fallback OK') }\n}\nmodule.exports = AppController;" }],
                    services: [{ filename: "AppService.js", code: "class AppService { static async process() { return true; } }\nmodule.exports = AppService;" }],
                    routes: [{ filename: "ApiRoute.js", code: "const router = require('express').Router();\nconst C = require('../controllers/AppController');\nrouter.get('/', C.handle);\nmodule.exports = router;" }]
                };
            }
        }

        sendEvent('backend_ready', backendData);

        // --- PACKAGING & ZIP ---
        sendEvent('progress', { message: `Đang đóng gói ${isFlask ? 'Flask' : 'MVC'} ra file ZIP Local...`, step: 4 });
        
        const projectData = {
            srs: srsData,
            erd: dbData.erd,
            sql: dbData.sql,
            backend: backendData,
            techStack: techStack
        };

        const zipPath = await ScaffoldFactory.createProjectZip(projectData);
        const fileName = path.basename(zipPath);

        sendEvent('progress', { message: 'Pipeline hoàn tất! File ZIP đã sẵn sàng.', step: 4 });
        sendEvent('complete', { downloadUrl: `/api/download?file=${encodeURIComponent(fileName)}` });

    } catch (error) {
        console.error("Orchestrator Error:", error);
        sendEvent('error', { message: String(error.message || error) });
    }
});

router.get('/download', (req, res) => {
    const fileName = path.basename(req.query.file || '');
    if (!fileName) return res.status(400).send('Bad Request');
    
    const filePath = path.resolve(process.cwd(), 'downloads', fileName);

    if (fs.existsSync(filePath)) {
        res.download(filePath, 'Vibe-Architect-Project.zip', (err) => {
            if (err) console.error("Download Error:", err);
            setTimeout(() => {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }, 5000);
        });
    } else {
        res.status(404).send('File không tồn tại hoặc đã hết hạn trên máy chủ Local!');
    }
});

module.exports = router;
