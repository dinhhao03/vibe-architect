'use strict';

const aiClient = require('../services/AIClient');

const SYSTEM = `
Bạn là một Senior Database Architect chuyên nghiệp (Architect).
Nhiệm vụ: Từ SRS → thiết kế database hoàn chỉnh với 3 outputs.

QUY TẮC BẮT BUỘC:

[DB_STRUCTURE — dùng để render ERD tự động]
- tables: mảng các bảng. Mỗi bảng có name (snake_case) và columns (mảng {name, type}).
- type của column phải là 1 từ duy nhất (int, string, float, boolean, timestamp, uuid). KHÔNG dùng varchar(n), decimal(p,q).
- relationships: mảng {from, to, type, label}. type dùng Mermaid syntax: "||--o{", "}o--||", "||--||", v.v.

[DBML — Database Markup Language cho tài liệu]
- Đầy đủ chi tiết: kiểu dữ liệu thật (varchar, decimal), constraints, refs, indexes.

[SQL — PostgreSQL DDL script]
- PRIMARY KEY (SERIAL hoặc UUID).
- NOT NULL cho trường bắt buộc. FOREIGN KEY với ON DELETE policy.
- CHECK constraints (price >= 0, quantity > 0). DEFAULT values.
- INDEX cho FK và cột hay query.
- Tên bảng: snake_case, số nhiều.
- Bảng users BẮT BUỘC nếu có authentication hoặc ownership.

Trả về JSON thuần túy theo schema. Không thêm giải thích.
`.trim();

const SCHEMA = {
    type: 'OBJECT',
    required: ['db_structure', 'dbml', 'sql'],
    properties: {
        db_structure: {
            type: 'OBJECT',
            required: ['tables', 'relationships'],
            properties: {
                tables: {
                    type: 'ARRAY',
                    items: {
                        type: 'OBJECT',
                        required: ['name', 'columns'],
                        properties: {
                            name: { type: 'STRING' },
                            columns: {
                                type: 'ARRAY',
                                items: {
                                    type: 'OBJECT',
                                    required: ['name', 'type'],
                                    properties: {
                                        name: { type: 'STRING' },
                                        type: { type: 'STRING' },
                                    },
                                },
                            },
                        },
                    },
                },
                relationships: {
                    type: 'ARRAY',
                    items: {
                        type: 'OBJECT',
                        required: ['from', 'to', 'type', 'label'],
                        properties: {
                            from: { type: 'STRING' },
                            to: { type: 'STRING' },
                            type: { type: 'STRING' },
                            label: { type: 'STRING' },
                        },
                    },
                },
            },
        },
        dbml: { type: 'STRING', description: 'Full DBML schema with real types, constraints, refs, indexes' },
        sql: { type: 'STRING', description: 'PostgreSQL DDL: CREATE TABLE with all constraints and indexes' },
    },
};

class ArchitectAgent {
    /**
     * @param {object} srs - Output from AnalystAgent
     * @returns {Promise<ArchitectureResult>}
     */
    async run(srs) {
        console.log('[Agent 2 — Architect] Designing schema…');

        const storiesSummary = srs.userStories
            .map(u => `  - ${u.id}: ${u.title} — ${u.story}`)
            .join('\n');

        const prompt = [
            `Project: ${srs.projectName}`,
            `Overview: ${srs.projectOverview}`,
            ``,
            `User Stories:`,
            storiesSummary,
            ``,
            `Thiết kế đầy đủ 3 thành phần: db_structure (JSON để render ERD), dbml (tài liệu), sql (PostgreSQL DDL).`,
            `Đảm bảo db_structure.columns[].type chỉ là 1 từ đơn giản (int, string, float, timestamp, uuid).`,
        ].join('\n');

        const result = await aiClient.generate(prompt, SYSTEM, SCHEMA);
        this._validate(result);

        console.log(`[Agent 2 — Architect] Done — ${result.db_structure.tables.length} tables`);
        return result;
    }

    _validate(r) {
        if (!Array.isArray(r?.db_structure?.tables) || r.db_structure.tables.length === 0)
            throw new Error('[Architect] db_structure.tables is empty or missing');
        if (!Array.isArray(r?.db_structure?.relationships))
            throw new Error('[Architect] db_structure.relationships is missing');
        if (!r?.sql?.toLowerCase().includes('create table'))
            throw new Error('[Architect] SQL is missing CREATE TABLE statements');
        if (!r?.dbml?.includes('Table'))
            throw new Error('[Architect] DBML is missing Table definitions');
    }
}

module.exports = new ArchitectAgent();