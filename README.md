# ✨ Vibe-Architect (Scaffolding Engine) v2.1 — Elite AI Edition

**Hệ sinh thái kiến trúc Backend thông minh bậc nhất — Thiết kế tối ưu cho các buổi Demo và Đồ án Công nghệ.**
*PROJECT: Software Engineering Midterm | TARGET SCORE: 10/10*

![Vibe-Architect UI Preview](https://raw.githubusercontent.com/dinhhao03/vibe-architect/main/docs/ui-preview.png)

## 🚀 Giới Thiệu

**Vibe-Architect** là một công cụ Scaffolding Engine mạnh mẽ dựa trên kiến trúc **AI Agentic Workflow**. Không giống như các trình sinh mã nguồn thông thường, Vibe-Architect phối hợp nhiều "Agent" chuyên biệt để phân tích nghiệp vụ, thiết kế cơ sở dữ liệu và viết mã nguồn Backend hoàn chỉnh (Node.js/Flask) theo chuẩn Production chỉ từ một câu mô tả ý tưởng.

---

## 💎 Các Tính Năng Đắt Giá (Phiên bản v2.1)

### 1. 🧠 Multi-Agent Orchestration Pipeline
Quy trình tư duy độc lập qua 3 "não bộ" AI chuyên biệt:
-   **Agent 1 (Analyst):** Phân tích nghiệp vụ, sinh ra User Stories và tài liệu SRS.
-   **Agent 2 (Architect):** Thiết kế Database Schema (SQL) và tự động vẽ biểu đồ ERD (Mermaid).
-   **Agent 3 (Developer):** Viết mã nguồn (Controllers, Services, Routes) bám sát 100% theo Schema đã thiết kế.

### 2. 🛡️ Demo-Ready Mode (Càn quét mọi lỗi API)
Được thiết kế để **không bao giờ thất bại** khi trình diễn:
-   **Response Cache (MD5):** Mọi prompt duy nhất đều được băm (hash) và lưu cache nội bộ. Demo lại kết quả cũ là **tức thì (0ms)** và **không tốn API call**.
-   **8-Tier Cascading:** Tự động hạ cấp model khi gặp lỗi Quota (429) hoặc bận (503): `2.5 Pro` → `1.5 Pro` → `2.5 Flash` → `2.0 Flash` → `1.5 Flash` → `2.5 Lite` → `2.0 Lite` → `Local Mock`.
-   **Multi-Key Rotation:** Hỗ trợ cấu hình tối đa **10 API Key**. Nếu Key #1 hết hạn mức, hệ thống tự động nhảy sang Key #2 mà không làm gián đoạn tiến trình.

### 🎨 3. Giao Diện Premium (Zinc Design System)
-   **Aesthetics:** Phong cách tối giản (Minimalism) với tone màu Zinc/Indigo hiện đại.
-   **Iconography:** Sử dụng bộ icon SVG chuyên nghiệp từ **Lucide Icons** — loại bỏ hoàn toàn emoji "nhựa".
-   **Real-time Streaming:** Thanh tiến trình gradient chạy mượt mà kèm trạng thái chi tiết của từng Agent.

### 📦 4. Output ZIP Chất Lượng Cao
Dự án xuất ra là một **Starter Kit hoàn chỉnh**, không chỉ là code mẫu:
-   **Full CRUD Logic:** Triển khai đầy đủ logic nghiệp vụ, xử lý lỗi trung tâm.
-   **Transaction Support:** Lớp Service hỗ trợ **SQL Transactions** (BEGIN/COMMIT/ROLLBACK).
-   **Multi-Stack:** Tùy chọn linh hoạt giữa **Node.js (Express)** và **Python (Flask)**.
-   **Environment Ready:** Luôn đi kèm `.env.example`, `package.json` chuẩn và `README` hướng dẫn setup riêng.

---

## 🛠️ Hướng Dẫn Cài Đặt Chi Tiết

### 1. Yêu cầu hệ thống
-   **Node.js:** Phiên bản 18.x trở lên.
-   **Trình duyệt:** Chrome, Edge hoặc Brave (Khuyến nghị để render Mermaid tốt nhất).

### 2. Các bước cài đặt
1.  **Tải mã nguồn và cài đặt thư viện:**
    ```bash
    git clone https://github.com/dinhhao03/vibe-architect.git
    cd vibe-architect
    npm install
    ```

2.  **Cấu hình biến môi trường (.env):**
    Tạo file `.env` tại thư mục gốc và nhập API key từ [Google AI Studio](https://aistudio.google.com/):
    ```env
    PORT=3000
    
    # Key chính (Bắt buộc)
    GEMINI_API_KEY=your_key_here
    
    # Các key dự phòng (Tùy chọn - Giúp demo không bị gián đoạn)
    GEMINI_API_KEY_2=key_2
    GEMINI_API_KEY_3=key_3
    ```

3.  **Khởi chạy hệ thống:**
    ```bash
    npm run dev
    ```
    Truy cập tại địa chỉ: **[http://localhost:3000](http://localhost:3000)**

---

## 💡 Chiến Thuật Demo "Bất Bại" (Warm-up Cache)

Để buổi thuyết trình **mượt mà 100%** ngay cả khi mạng yếu hoặc API bị lỗi, hãy tận dụng tính năng **Response Cache**:

1.  **Trước buổi demo 1 đêm:** Mở server và chọn lần lượt các **Preset Template** (E-Commerce, Smart Home, Task Manager...).
2.  Nhấn **Generate** để AI chạy và lưu kết quả vào thư mục `.cache/`.
3.  **Khi demo thực tế:** Bạn chỉ cần chọn lại các Preset đó, kết quả sẽ hiện ra ngay lập tức mà không cần gọi API (0ms latency). Điều này sẽ gây ấn tượng cực mạnh về tốc độ xử lý của hệ thống!

---

## 🏗️ Cấu Trúc Dự Án (Core Folders)

-   `/backend`: Chứa Logic điều phối (Orchestrator), AI Client (Cascade & Rotation) và Factory sinh ZIP.
-   `/frontend`: Giao diện Workspace, xử lý luồng sự kiện SSE và Render Markdown/Mermaid.
-   `.cache`: Nơi lưu trữ các kết quả AI đã băm (hash).
-   `report.html`: Bản báo cáo Premium phục vụ thuyết trình.

---
**Học phần:** Chuyên đề Phát triển Phần mềm | **Sinh viên:** Đinh Hào
**Technology Stack:** Node.js, Express, @google/genai, Highlight.js, Mermaid.js, Lucide Icons.
