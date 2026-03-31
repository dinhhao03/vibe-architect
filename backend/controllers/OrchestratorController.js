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
        const srsData = await aiClient.generate(srsPrompt, "You are a Senior Business Analyst IT.", srsSchema);
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
        const dbPrompt = `Based on these user stories: ${JSON.stringify(srsData.userStories)}, design the database. Output 'erd' using Mermaid erDiagram syntax, and 'sql' using PostgreSQL syntax in 3NF.`;
        const dbData = await aiClient.generate(dbPrompt, "You are a Senior Database Architect.", dbSchema);
        
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
                readme: { type: "STRING", description: "A highly detailed README.md" },
                controllerCode: { type: "STRING", description: "Express.js Controller Code for the main entities" },
                serviceCode: { type: "STRING", description: "Service/Repository layer code" },
                routeCode: { type: "STRING", description: "Express.js Router code mapping to controller" }
            },
            required: ["readme", "controllerCode", "serviceCode", "routeCode"]
        };
        const backendPrompt = `Based on this SRS: ${JSON.stringify(srsData.projectOverview)} and this SQL schema: ${dbData.sql}, generate a detailed README.md, and Production-ready Node.js Express.js MVC code (controller, route, service) for the core entities. Code must be clean and not wrapped in markdown.`;
        const backendData = await aiClient.generate(backendPrompt, "You are a Senior Backend Node.js Developer.", backendSchema);
        
        // --- VALIDATION LAYER (BACKEND) ---
        if(!backendData.controllerCode || !backendData.routeCode) {
           backendData.controllerCode = "class FallbackController {} module.exports = FallbackController;";
           backendData.routeCode = "const router = require('express').Router(); module.exports = router;";
           backendData.serviceCode = "class FallbackService {} module.exports = FallbackService;";
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
    const fileName = req.query.file;
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
