'use strict';

const el = {
    landing: document.getElementById('landingPage'),
    btnStart: document.getElementById('getStartedBtn'),
    workspace: document.getElementById('workspace'),
    preset: document.getElementById('presetSelect'),
    techStack: document.getElementById('techStack'),
    prompt: document.getElementById('prompt'),
    btnGen: document.getElementById('btnGenerate'),
    btnRefine: document.getElementById('btnRefine'),
    btnReset: document.getElementById('btnReset'),
    statusPanel: document.getElementById('statusPanel'),
    historyList: document.getElementById('historyList'),
    btnClearHistory: document.getElementById('btnClearHistory'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    btnExportZip: document.getElementById('btnExportZip'),
    btnDownload: document.getElementById('btnDownloadSingle'),
    themeToggle: document.getElementById('themeToggle'),
    progressBar: document.getElementById('progressBar'),
    progressLabel: document.getElementById('progressLabel'),
    agents: {
        1: document.getElementById('statusAgent1'),
        2: document.getElementById('statusAgent2'),
        3: document.getElementById('statusAgent3'),
        v: document.getElementById('statusValidator'),
    },
};

const HISTORY_KEY = 'vibe_history';
const MAX_HISTORY = 10;
const PRESETS = {
    custom: '',
    ecommerce: 'Xây dựng sàn thương mại điện tử: người dùng đăng ký, đăng nhập, duyệt sản phẩm, thêm vào giỏ hàng và thanh toán. Admin quản lý sản phẩm, đơn hàng và người dùng.',
    library: 'Hệ thống quản lý thư viện: thủ thư quản lý sách, độc giả và lịch sử mượn trả. Tính phí phạt nếu trả quá hạn. Hỗ trợ tìm kiếm sách theo tên và tác giả.',
    taskmanager: 'Ứng dụng quản lý công việc theo phong cách Trello: người dùng tạo Board, Column và Card. Gán thành viên vào task, comment, đặt deadline và theo dõi tiến độ.',
    smarthome: 'Smart Home Backend: quản lý các thiết bị IoT, tạo Scene tự động kích hoạt theo lịch hoặc điều kiện, lưu log lịch sử hoạt động.',
    petcare: 'Ứng dụng chăm sóc thú cưng: đặt lịch khám thú y, lưu hồ sơ thú cưng, nhắc lịch tiêm chủng và tẩy giun, mua thức ăn và phụ kiện.',
};

const EMPTY_STATES = {
    srs: iconEmpty('file-search', 'Waiting for Agent 1 - SRS analysis...'),
    sql: iconEmpty('database-backup', 'Waiting for Agent 2 - SQL schema...'),
    dbml: iconEmpty('scroll-text', 'Waiting for DBML generation...'),
    code: iconEmpty('binary', 'Waiting for Agent 3 - backend code...'),
    readme: iconEmpty('notebook-tabs', 'Waiting for README generation...'),
    processing: iconEmpty('loader-circle', 'Đang xử lý pipeline...'),
    noData: iconEmpty('inbox', 'Không có dữ liệu.'),
};

let session = createEmptySession();
let eventSource = null;
let pipelineWarning = null;

function createEmptySession() {
    return {
        id: null,
        prompt: '',
        srs: '',
        erd: '',
        sql: '',
        dbml: '',
        code: '',
        readme: '',
        isFlask: false,
        timestamp: null,
    };
}

function iconEmpty(icon, text) {
    return `<div class="empty-state"><i data-lucide="${icon}"></i><p>${escapeHtml(text)}</p></div>`;
}

function refreshIcons() {
    if (window.lucide?.createIcons) {
        window.lucide.createIcons();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    refreshIcons();

    el.btnStart.addEventListener('click', () => {
        el.landing.style.opacity = '0';
        setTimeout(() => {
            el.landing.classList.add('hidden');
            el.workspace.classList.remove('hidden');
            loadHistory();
            refreshIcons();
        }, 500);
    });

    el.preset.addEventListener('change', event => {
        el.prompt.value = PRESETS[event.target.value] ?? '';
    });

    el.themeToggle.addEventListener('click', () => {
        const nextTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nextTheme);
        mermaid.initialize({ startOnLoad: false, theme: nextTheme });
        if (session.erd) renderMermaid();
    });

    el.tabBtns.forEach(button => {
        button.addEventListener('click', () => {
            el.tabBtns.forEach(item => item.classList.remove('active'));
            el.tabPanes.forEach(item => item.classList.remove('active'));
            button.classList.add('active');
            const target = button.getAttribute('data-target');
            document.getElementById(target)?.classList.add('active');
            if (target === 'tab-erd' && session.erd) renderMermaid();
            refreshIcons();
        });
    });

    el.btnGen.addEventListener('click', () => startPipeline(false));
    el.btnRefine.addEventListener('click', () => startPipeline(true));
    el.btnReset.addEventListener('click', resetWorkspace);
    el.btnClearHistory.addEventListener('click', clearHistory);
    el.btnDownload.addEventListener('click', downloadActiveTab);
    el.btnExportZip.addEventListener('click', downloadZip);
});

function startPipeline(isRefine) {
    const rawPrompt = el.prompt.value.trim();
    if (!rawPrompt) {
        alert('Vui lòng nhập mô tả dự án.');
        return;
    }

    const finalPrompt = isRefine
        ? `[DỰ ÁN CŨ]\n${session.prompt}\n\n[YÊU CẦU BỔ SUNG / CHỈNH SỬA]\n${rawPrompt}`
        : rawPrompt;

    clearPreviews();
    el.statusPanel.classList.remove('hidden');
    resetAgentUI();
    setProgress(0, 'Đang khởi tạo pipeline...');
    setWorking(true);
    pipelineWarning = null;

    session = {
        ...createEmptySession(),
        id: `sess_${Date.now()}`,
        prompt: finalPrompt,
        timestamp: new Date().toLocaleString('vi-VN'),
    };

    eventSource?.close();
    const stack = el.techStack.value;
    const url = `/api/generate?prompt=${encodeURIComponent(finalPrompt)}&stack=${encodeURIComponent(stack)}`;
    eventSource = new EventSource(url);

    eventSource.addEventListener('progress', event => {
        const { step, message } = JSON.parse(event.data);
        const progress = { 1: 18, 2: 42, 3: 68, 4: 90 }[step] ?? 0;
        setProgress(progress, message);

        if (step === 1) updateAgent(1, 'working');
        if (step === 2) {
            updateAgent(1, 'done');
            updateAgent(2, 'working');
        }
        if (step === 3) {
            updateAgent(2, 'done');
            updateAgent(3, 'working');
        }
        if (step === 4) {
            updateAgent(3, 'done');
            updateAgent('v', 'working');
        }
    });

    eventSource.addEventListener('warning', event => {
        pipelineWarning = JSON.parse(event.data).message ?? null;
    });

    eventSource.addEventListener('srs_ready', event => {
        const data = JSON.parse(event.data);
        session.isFlask = data.isFlask === true;

        const stories = (data.userStories ?? []).map(userStory => {
            const acceptanceCriteria = (userStory.acceptanceCriteria ?? []).map(item => `- ${item}`).join('\n');
            return `### ${userStory.id} - ${userStory.title}\n\n${userStory.story}\n\n${acceptanceCriteria}`;
        }).join('\n\n');

        session.srs = `# ${data.projectName}\n\n> ${data.projectOverview}\n\n## User Stories\n\n${stories}`;
        setTabContent('tab-srs', renderMarkdownSafe(session.srs));
    });

    eventSource.addEventListener('db_ready', event => {
        const data = JSON.parse(event.data);
        session.sql = data.sql ?? '';
        session.dbml = data.dbml ?? '';
        session.erd = buildMermaidFromJSON(data.db_structure);
        renderMermaid();

        if (session.sql) {
            const highlighted = hljs.highlight(session.sql, { language: 'sql' }).value;
            setTabContent('tab-sql', `<pre><code class="hljs language-sql">${highlighted}</code></pre>`);
        }

        if (session.dbml) {
            setTabContent('tab-dbml', `<pre class="code-body">${escapeHtml(session.dbml)}</pre>`);
        }
    });

    eventSource.addEventListener('backend_ready', event => {
        const data = JSON.parse(event.data);
        session.readme = data.readme ?? '';
        session.code = buildCodePreview(data);
        session.isFlask = data.isFlask === true;

        const language = session.isFlask ? 'python' : 'javascript';
        try {
            const highlighted = hljs.highlight(session.code, { language }).value;
            setTabContent('tab-code', `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`);
        } catch {
            setTabContent('tab-code', `<pre><code>${escapeHtml(session.code)}</code></pre>`);
        }

        setTabContent('tab-readme', renderMarkdownSafe(session.readme));
    });

    eventSource.addEventListener('complete', event => {
        const data = JSON.parse(event.data);
        updateAgent('v', 'done');
        setProgress(100, `Pipeline hoàn tất. Project ZIP đã sẵn sàng.${pipelineWarning ? ' Cảnh báo: pipeline đang dùng mock mode.' : ''}`);
        setWorking(false);
        el.btnExportZip.classList.remove('hidden');
        el.btnExportZip.dataset.url = data.downloadUrl;
        el.btnExportZip.dataset.usedMock = String(Boolean(data.usedMock));
        saveSession();
        eventSource.close();
    });

    eventSource.addEventListener('error', event => {
        updateAgent('v', 'failed');
        let message = 'Lỗi không xác định';
        try {
            message = JSON.parse(event.data).message;
        } catch {
            message = 'Không thể kết nối tới pipeline.';
        }
        setProgress(0, `Lỗi: ${message}`);
        alert(`Pipeline thất bại:\n${message}`);
        setWorking(false);
        eventSource.close();
    });
}

function buildMermaidFromJSON(data) {
    if (!data?.tables?.length) return 'erDiagram\n  _empty_ {\n  }\n';

    let output = 'erDiagram\n';
    data.tables.forEach(table => {
        output += `  ${sanitizeMermaidId(table.name)} {\n`;
        (table.columns ?? []).forEach(column => {
            output += `    ${sanitizeMermaidType(column.type ?? 'string')} ${sanitizeMermaidId(column.name)}\n`;
        });
        output += '  }\n';
    });

    (data.relationships ?? []).forEach(relationship => {
        if (!relationship.from || !relationship.to || !relationship.type) return;
        const label = relationship.label ? ` : "${relationship.label}"` : '';
        output += `  ${sanitizeMermaidId(relationship.from)} ${relationship.type} ${sanitizeMermaidId(relationship.to)}${label}\n`;
    });

    return output;
}

function sanitizeMermaidId(value) {
    return (value ?? 'unknown').replace(/[^a-zA-Z0-9_]/g, '_');
}

function sanitizeMermaidType(value) {
    return (value ?? 'string')
        .replace(/\(.*?\)/g, '')
        .replace(/\s+\w+/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, 20) || 'string';
}

function renderMermaid() {
    let viewer = document.getElementById('mermaidViewer');
    if (!viewer) {
        const tab = document.getElementById('tab-erd');
        if (!tab) return;
        tab.innerHTML = '<div id="mermaidViewer" class="mermaid"></div>';
        viewer = document.getElementById('mermaidViewer');
    }

    if (!session.erd) return;
    viewer.textContent = session.erd;
    viewer.removeAttribute('data-processed');

    try {
        mermaid.run({ nodes: [viewer] });
    } catch (error) {
        console.error('[Mermaid] Render error:', error);
        viewer.innerHTML = '<div class="empty-state"><i data-lucide="triangle-alert"></i><p>ERD render thất bại. Xem tạm ở tab SQL hoặc DBML.</p></div>';
        refreshIcons();
    }
}

function buildCodePreview(data) {
    const parts = [];

    if (data.isFlask) {
        if (data.runCode) parts.push(`# run.py\n${data.runCode}`);
        if (data.initCode) parts.push(`# app/__init__.py\n${data.initCode}`);
        if (data.configCode) parts.push(`# app/config.py\n${data.configCode}`);
        if (data.dbCode) parts.push(`# app/db.py\n${data.dbCode}`);
    } else {
        if (data.serverCode) parts.push(`// src/server.js\n${data.serverCode}`);
        if (data.appCode) parts.push(`// src/app.js\n${data.appCode}`);
        if (data.dbCode) parts.push(`// src/db.js\n${data.dbCode}`);
    }

    for (const folder of ['controllers', 'services', 'routes']) {
        for (const file of (data[folder] ?? [])) {
            const header = data.isFlask ? `# app/${folder}/${file.filename}` : `// src/${folder}/${file.filename}`;
            parts.push(`${header}\n${file.code}`);
        }
    }

    return parts.join('\n\n').trim();
}

function setTabContent(id, html) {
    const tab = document.getElementById(id);
    if (tab) {
        tab.innerHTML = html;
        refreshIcons();
    }
}

function renderMarkdownSafe(markdown) {
    return sanitizeHtml(marked.parse(normalizeReadmeMarkdown(markdown ?? '')));
}

function normalizeReadmeMarkdown(markdown) {
    const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n');
    const output = [];
    let inFence = false;

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.startsWith('```')) {
            inFence = !inFence;
            output.push(line);
            continue;
        }

        if (!inFence && /^#{1,6}\s+(project structure|cấu trúc thư mục|folder structure|directory structure)$/i.test(trimmed)) {
            output.push(line);
            output.push('');

            const block = [];
            let j = i + 1;

            while (j < lines.length) {
                const candidate = lines[j];
                const candidateTrimmed = candidate.trim();

                if (!candidateTrimmed) {
                    if (block.length) break;
                    j += 1;
                    continue;
                }

                if (/^#{1,6}\s+/.test(candidateTrimmed)) break;
                if (/^[-*]\s+/.test(candidateTrimmed) && !/[│├└─]/.test(candidateTrimmed)) break;

                block.push(candidate);
                j += 1;
            }

            if (block.length) {
                output.push('```text');
                output.push(...block);
                output.push('```');
                output.push('');
                i = j - 1;
                continue;
            }
        }

        output.push(line);
    }

    return output.join('\n');
}

function sanitizeHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html ?? '';
    const blockedTags = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'STYLE', 'LINK']);
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
    const toRemove = [];

    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (blockedTags.has(node.tagName)) {
            toRemove.push(node);
            continue;
        }

        for (const attr of [...node.attributes]) {
            const name = attr.name.toLowerCase();
            const value = attr.value.trim().toLowerCase();
            if (name.startsWith('on')) {
                node.removeAttribute(attr.name);
                continue;
            }
            if ((name === 'href' || name === 'src' || name === 'xlink:href') && value.startsWith('javascript:')) {
                node.removeAttribute(attr.name);
            }
        }
    }

    toRemove.forEach(node => node.remove());
    return template.innerHTML;
}

function clearPreviews() {
    setTabContent('tab-srs', EMPTY_STATES.processing);
    setTabContent('tab-sql', EMPTY_STATES.processing);
    setTabContent('tab-dbml', EMPTY_STATES.processing);
    setTabContent('tab-code', EMPTY_STATES.processing);
    setTabContent('tab-readme', EMPTY_STATES.processing);
    setTabContent('tab-erd', '<div id="mermaidViewer" class="mermaid">graph TD; A[Đang tạo ERD...]</div>');
}

function resetAgentUI() {
    Object.values(el.agents).forEach(item => {
        if (!item) return;
        item.className = 'waiting';
        const icon = item.querySelector('.icon');
        if (icon) icon.textContent = '○';
    });
}

function updateAgent(id, state) {
    const item = el.agents[id];
    if (!item) return;
    item.className = state;
    const icon = item.querySelector('.icon');
    if (!icon) return;
    icon.textContent = { done: '●', failed: '×', working: '◌' }[state] ?? '○';
}

function setProgress(percent, label) {
    if (el.progressBar) el.progressBar.style.width = `${percent}%`;
    if (el.progressLabel) el.progressLabel.textContent = `${percent}% - ${label}`;
}

function setWorking(isWorking) {
    el.btnGen.disabled = isWorking;
    el.btnRefine.disabled = isWorking;
    el.btnReset.disabled = isWorking;
    if (!isWorking && session.srs) {
        el.btnRefine.classList.remove('hidden');
        el.btnReset.classList.remove('hidden');
    }
}

function resetWorkspace() {
    if (!confirm('Xóa trạng thái hiện tại? Lịch sử vẫn được giữ lại.')) return;
    eventSource?.close();
    session = createEmptySession();
    el.prompt.value = '';
    el.preset.value = 'custom';
    clearPreviews();
    setTabContent('tab-srs', EMPTY_STATES.srs);
    setTabContent('tab-sql', EMPTY_STATES.sql);
    setTabContent('tab-dbml', EMPTY_STATES.dbml);
    setTabContent('tab-code', EMPTY_STATES.code);
    setTabContent('tab-readme', EMPTY_STATES.readme);
    setTabContent('tab-erd', '<div id="mermaidViewer" class="mermaid">graph TD; A[ERD Preview] --> B(Waiting...);</div>');
    el.statusPanel.classList.add('hidden');
    el.btnRefine.classList.add('hidden');
    el.btnReset.classList.add('hidden');
    el.btnExportZip.classList.add('hidden');
    el.btnExportZip.dataset.url = '';
    el.btnExportZip.dataset.usedMock = 'false';
    resetAgentUI();
}

function escapeHtml(value) {
    return (value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function saveSession() {
    try {
        let history = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
        history = history.filter(item => item.id !== session.id);
        history.unshift({ ...session });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
        loadHistory();
    } catch (error) {
        console.warn('[History] Save failed:', error);
    }
}

function loadHistory() {
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    } catch {
        history = [];
    }

    if (!history.length) {
        el.historyList.innerHTML = '<li class="empty-state" style="min-height:120px"><i data-lucide="history"></i><p>Chưa có phiên nào được lưu.</p></li>';
        refreshIcons();
        return;
    }

    el.historyList.innerHTML = history.map((item, index) => `
        <li class="history-item" data-idx="${index}">
            <div>
                <strong>v${history.length - index}.</strong> ${escapeHtml((item.prompt ?? '').substring(0, 52))}...<br>
                <small>${escapeHtml(item.timestamp ?? '')}</small>
            </div>
            <span>↗</span>
        </li>
    `).join('');

    el.historyList.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', event => restoreSession(Number(event.currentTarget.dataset.idx)));
    });
}

function clearHistory() {
    const confirmed = confirm('Bạn có chắc muốn xóa toàn bộ lịch sử đã lưu không?');
    if (!confirmed) return;

    localStorage.removeItem(HISTORY_KEY);
    loadHistory();
}

function restoreSession(index) {
    try {
        const history = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
        const saved = history[index];
        if (!saved) return;

        session = { ...saved };
        el.prompt.value = saved.prompt ?? '';
        setTabContent('tab-srs', saved.srs ? renderMarkdownSafe(saved.srs) : EMPTY_STATES.noData);
        setTabContent('tab-readme', saved.readme ? renderMarkdownSafe(saved.readme) : EMPTY_STATES.noData);

        if (saved.sql) {
            const highlighted = hljs.highlight(saved.sql, { language: 'sql' }).value;
            setTabContent('tab-sql', `<pre><code class="hljs language-sql">${highlighted}</code></pre>`);
        } else {
            setTabContent('tab-sql', EMPTY_STATES.noData);
        }

        if (saved.dbml) {
            setTabContent('tab-dbml', `<pre class="code-body">${escapeHtml(saved.dbml)}</pre>`);
        } else {
            setTabContent('tab-dbml', EMPTY_STATES.noData);
        }

        if (saved.code) {
            const language = saved.isFlask ? 'python' : 'javascript';
            try {
                const highlighted = hljs.highlight(saved.code, { language }).value;
                setTabContent('tab-code', `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`);
            } catch {
                setTabContent('tab-code', `<pre><code>${escapeHtml(saved.code)}</code></pre>`);
            }
        } else {
            setTabContent('tab-code', EMPTY_STATES.noData);
        }

        setTabContent('tab-erd', '<div id="mermaidViewer" class="mermaid"></div>');
        setTimeout(renderMermaid, 80);
        el.btnRefine.classList.remove('hidden');
        el.btnReset.classList.remove('hidden');
        el.statusPanel.classList.remove('hidden');
        setProgress(100, 'Đã khôi phục phiên đã lưu.');
        Object.keys(el.agents).forEach(key => updateAgent(key, 'done'));
    } catch (error) {
        console.error('[History] Restore failed:', error);
        alert('Không thể khôi phục phiên này.');
    }
}

function downloadActiveTab() {
    const activeButton = document.querySelector('.tab-btn.active');
    if (!activeButton) return;

    const target = activeButton.getAttribute('data-target');
    const fileMap = {
        'tab-srs': { content: session.srs, name: 'SRS.md', type: 'text/markdown' },
        'tab-erd': { content: session.erd, name: 'ERD.mmd', type: 'text/plain' },
        'tab-sql': { content: session.sql, name: 'schema.sql', type: 'text/plain' },
        'tab-dbml': { content: session.dbml, name: 'database.dbml', type: 'text/plain' },
        'tab-code': { content: session.code, name: session.isFlask ? 'backend.py' : 'backend.js', type: 'text/plain' },
        'tab-readme': { content: session.readme, name: 'README.md', type: 'text/markdown' },
    };

    const entry = fileMap[target];
    if (!entry?.content) {
        alert('Tab này chưa có dữ liệu để tải về.');
        return;
    }

    const blob = new Blob([entry.content], { type: `${entry.type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = Object.assign(document.createElement('a'), { href: url, download: entry.name });
    anchor.click();
    URL.revokeObjectURL(url);
}

function downloadZip() {
    const url = el.btnExportZip.dataset.url;
    if (!url) {
        alert('ZIP chưa được tạo. Hãy chạy pipeline trước.');
        return;
    }
    if (el.btnExportZip.dataset.usedMock === 'true') {
        const proceed = confirm('Pipeline này có dùng mock mode. Bạn vẫn muốn tải artifact để xem demo?');
        if (!proceed) return;
    }
    window.location.href = url;
}
