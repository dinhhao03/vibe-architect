'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const orchestrator = require('./controllers/OrchestratorController');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: process.env.CORS_ORIGIN || true,
}));
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api', orchestrator);

app.get('/report', (_req, res) => {
    res.sendFile(path.resolve(__dirname, '../report.html'));
});

app.get('/*splat', (_req, res) => {
    res.sendFile(path.resolve(__dirname, '../frontend/index.html'));
});

const server = app.listen(PORT, () => {
    console.log(`\n  Vibe Architect -> http://localhost:${PORT}\n`);
});

const shutdown = signal => () => {
    console.log(`\n[Server] ${signal} received - shutting down gracefully`);
    server.close(() => {
        console.log('[Server] Closed.');
        process.exit(0);
    });
};

process.on('SIGTERM', shutdown('SIGTERM'));
process.on('SIGINT', shutdown('SIGINT'));

module.exports = app;
