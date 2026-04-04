'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const analystAgent = require('../agents/AnalystAgent');
const architectAgent = require('../agents/ArchitectAgent');
const developerAgent = require('../agents/DeveloperAgent');
const ScaffoldFactory = require('../services/ScaffoldFactory');
const aiClient = require('../services/AIClient');

function createEmitter(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    return (event, data) => {
        if (!res.writableEnded) {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        }
    };
}

function createDisconnectGuard(req, res) {
    let disconnected = false;
    const markDisconnected = () => { disconnected = true; };
    req.on('close', markDisconnected);
    res.on('close', markDisconnected);

    return {
        isDisconnected() {
            return disconnected;
        },
        assertConnected() {
            if (disconnected) {
                throw new Error('Client disconnected before pipeline completed.');
            }
        },
    };
}

router.get('/generate', async (req, res) => {
    const emit = createEmitter(res);
    const connection = createDisconnectGuard(req, res);
    let usedMock = false;

    try {
        const description = (req.query.prompt ?? '').trim();
        const stackPref = (req.query.stack ?? 'Node.js').trim();

        if (!description) {
            emit('error', { message: 'Thi?u tham s? prompt.' });
            return res.end();
        }

        emit('progress', {
            step: 1,
            message: `Ðang phân tích yêu c?u -> SRS [${aiClient.getCurrentModelLabel()}]`,
        });

        const srs = await analystAgent.run(description, stackPref);
        usedMock = usedMock || aiClient.getLastResultMeta().source === 'mock';
        connection.assertConnected();
        emit('srs_ready', srs);

        emit('progress', {
            step: 2,
            message: `Ðang thi?t k? Database Schema + ERD [${aiClient.getCurrentModelLabel()}]`,
        });

        const architecture = await architectAgent.run(srs);
        usedMock = usedMock || aiClient.getLastResultMeta().source === 'mock';
        connection.assertConnected();
        emit('db_ready', architecture);

        const stackLabel = srs.isFlask ? 'Python Flask' : 'Node.js Express';
        emit('progress', {
            step: 3,
            message: `Ðang sinh Backend ${stackLabel} [${aiClient.getCurrentModelLabel()}]`,
        });

        const backend = await developerAgent.run(srs, architecture);
        usedMock = usedMock || aiClient.getLastResultMeta().source === 'mock';
        connection.assertConnected();
        emit('backend_ready', backend);

        emit('progress', { step: 4, message: 'Ðang dóng gói toàn b? project ra ZIP...' });
        const zipPath = await ScaffoldFactory.createProjectZip({ srs, architecture, backend });
        connection.assertConnected();

        const fileName = path.basename(zipPath);
        if (usedMock) {
            emit('warning', {
                message: 'Pipeline dã dùng d? li?u mock ? ít nh?t m?t pha. Artifact phù h?p d? xem demo giao di?n, nhung không nên xem là k?t qu? AI xác th?c hoàn toàn.',
            });
        }

        emit('progress', { step: 4, message: 'Pipeline hoàn t?t! File ZIP dã s?n sàng t?i v?.' });
        emit('complete', {
            downloadUrl: `/api/download?file=${encodeURIComponent(fileName)}`,
            usedMock,
        });
    } catch (error) {
        console.error('[Orchestrator] Fatal pipeline error:', error);
        if (!connection.isDisconnected()) {
            emit('error', { message: String(error?.message ?? error) });
        }
    }

    if (!connection.isDisconnected() && !res.writableEnded) {
        res.end();
    }
});

router.get('/download', (req, res) => {
    const fileName = path.basename(req.query.file ?? '');
    if (!fileName) return res.status(400).json({ error: 'Missing file parameter' });

    const filePath = path.join(path.resolve(__dirname, '../../downloads'), fileName);
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File không t?n t?i ho?c dã h?t h?n trên server.');
    }

    res.download(filePath, 'Vibe-Architect-Project.zip', error => {
        if (error && !res.headersSent) console.error('[Download] Error sending file:', error);

        setTimeout(() => {
            try {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (cleanupError) {
                console.warn('[Download] Cleanup skipped:', cleanupError.message);
            }
        }, 10 * 60 * 1000);
    });
});

module.exports = router;
