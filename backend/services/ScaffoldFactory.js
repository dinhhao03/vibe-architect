'use strict';

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const OUTPUT_DIR = path.resolve(__dirname, '../../downloads');

function renderSrsMarkdown(srs) {
    const stories = (srs.userStories ?? []).map(userStory => {
        const acceptanceCriteria = (userStory.acceptanceCriteria ?? []).map(item => `  - ${item}`).join('\n');
        return [
            `### ${userStory.id} - ${userStory.title}`,
            '',
            `**Story:** ${userStory.story}`,
            '',
            '**Acceptance Criteria:**',
            acceptanceCriteria || '  - N/A',
        ].join('\n');
    }).join('\n\n');

    return [
        '# Tai Lieu Yeu Cau Phan Mem (SRS)',
        `## ${srs.projectName}`,
        '',
        '## 1. Tong Quan Du An',
        srs.projectOverview ?? '',
        '',
        '## 2. User Stories',
        stories,
    ].join('\n');
}

function buildMermaidFromStructure(data) {
    if (!data?.tables) return 'erDiagram\n';
    let output = 'erDiagram\n';

    data.tables.forEach(table => {
        output += `  ${table.name} {\n`;
        (table.columns ?? []).forEach(column => {
            const safeType = (column.type ?? 'string').replace(/[^a-zA-Z0-9]/g, '').substring(0, 24) || 'string';
            output += `    ${safeType} ${column.name}\n`;
        });
        output += '  }\n';
    });

    (data.relationships ?? []).forEach(relationship => {
        const label = relationship.label ? ` : "${relationship.label}"` : '';
        output += `  ${relationship.from} ${relationship.type} ${relationship.to}${label}\n`;
    });

    return output;
}

function validateData(data) {
    if (!data?.srs) throw new Error('ScaffoldFactory: missing srs');
    if (!data?.architecture) throw new Error('ScaffoldFactory: missing architecture');
    if (!data?.backend) throw new Error('ScaffoldFactory: missing backend');

    const { architecture, backend } = data;
    const isFlask = backend.isFlask === true;

    if (!architecture.db_structure) throw new Error('ScaffoldFactory: missing architecture.db_structure');
    if (!architecture.sql) throw new Error('ScaffoldFactory: missing architecture.sql');
    if (!architecture.dbml) throw new Error('ScaffoldFactory: missing architecture.dbml');
    if (!backend.readme) throw new Error('ScaffoldFactory: missing backend.readme');

    for (const key of ['controllers', 'services', 'routes']) {
        if (!Array.isArray(backend[key]) || backend[key].length === 0) {
            throw new Error(`ScaffoldFactory: backend.${key} is empty`);
        }
    }

    const requiredCode = isFlask
        ? ['runCode', 'initCode', 'configCode', 'dbCode']
        : ['dbCode', 'appCode', 'serverCode'];

    for (const field of requiredCode) {
        if (!backend[field]) throw new Error(`ScaffoldFactory: missing backend.${field}`);
    }
}

class ScaffoldFactory {
    static async createProjectZip(data) {
        validateData(data);
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });

        const { srs, architecture, backend } = data;
        const isFlask = backend.isFlask === true;
        const slug = ScaffoldFactory._slug(srs.projectName);
        const zipName = `${slug}-${Date.now()}.zip`;
        const zipPath = path.join(OUTPUT_DIR, zipName);

        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => {
                console.log(`[ScaffoldFactory] ZIP ready: ${zipPath} (${archive.pointer()} bytes)`);
                resolve(zipPath);
            });
            archive.on('warning', warning => console.warn('[ScaffoldFactory] Warning:', warning));
            archive.on('error', reject);
            archive.pipe(output);

            archive.append(renderSrsMarkdown(srs), { name: 'docs/SRS.md' });
            archive.append(buildMermaidFromStructure(architecture.db_structure), { name: 'docs/ERD.mmd' });
            archive.append(architecture.dbml, { name: 'docs/database.dbml' });
            archive.append(architecture.sql, { name: 'database/schema.sql' });
            archive.append(backend.readme, { name: 'README.md' });

            if (isFlask) {
                ScaffoldFactory._packFlask(archive, backend);
            } else {
                ScaffoldFactory._packExpress(archive, backend, srs);
            }

            archive.finalize();
        });
    }

    static _packExpress(archive, backend, srs) {
        const dependencies = {
            express: '^5.2.1',
            cors: '^2.8.5',
            dotenv: '^17.2.1',
            pg: '^8.16.3',
            helmet: '^8.1.0',
            'express-rate-limit': '^8.1.0',
        };

        (backend.dependencies ?? []).forEach(dep => {
            if (dep && !dependencies[dep]) dependencies[dep] = '^1.0.0';
        });

        const packageJson = {
            name: ScaffoldFactory._slug(srs.projectName),
            version: '1.0.0',
            description: `Backend API for ${srs.projectName} - generated by Vibe Architect`,
            main: 'src/server.js',
            scripts: {
                start: 'node src/server.js',
                dev: 'node --watch src/server.js',
            },
            dependencies,
        };

        archive.append(['node_modules/', '.env', '*.zip', 'downloads/', '.cache/', 'coverage/'].join('\n'), { name: '.gitignore' });
        archive.append([
            'PORT=3000',
            'DATABASE_URL=postgresql://postgres:password@localhost:5432/mydb',
            'NODE_ENV=development',
            'CORS_ORIGIN=http://localhost:3000',
        ].join('\n'), { name: '.env.example' });
        archive.append(JSON.stringify(packageJson, null, 2), { name: 'package.json' });
        archive.append(backend.dbCode, { name: 'src/db.js' });
        archive.append(backend.appCode, { name: 'src/app.js' });
        archive.append(backend.serverCode, { name: 'src/server.js' });

        (backend.controllers ?? []).forEach(file => archive.append(file.code, { name: `src/controllers/${file.filename}` }));
        (backend.services ?? []).forEach(file => archive.append(file.code, { name: `src/services/${file.filename}` }));
        (backend.routes ?? []).forEach(file => archive.append(file.code, { name: `src/routes/${file.filename}` }));
    }

    static _packFlask(archive, backend) {
        const dependencies = new Set(['flask', 'flask-cors', 'python-dotenv', 'psycopg2-binary', 'flask-limiter']);
        (backend.dependencies ?? []).forEach(dep => {
            if (dep?.trim()) dependencies.add(dep.trim().toLowerCase());
        });

        archive.append(['__pycache__/', '*.pyc', '.env', 'venv/', '*.zip', 'downloads/', '.cache/', '.pytest_cache/'].join('\n'), { name: '.gitignore' });
        archive.append([
            'SECRET_KEY=change-me-in-production',
            'DATABASE_URL=postgresql://postgres:password@localhost:5432/mydb',
            'FLASK_ENV=development',
            'FLASK_DEBUG=1',
        ].join('\n'), { name: '.env.example' });
        archive.append([...dependencies].join('\n'), { name: 'requirements.txt' });
        archive.append(backend.runCode, { name: 'run.py' });
        archive.append(backend.initCode, { name: 'app/__init__.py' });
        archive.append(backend.configCode, { name: 'app/config.py' });
        archive.append(backend.dbCode, { name: 'app/db.py' });

        archive.append('', { name: 'app/controllers/__init__.py' });
        archive.append('', { name: 'app/services/__init__.py' });
        archive.append('', { name: 'app/routes/__init__.py' });

        (backend.controllers ?? []).forEach(file => archive.append(file.code, { name: `app/controllers/${file.filename}` }));
        (backend.services ?? []).forEach(file => archive.append(file.code, { name: `app/services/${file.filename}` }));
        (backend.routes ?? []).forEach(file => archive.append(file.code, { name: `app/routes/${file.filename}` }));
    }

    static _slug(name = 'project') {
        return (name ?? 'project')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') || 'project';
    }
}

module.exports = ScaffoldFactory;
