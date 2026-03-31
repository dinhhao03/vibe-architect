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

        // --- AGENT 1: BUSINESS ANALYST ---
        sendEvent('progress', { message: 'Đang phân tích yêu cầu ra User Stories (Agent 1)...' });
        
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
            required: ["projectOverview", "userStories"]
        };

        const srsPrompt = `Create a software requirements specification (SRS) for: ${userPrompt}. Focus on MVP features.`;
        let srsData;
        try {
            srsData = await aiClient.generate(srsPrompt, "You are a Senior Business Analyst IT.", srsSchema);
        } catch (err) {
            console.warn("[WARNING] Agent 1 (SRS) Failed:", err.message);
            srsData = {
                projectName: "Dự án Fallback MVP",
                projectOverview: "Dự án được tạo bằng Fallback Framework. (Do Server AI quá tải không thể phân tích SRS lúc này).",
                userStories: [{ id: "US-01", title: "Core MVP", story: "Hệ thống cung cấp các tĩnh năng Backend thiết yếu." }]
            };
        }
        sendEvent('srs_ready', srsData);

        // --- AGENT 2: DATA ARCHITECT ---
        sendEvent('progress', { message: 'Đang thiết kế cơ sở dữ liệu và ERD (Agent 2)...' });
        
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
            dbData = { sql: null, erd: null }; // Để nhường phần xử lý cho Validation Layer bên dưới
        }
        
        // --- VALIDATION LAYER (ERD/SQL) ---
        sendEvent('progress', { message: 'Kiểm tra tính toàn vẹn Data (Validation Layer)...' });
        if(!dbData.sql || !dbData.sql.includes('TABLE') || !dbData.erd) {
            console.warn("Agent 2 Validation Failed! Using fallback.");
            dbData.sql = "-- Fallback SQL\nCREATE TABLE Users (id SERIAL PRIMARY KEY, name VARCHAR(255));";
            dbData.erd = "erDiagram\n Users { int id PK\n string name }";
        }
        sendEvent('db_ready', dbData);

        // --- AGENT 3: BACKEND DEVELOPER ---
        sendEvent('progress', { message: 'Đang dựng Logic Model, Controller và API Routes (Agent 3)...' });
        
        const backendSchema = {
            type: "OBJECT",
            properties: {
                readme: { type: "STRING", description: "A detailed README.md covering how to start the app." },
                dependencies: { type: "ARRAY", items: { type: "STRING" }, description: "List of npm packages like express, pg, cors, dotenv" },
                dbCode: { type: "STRING", description: "Node.js database connection code (e.g. pg pool or mongoose)" },
                appCode: { type: "STRING", description: "Express app setup (middleware, routes mount)" },
                serverCode: { type: "STRING", description: "Server entry point (app.listen)" },
                controllers: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: { filename: { type: "STRING" }, code: { type: "STRING" } }
                    }
                },
                services: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: { filename: { type: "STRING" }, code: { type: "STRING" } }
                    }
                },
                routes: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: { filename: { type: "STRING" }, code: { type: "STRING" } }
                    }
                }
            },
            required: ["readme", "dependencies", "dbCode", "appCode", "serverCode", "controllers", "services", "routes"]
        };
        const backendPrompt = `Project: ${srsData.projectName}. SRS: ${JSON.stringify(srsData.projectOverview)} SQL: ${dbData.sql}.
Generate a PRO Node.js MVC backend. Create exactly src/db.js, src/app.js, src/server.js. Limit to the TOP 3 Core Database Entities (Tables) for the demo MVP. Generate code for controllers, services, and routes matching these tables. Output clean code without markdown backticks.`;
        
        let backendData;
        try {
            backendData = await aiClient.generate(backendPrompt, "You are a Senior Backend Node.js Developer.", backendSchema);
        } catch (err) {
            console.warn("[WARNING] Agent 3 (Backend) Failed:", err.message);
            backendData = { appCode: null };
        }
        
        // --- VALIDATION LAYER (BACKEND) ---
        if(!backendData.appCode || !backendData.controllers || backendData.controllers.length === 0) {
           backendData = {
               readme: "# Fallback Backend\nHệ thống AI quá tải, đây là mã giả lập tĩnh.",
               dependencies: ["express", "dotenv", "cors"],
               dbCode: "module.exports = {};",
               appCode: "const express = require('express');\nconst app = express();\nmodule.exports = app;",
               serverCode: "const app = require('./app');\nconst PORT = 3000;\napp.listen(PORT, () => console.log('Live Server'));",
               controllers: [{ filename: "AppController.js", code: "class AppController {\n  static handle(req,res){ res.send('OK via Fallback Code!') }\n}\nmodule.exports = AppController;" }],
               services: [{ filename: "AppService.js", code: "class AppService { static async process() { return true; } }\nmodule.exports = AppService;" }],
               routes: [{ filename: "ApiRoute.js", code: "const router = require('express').Router();\nconst Fallback = require('../controllers/AppController');\nrouter.get('/', Fallback.handle);\nmodule.exports = router;" }]
           };
        }
        sendEvent('backend_ready', backendData);

        // --- PACKAGING & ZIP ---
        sendEvent('progress', { message: 'Đang đóng gói cấu trúc Model-View-Controller ra file ZIP Local...' });
        
        const projectData = {
            srs: srsData,
            erd: dbData.erd,
            sql: dbData.sql,
            backend: backendData,
            techStack: techStack
        };

        const zipPath = await ScaffoldFactory.createProjectZip(projectData);
        const fileName = path.basename(zipPath);

        sendEvent('progress', { message: 'Tải file Architecture hoàn tất!' });
        sendEvent('complete', { downloadUrl: `/api/download?file=${encodeURIComponent(fileName)}` });

    } catch (error) {
        console.error("Orchestrator Error:", error);
        sendEvent('error', { message: String(error.message || error) });
    }
});

router.get('/download', (req, res) => {
    // SECURITY FIX: Prevent Directory Traversal Vulnerability (VD: req.query.file = "../../../windows/sys32")
    const fileName = path.basename(req.query.file || '');
    if (!fileName) return res.status(400).send('Bad Request');
    
    const filePath = path.resolve(process.cwd(), 'downloads', fileName);

    if (fs.existsSync(filePath)) {
        res.download(filePath, 'Vibe-Architect-Project.zip', (err) => {
            if (err) console.error("Download Error:", err);
            // Giữ file 5s phòng trình duyệt get nhiều lần
            setTimeout(() => {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }, 5000);
        });
    } else {
        res.status(404).send('File không tồn tại hoặc đã hết hạn trên máy chủ Local!');
    }
});

module.exports = router;
