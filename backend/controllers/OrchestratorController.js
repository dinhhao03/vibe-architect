const express = require('express');
const router = express.Router();
const aiClient = require('../services/AIClient');
const ScaffoldFactory = require('../services/ScaffoldFactory');
const fs = require('fs');

router.get('/generate', async (req, res) => {
    const { prompt, techStack } = req.query;

    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
        // Agent 1: Requirement Analyst
        sendEvent('progress', { message: 'Đang phân tích yêu cầu ra User Stories (Agent 1)...' });
        
        const srsSchema = {
            type: "OBJECT",
            properties: {
                projectName: { type: "STRING" },
                description: { type: "STRING" },
                userStories: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            id: { type: "STRING" },
                            title: { type: "STRING" },
                            story: { type: "STRING" },
                            acceptanceCriteria: {
                                type: "ARRAY",
                                items: { type: "STRING" }
                            }
                        }
                    }
                }
            },
            required: ["projectName", "description", "userStories"]
        };
        
        const srsPrompt = `Write an SRS for this project idea: "${prompt}". Focus on generating high-quality User Stories using the INVEST criteria and Acceptance Criteria using Given-When-Then format. Make it concise and practical.`;

        const srsData = await aiClient.generate(srsPrompt, "You are a Senior Requirement Analyst.", srsSchema);
        sendEvent('srs_ready', srsData);

        // Agent 2: Data Architect
        sendEvent('progress', { message: 'Đang thiết kế cơ sở dữ liệu và ERD (Agent 2)...' });
        
        const dbSchema = {
            type: "OBJECT",
            properties: {
                erd: { type: "STRING", description: "dbdiagram.io syntax code, starting with Table... Do not wrap in markdown tags." },
                sql: { type: "STRING", description: "SQL DDL queries to create the tables in 3NF with constraints. Do not wrap in markdown tags." }
            },
            required: ["erd", "sql"]
        };
        
        const dbPrompt = `Based on these user stories: ${JSON.stringify(srsData.userStories)}, design the database. Output 'erd' using dbdiagram.io syntax, and 'sql' using PostgreSQL syntax in 3NF.`;
        
        const dbData = await aiClient.generate(dbPrompt, "You are a Senior Database Architect.", dbSchema);
        sendEvent('db_ready', dbData);

        // Agent 3: Scaffolder
        sendEvent('progress', { message: `Đang khởi tạo mã nguồn (${techStack}) và đóng gói dự án (Agent 3)...` });
        
        const projectData = {
            srs: srsData,
            erd: dbData.erd,
            sql: dbData.sql,
            techStack: techStack || 'Node.js'
        };

        const zipPath = await ScaffoldFactory.createProjectZip(projectData);
        
        sendEvent('progress', { message: 'Hoàn tất! Bắt đầu tải file...' });
        
        // Cần truyền đường dẫn file cho client tải về thông qua 1 route khác
        sendEvent('complete', { downloadUrl: `/api/download?file=${encodeURIComponent(zipPath)}` });

    } catch (error) {
        console.error("Orchestrator Error:", error);
        sendEvent('error', { message: error.message || 'Có lỗi xảy ra trong quá trình Vibe Coding.' });
    } finally {
        res.end();
    }
});

router.get('/download', (req, res) => {
    const filePath = req.query.file;
    if (fs.existsSync(filePath)) {
        res.download(filePath, 'Vibe-Architect-Project.zip', (err) => {
            if (err) {
                console.error("Download Error:", err);
            }
            // Cleanup file after download
            fs.unlinkSync(filePath);
        });
    } else {
        res.status(404).send('File not found');
    }
});

module.exports = router;
