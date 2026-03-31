document.getElementById('scaffoldForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const prompt = document.getElementById('prompt').value;
    const techStack = document.getElementById('techStack').value;
    const btnText = document.getElementById('btnText');
    const loader = document.getElementById('loader');
    const submitBtn = document.getElementById('generateBtn');
    const statusOutput = document.getElementById('statusOutput');
    const logList = document.getElementById('logList');
    const downloadBtn = document.getElementById('downloadBtn');
    const emptyState = document.querySelector('.empty-state');
    const mermaidViewer = document.getElementById('mermaidViewer');

    if (!prompt.trim()) {
        alert("Vui lòng nhập nghiệp vụ bạn muốn làm!");
        return;
    }

    // Reset UI states
    btnText.textContent = 'Đang suy nghĩ...';
    loader.classList.remove('hidden');
    submitBtn.disabled = true;
    statusOutput.classList.remove('hidden');
    logList.innerHTML = '';
    downloadBtn.classList.add('hidden');
    downloadBtn.disabled = true;
    
    emptyState.classList.add('hidden');
    mermaidViewer.innerHTML = '';

    const queryParams = new URLSearchParams({ prompt, techStack }).toString();
    const eventSource = new EventSource(`/api/generate?${queryParams}`);

    eventSource.addEventListener('progress', (e) => {
        const data = JSON.parse(e.data);
        const li = document.createElement('li');
        li.textContent = `⏳ ${data.message}`;
        logList.appendChild(li);
        logList.scrollTop = logList.scrollHeight; // Auto scroll to bottom
    });

    eventSource.addEventListener('db_ready', async (e) => {
        const data = JSON.parse(e.data);
        const li = document.createElement('li');
        li.textContent = `✅ Sơ đồ ERD đã tải xong. Rendering...`;
        logList.appendChild(li);
        
        // Render ERD Preview using Mermaid
        try {
            // Chuẩn hóa cú pháp dbdiagram.io sang mermaid erDiagram
            // Vì prompt API yêu cầu dbdbigram.io, ở đây làm 1 bước tạm (Mock) nếu cần,
            // hoặc gửi tín hiệu cho Mermaid. Giả sử API trả về Mermaid raw từ AIClient.
            let mermaidCode = "erDiagram\n";
            // Ráp data (Bản nâng cấp sẽ dùng prompt trả thẳng mermaid)
            let rawLines = data.erd.split('\\n');
            const erdSafe = data.erd.replace(/```mermaid/g, '').replace(/```/g, '');
            
            // Vẽ ERD
            mermaidViewer.innerHTML = `<div class="mermaid">${erdSafe}</div>`;
            await mermaid.run({ nodes: [mermaidViewer.querySelector('.mermaid')] });
        } catch(error) {
            console.error("Mermaid Render Error:", error);
            mermaidViewer.innerHTML = "<p style='color: #ef4444'>Lỗi render sơ đồ, vui lòng xem trong file ZIP tải về.</p>";
        }
    });

    eventSource.addEventListener('complete', (e) => {
        const data = JSON.parse(e.data);
        
        const li = document.createElement('li');
        li.innerHTML = `🎉 <strong>Thành công! File dự án đã sẵn sàng.</strong>`;
        logList.appendChild(li);
        
        btnText.textContent = 'Khởi tạo Architecture 🚀';
        loader.classList.add('hidden');
        submitBtn.disabled = false;
        
        // Hiển thị nút tải
        downloadBtn.onclick = () => window.location.href = data.downloadUrl;
        downloadBtn.classList.remove('hidden');
        downloadBtn.disabled = false;

        // Auto tăt EventSource (Đóng stream)
        eventSource.close();
    });

    eventSource.addEventListener('error', (e) => {
        const data = JSON.parse(e.data);
        
        const li = document.createElement('li');
        li.innerHTML = `❌ <strong style="color:#ef4444;">Lỗi Server: ${data.message}</strong>`;
        logList.appendChild(li);
        
        btnText.textContent = 'Thử lại';
        loader.classList.add('hidden');
        submitBtn.disabled = false;
        eventSource.close();
    });
});
