// --- DOM ELEMENTS ---
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
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    btnExportZip: document.getElementById('btnExportZip'),
    btnDownloadSingle: document.getElementById('btnDownloadSingle'),
    themeToggle: document.getElementById('themeToggle'),
    progressBar: document.getElementById('progressBar'),
    progressLabel: document.getElementById('progressLabel'),
    statusAgents: {
        1: document.getElementById('statusAgent1'),
        2: document.getElementById('statusAgent2'),
        3: document.getElementById('statusAgent3'),
        v: document.getElementById('statusValidator')
    }
};

// --- GLOBAL STATE ---
let currentSessionData = {
    id: null,
    prompt: '',
    srs: '',
    erd: '',
    sql: '',
    code: '',
    readme: '',
    timestamp: null
};

const PRESETS = {
    custom: '',
    ecommerce: 'Xây dựng sàn thương mại điện tử: người dùng có thể mua hàng, đưa đồ vào giỏ, thanh toán. Quản trị viên có thể thêm bớt sản phẩm, xem đơn hàng.',
    library: 'Hệ thống quản lý thư viện: Thủ thư có thể thêm sách, quản lý độc giả mượn/trả sách. Tính phí phạt nếu quá hạn.',
    taskmanager: 'Ứng dụng quản lý công việc (Trello clone): User tạo Bảng, Cột, Thẻ. Assign việc cho nhau, comment và set Deadline.',
    smarthome: 'Hệ thống Smart Home Backend: Cho phép thiết lập các thiết bị (Đèn, Điều hòa), tạo Ngữ cảnh (Scene) để tự động bật tắt theo giờ, lưu lịch sử thiết bị.',
    petcare: 'Web app chăm sóc thú cưng: Người dùng đặt lịch khám thú y, theo dõi hồ sơ thú cưng, lịch tiêm chủng, và mua thức ăn lưu giỏ hàng.'
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Landing Page
    el.btnStart.addEventListener('click', () => {
        el.landing.style.opacity = '0';
        setTimeout(() => {
            el.landing.classList.add('hidden');
            el.workspace.classList.remove('hidden');
            loadHistory();
        }, 500);
    });

    // 2. Presets
    el.preset.addEventListener('change', (e) => {
        const val = e.target.value;
        if (PRESETS[val]) el.prompt.value = PRESETS[val];
        else el.prompt.value = '';
    });

    // 3. Theme Toggle
    el.themeToggle.addEventListener('click', () => {
        const root = document.documentElement;
        const newTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', newTheme);
        mermaid.initialize({ theme: newTheme });
    });

    // 4. Tabs
    el.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            el.tabBtns.forEach(b => b.classList.remove('active'));
            el.tabPanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.getAttribute('data-target');
            document.getElementById(target).classList.add('active');
            
            // Re-render mermaid if tab is ERD
            if (target === 'tab-erd' && currentSessionData.erd) {
                renderMermaid();
            }
        });
    });

    // 5. Buttons
    el.btnGen.addEventListener('click', () => startPipeline(false));
    el.btnRefine.addEventListener('click', () => startPipeline(true)); // Regenerate with dồn context
    el.btnReset.addEventListener('click', resetWorkspace);
    el.btnDownloadSingle.addEventListener('click', downloadSingleArtifact);
    el.btnExportZip.addEventListener('click', downloadFullZip);
});

// --- CORE PIPELINE (SSE) ---
let eventSource = null;

function startPipeline(isRefine) {
    const rawPrompt = el.prompt.value.trim();
    if (!rawPrompt) {
        alert("Vui lòng nhập Prompt mô tả dự án!");
        return;
    }

    // Nếu Refine => Gộp Prompt cũ và mới
    const finalPrompt = isRefine ? `[LỊCH SỬ DỰ ÁN CŨ]:\n${currentSessionData.prompt}\n\n[BỔ SUNG/SỬA ĐỔI MỚI]:\n${rawPrompt}` : rawPrompt;

    // Reset UI
    clearPreviews();
    el.statusPanel.classList.remove('hidden');
    resetAgentUI();
    setProgress(0, 'Đang khởi tạo pipeline...');
    toggleButtons(true);
    
    // Init state
    currentSessionData = {
        id: 'chk_' + Date.now(),
        prompt: finalPrompt,
        timestamp: new Date().toLocaleString()
    };

    // Open connection
    const tech = el.techStack.value;
    const url = `/api/generate?prompt=${encodeURIComponent(finalPrompt)}&tech=${encodeURIComponent(tech)}`;
    eventSource = new EventSource(url);

    eventSource.addEventListener('progress', (e) => {
        const data = JSON.parse(e.data);
        console.log("Progress:", data.message);
        
        // Progress bar update
        const stepMap = { 1: 25, 2: 50, 3: 75, 4: 100 };
        if (data.step) setProgress(stepMap[data.step] || 0, data.message);

        // Agent status icons
        if (data.message.includes('Agent 1')) updateAgentUI(1, 'working');
        else if (data.message.includes('Agent 2')) { updateAgentUI(1, 'done'); updateAgentUI(2, 'working'); }
        else if (data.message.includes('Agent 3')) { updateAgentUI(2, 'done'); updateAgentUI(3, 'working'); }
        else if (data.message.includes('hoàn tất') || data.message.includes('đóng gói')) { updateAgentUI(3, 'done'); updateAgentUI('v', 'working'); }
    });

    eventSource.addEventListener('srs_ready', (e) => {
        const data = JSON.parse(e.data);
        const stories = data.userStories || [];
        const md = `# Overview\n${data.projectOverview}\n\n## User Stories\n${stories.map(u => `- **${u.id} - ${u.title}**: ${u.story}`).join('\n')}`;
        currentSessionData.srs = md;
        document.getElementById('tab-srs').innerHTML = marked.parse(md);
    });

    eventSource.addEventListener('db_ready', (e) => {
        const data = JSON.parse(e.data);
        currentSessionData.erd = data.erd;
        currentSessionData.sql = data.sql;
        renderMermaid();
        const safeSql = data.sql ? data.sql.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
        document.getElementById('tab-sql').innerHTML = safeSql;
    });

    eventSource.addEventListener('backend_ready', (e) => {
        const data = JSON.parse(e.data);
        let previewCode = `/* --- src/server.js --- */\n${data.serverCode || ''}\n\n/* --- src/app.js --- */\n${data.appCode || ''}\n\n/* --- src/db.js --- */\n${data.dbCode || ''}\n\n`;
        
        ['controllers', 'services', 'routes'].forEach(folder => {
            if(Array.isArray(data[folder])) {
                data[folder].forEach(f => {
                    previewCode += `/* --- src/${folder}/${f.filename} --- */\n${f.code}\n\n`;
                });
            }
        });

        currentSessionData.code = previewCode.trim();
        currentSessionData.readme = data.readme || "# Vibe-Architect Generated Code";
        
        // Syntax Highlighting
        const lang = el.techStack.value.includes('Python') ? 'python' : 'javascript';
        const highlighted = hljs.highlight(currentSessionData.code, { language: lang }).value;
        document.getElementById('tab-code').innerHTML = `<pre><code class="hljs">${highlighted}</code></pre>`;
        document.getElementById('tab-readme').innerHTML = marked.parse(currentSessionData.readme);
    });

    eventSource.addEventListener('complete', (e) => {
        const data = JSON.parse(e.data);
        updateAgentUI('v', 'done');
        setProgress(100, '✅ Pipeline hoàn tất!');
        toggleButtons(false);
        el.btnExportZip.classList.remove('hidden');
        el.btnExportZip.setAttribute('data-url', data.downloadUrl);
        saveCheckpoint();
        eventSource.close();
    });

    eventSource.addEventListener('error', (e) => {
        updateAgentUI('v', 'failed');
        let errData = { message: "Unknown Error" };
        try { errData = JSON.parse(e.data); } catch(ex){}
        alert("❌ Lỗi Pipeline: " + errData.message);
        toggleButtons(false);
        eventSource.close();
    });
}

// --- UI HELPERS ---
function resetAgentUI() {
    Object.values(el.statusAgents).forEach(li => {
        li.className = 'waiting';
        li.querySelector('.icon').textContent = '○';
    });
}
function updateAgentUI(id, state) {
    const li = el.statusAgents[id];
    if(!li) return;
    li.className = state;
    if (state === 'done') li.querySelector('.icon').textContent = '●';
    if (state === 'failed') li.querySelector('.icon').textContent = '✕';
    if (state === 'working') li.querySelector('.icon').textContent = '◌';
}

function setProgress(percent, label) {
    if (el.progressBar) el.progressBar.style.width = percent + '%';
    if (el.progressLabel) el.progressLabel.textContent = `${percent}% — ${label}`;
}

function clearPreviews() {
    document.querySelectorAll('.tab-pane').forEach(p => p.innerHTML = '<div class="empty-state">Đang chờ Dữ liệu...</div>');
    document.getElementById('tab-erd').innerHTML = `<div id="mermaidViewer" class="mermaid">graph TD; A[Loading] --> B(Đang vẽ...);</div>`;
}

function renderMermaid() {
    const viewer = document.getElementById('mermaidViewer');
    if(!viewer || !currentSessionData.erd) return;
    
    // Clean code formatting for mermaid
    let cleanErd = currentSessionData.erd.replace(/```mermaid/g, '').replace(/```/g, '').trim();
    if(!cleanErd.startsWith('erDiagram')) cleanErd = "erDiagram\n" + cleanErd;

    viewer.innerHTML = cleanErd;
    try {
        viewer.removeAttribute('data-processed'); // force re-render
        mermaid.run({ nodes: [viewer] });
    } catch(e) {
        viewer.innerHTML = `<div class="empty-state" style="color:var(--danger)">Cú pháp ERD bị lỗi. Chọn Refresh hoặc xem SQL.</div>`;
    }
}

function toggleButtons(isWorking) {
    el.btnGen.disabled = isWorking;
    if(!isWorking && currentSessionData.srs) {
        el.btnRefine.classList.remove('hidden');
        el.btnReset.classList.remove('hidden');
    }
}

function resetWorkspace() {
    if(confirm("Xác nhận xóa trắng màn hình? Lịch sử vẫn sẽ được giữ lại.")) {
        currentSessionData = {};
        el.prompt.value = '';
        clearPreviews();
        el.preset.value = "custom";
        el.statusPanel.classList.add('hidden');
        el.btnRefine.classList.add('hidden');
        el.btnReset.classList.add('hidden');
        el.btnExportZip.classList.add('hidden');
    }
}

// --- HISTORY & CHECKPOINTS ---
function saveCheckpoint() {
    let history = JSON.parse(localStorage.getItem('vibe_history') || '[]');
    // Max 10 items
    history.unshift(currentSessionData);
    if(history.length > 10) history = history.slice(0, 10);
    localStorage.setItem('vibe_history', JSON.stringify(history));
    loadHistory();
}

function loadHistory() {
    const history = JSON.parse(localStorage.getItem('vibe_history') || '[]');
    el.historyList.innerHTML = '';
    
    if(history.length===0) {
        el.historyList.innerHTML = '<li class="empty-state" style="margin:0;font-size:0.8rem">Chưa có bản nháp nào.</li>';
        return;
    }

    history.forEach((sess, idx) => {
        const titleText = sess.prompt.substring(0, 30) + "...";
        const html = `
            <li class="history-item" data-idx="${idx}">
                <div>
                    <strong>v${history.length - idx}.</strong> ${titleText}<br>
                    <small style="color:var(--text-muted)">${sess.timestamp}</small>
                </div>
                <span>↻</span>
            </li>
        `;
        el.historyList.insertAdjacentHTML('beforeend', html);
    });

    document.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', (e) => restoreCheckpoint(e.currentTarget.dataset.idx));
    });
}

function restoreCheckpoint(idx) {
    const history = JSON.parse(localStorage.getItem('vibe_history') || '[]');
    currentSessionData = history[idx];
    if(!currentSessionData) return;

    // Load to UI
    el.prompt.value = currentSessionData.prompt;
    document.getElementById('tab-srs').innerHTML = marked.parse(currentSessionData.srs);
    
    const safeSql = currentSessionData.sql ? currentSessionData.sql.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    document.getElementById('tab-sql').innerHTML = safeSql;
    
    const safeCode = currentSessionData.code ? currentSessionData.code.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    document.getElementById('tab-code').innerHTML = safeCode;
    
    document.getElementById('tab-readme').innerHTML = marked.parse(currentSessionData.readme);
    
    // Switch to ERD Tab to render
    document.querySelector('[data-target="tab-erd"]').click();

    // Enable buttons
    el.btnRefine.classList.remove('hidden');
    el.btnReset.classList.remove('hidden');
    alert("Khôi phục phiên làm việc thành công!");
}

// --- EXPORT ---
function downloadSingleArtifact() {
    // Determine active tab
    const activeBtn = document.querySelector('.tab-btn.active');
    const target = activeBtn.getAttribute('data-target');
    
    let content = "", filename = "";
    if(target==='tab-srs') { content = currentSessionData.srs; filename = 'SRS.md'; }
    if(target==='tab-erd') { content = currentSessionData.erd; filename = 'ERD.mmd'; }
    if(target==='tab-sql') { content = currentSessionData.sql; filename = 'Database.sql'; }
    if(target==='tab-code') { content = currentSessionData.code; filename = 'Backend_Code.js'; }
    if(target==='tab-readme') { content = currentSessionData.readme; filename = 'README.md'; }

    if(!content) return alert("Không có dữ liệu ở tab này!");

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function downloadFullZip() {
    const url = el.btnExportZip.getAttribute('data-url');
    if(!url) return alert("ZIP chưa sẵn sàng!");
    window.location.href = url;
}
