'use strict';

const aiClient = require('../services/AIClient');

const SYSTEM = `
Bạn là một Senior Business Analyst chuyên nghiệp (Analyst).
Nhiệm vụ: Phân tích mô tả dự án và tạo SRS hoàn chỉnh.

QUY TẮC BẮT BUỘC:
1. projectName: slug không dấu, viết thường, dấu gạch ngang. VD: "quan-ly-thu-vien", "pet-care-app".
2. isFlask: Được xác định bởi "Yêu cầu Stack" đã cung cấp — KHÔNG được suy đoán từ mô tả.
3. Tạo ít nhất 7 User Story bao phủ người dùng thường + admin + các tính năng cốt lõi.
4. Mỗi User Story PHẢI có ít nhất 2 acceptanceCriteria cụ thể, đo được (testable).
5. Không bịa thêm tính năng không có trong mô tả. Chỉ suy luận hợp lý.
6. Trả về JSON thuần túy theo schema. Không thêm bất kỳ text nào ngoài JSON.
`.trim();

const SCHEMA = {
    type: 'OBJECT',
    required: ['projectName', 'isFlask', 'projectOverview', 'userStories'],
    properties: {
        projectName: { type: 'STRING', description: 'slug-format, no accents, lowercase, hyphens' },
        isFlask: { type: 'BOOLEAN', description: 'true for Python/Flask, false for Node.js/Express' },
        projectOverview: { type: 'STRING', description: '2-4 sentence summary of the project in Vietnamese' },
        userStories: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                required: ['id', 'title', 'story', 'acceptanceCriteria'],
                properties: {
                    id: { type: 'STRING' },
                    title: { type: 'STRING' },
                    story: { type: 'STRING', description: 'Format: "Là [vai trò], tôi muốn [hành động] để [mục đích]."' },
                    acceptanceCriteria: { type: 'ARRAY', items: { type: 'STRING' }, description: 'At least 2 testable criteria' },
                },
            },
        },
    },
};

class AnalystAgent {
    /**
     * @param {string} description    - Raw project description from user
     * @param {string} stackPref      - Stack preference: "Node.js" | "Python Flask"
     * @returns {Promise<SrsResult>}
     */
    async run(description, stackPref = 'Node.js') {
        const isFlaskStack = stackPref.toLowerCase().includes('python') || stackPref.toLowerCase().includes('flask');
        console.log(`[Agent 1 — Analyst] Stack: ${stackPref} (isFlask=${isFlaskStack})`);

        const prompt = [
            `Mô tả dự án:`,
            `"""`,
            description,
            `"""`,
            ``,
            `Yêu cầu Stack: ${stackPref}`,
            `isFlask phải = ${isFlaskStack} (bắt buộc, không được thay đổi).`,
            ``,
            `Phân tích và tạo SRS hoàn chỉnh theo schema.`,
        ].join('\n');

        const result = await aiClient.generate(prompt, SYSTEM, SCHEMA);

        // Enforce isFlask from stackPref — don't trust LLM decision
        result.isFlask = isFlaskStack;

        this._validate(result);
        console.log(`[Agent 1 — Analyst] Done: "${result.projectName}", ${result.userStories.length} stories`);
        return result;
    }

    _validate(r) {
        if (!r?.projectName)
            throw new Error('[Analyst] Missing projectName');
        if (typeof r.isFlask !== 'boolean')
            throw new Error('[Analyst] isFlask must be boolean');
        if (!r?.projectOverview)
            throw new Error('[Analyst] Missing projectOverview');
        if (!Array.isArray(r.userStories) || r.userStories.length < 3)
            throw new Error('[Analyst] Need at least 3 user stories');

        for (const us of r.userStories) {
            if (!us.id || !us.title || !us.story)
                throw new Error(`[Analyst] User story ${us.id ?? '?'} is incomplete`);
            if (!Array.isArray(us.acceptanceCriteria) || us.acceptanceCriteria.length < 1)
                throw new Error(`[Analyst] User story ${us.id} missing acceptanceCriteria`);
        }
    }
}

module.exports = new AnalystAgent();