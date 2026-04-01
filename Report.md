# BÁO CÁO DỰ ÁN GIỮA KỲ
**Đề tài:** Vibe-Architect — Local AI Scaffolding Engine (Agentic Workflow)
**Phiên bản:** v2.1 Elite Edition

> Xem bản trình bày đầy đủ (HTML/PDF): Mở file `report.html` hoặc truy cập `http://localhost:3000/report`

---

## Chương 1: Giới thiệu đề tài

### 1.1 Bối cảnh
Giai đoạn scaffolding (khởi tạo cấu trúc dự án) chiếm 20–30% thời gian phát triển MVP. Các giải pháp AI hiện tại (ChatGPT, Copilot) hoạt động theo mô hình single-shot, dễ gây hallucination và thiếu nhất quán giữa database schema và logic code.

### 1.2 Mục tiêu
1. Tự động hóa scaffolding bằng AI Agentic Workflow (Multi-Agent Pipeline).
2. Đảm bảo 100% uptime với Cascading LLM + Response Cache.
3. Hỗ trợ đa nền tảng: Node.js (Express) và Python (Flask).

### 1.3 Phạm vi
Hệ thống chạy trên localhost, nhận prompt → xuất ra ZIP chứa mã nguồn MVC, SRS, ERD, SQL Schema.

---

## Chương 2: Phân tích và thiết kế

### 2.1 Multi-Agent Pipeline
| Agent | Vai trò | Đầu vào | Đầu ra |
|:---|:---|:---|:---|
| Agent 1 (Analyst) | Phân tích nghiệp vụ | Prompt | SRS, User Stories |
| Agent 2 (Architect) | Thiết kế database | SRS | SQL DDL, ERD Mermaid |
| Agent 3 (Developer) | Viết mã nguồn MVC | SRS + SQL | Controllers, Services, Routes |

### 2.2 Cascading LLM (8 Tầng)
`2.5 Pro → 1.5 Pro → 2.5 Flash → 2.0 Flash → 1.5 Flash → 2.5 Lite → 2.0 Lite → Local Mock`

### 2.3 Response Cache & Multi-Key Rotation
- **Cache:** MD5 hash prompt → lưu `.cache/` → 0ms khi demo lại.
- **Key Rotation:** Hỗ trợ tối đa 10 API key luân phiên.

---

## Chương 3: Công nghệ sử dụng
- **Backend:** Node.js, Express.js, @google/genai, Archiver, dotenv, cors
- **Frontend:** Vanilla HTML/CSS/JS, Mermaid.js, Highlight.js, Marked.js, Lucide Icons
- **AI:** Google Gemini API (7 model + Local Mock), SSE streaming

---

## Chương 4: Cách thực hiện
- **OrchestratorController:** Điều phối pipeline 3 Agent qua SSE.
- **AIClient:** Cascading logic + MD5 Cache + Key Rotation.
- **ScaffoldFactory:** Đóng gói ZIP động cho cả Node.js và Flask.
- **Frontend:** Zinc Dark Premium UI, Multi-Tab Preview, Progress Tracker.

---

## Chương 5: Kết quả đạt được
| Test Case | Kết quả |
|:---|:---|
| SSE Streaming | ✅ PASSED |
| Context Sharing (Agent Chain) | ✅ PASSED |
| Cascading LLM (429/503/404) | ✅ PASSED |
| Response Cache (0ms) | ✅ PASSED |
| Multi-Key Rotation | ✅ PASSED |
| Validation Fallback | ✅ PASSED |
| ZIP Quality (MVC chuẩn) | ✅ PASSED |
| Multi-Stack (Node/Flask) | ✅ PASSED |

---

## Chương 6: Kết luận
Vibe-Architect v2.1 đạt toàn bộ mục tiêu đề ra: AI Scaffolding Engine ổn định, mã nguồn chất lượng cao, 100% uptime. Hướng phát triển: thêm Django/Spring Boot, Custom Templates, Unit Test Generation, Docker Integration.

---
**Sinh viên:** Đinh Hào | **Học phần:** Chuyên đề Phát triển Phần mềm | **Năm:** 2026
