# Vibe Architect

Vibe Architect là một ứng dụng web hỗ trợ biến mô tả dự án backend bằng ngôn ngữ tự nhiên thành bộ artifact khởi tạo dự án, gồm SRS, ERD, DBML, SQL schema, README và mã nguồn backend scaffold. Hệ thống được xây dựng theo hướng multi-agent pipeline để tách riêng ba giai đoạn chính: phân tích yêu cầu, thiết kế dữ liệu và sinh mã backend.

## Mục tiêu dự án

Dự án phục vụ ba mục tiêu chính:

- Minh họa mối liên hệ giữa phân tích yêu cầu, thiết kế dữ liệu và hiện thực backend trong một luồng liền mạch.
- Tạo công cụ demo/học tập cho môn học liên quan đến yêu cầu phần mềm, kiến trúc phần mềm và quy trình phát triển.
- Rút ngắn thời gian dựng skeleton backend cho các bài tập, đồ án nhỏ và các buổi thuyết trình.

## Tính năng hiện có

- Nhập mô tả dự án bằng tiếng Việt hoặc tiếng Anh.
- Chọn backend stack: `Node.js + Express` hoặc `Python + Flask`.
- Chạy pipeline nhiều pha qua SSE để theo dõi tiến trình theo thời gian thực.
- Sinh và hiển thị trực tiếp các artifact:
  - SRS/User Stories
  - ERD Mermaid
  - DBML
  - SQL schema PostgreSQL
  - Backend scaffold code
  - README cho project đầu ra
- Tải từng artifact riêng lẻ hoặc tải toàn bộ project dưới dạng ZIP.
- Lưu lịch sử các phiên đã chạy ở phía client để khôi phục nhanh.
- Hỗ trợ light/dark theme và giao diện landing/workspace đồng bộ.
- Có mock fallback khi không có API key hoặc khi toàn bộ chuỗi model/key bị lỗi.
- Có cache cho phản hồi AI thật để giảm số lần gọi API lặp lại.

## Kiến trúc tổng quan

Pipeline hiện tại gồm 3 agent nghiệp vụ và 1 lớp đóng gói artifact:

1. `AnalystAgent`
   - Nhận mô tả dự án và stack yêu cầu.
   - Sinh `projectName`, `projectOverview`, `userStories`, `isFlask`.

2. `ArchitectAgent`
   - Nhận SRS từ Analyst.
   - Sinh `db_structure`, `dbml`, `sql`.

3. `DeveloperAgent`
   - Nhận SRS và SQL/ERD từ Architect.
   - Sinh mã backend theo stack đã chọn cùng README cho project đầu ra.

4. `ScaffoldFactory`
   - Kiểm tra tính đầy đủ của dữ liệu trung gian.
   - Đóng gói tài liệu và source code thành file ZIP trong thư mục `downloads/`.

Luồng chạy chính:

`Prompt -> Analyst -> Architect -> Developer -> ZIP Export`

## Cấu trúc thư mục

```text
vibe-architect/
|-- backend/
|   |-- agents/
|   |   |-- AnalystAgent.js
|   |   |-- ArchitectAgent.js
|   |   `-- DeveloperAgent.js
|   |-- controllers/
|   |   `-- OrchestratorController.js
|   |-- services/
|   |   |-- AIClient.js
|   |   `-- ScaffoldFactory.js
|   `-- server.js
|-- frontend/
|   |-- index.html
|   |-- style.css
|   `-- app.js
|-- docs/
|   |-- Vibe-Architect-Midterm-Report.md
|   `-- demo-script-7-minutes.html
|-- scripts/
|   |-- generate-report-docx.js
|   `-- generate-report-docx-fixed.js
|-- downloads/
|-- .cache/
|-- report.html
|-- README.md
|-- package.json
`-- .env
```

## Công nghệ sử dụng

### Backend

- Node.js
- Express
- `@google/genai`
- `archiver`
- `dotenv`
- `cors`

### Frontend

- HTML/CSS/JavaScript thuần
- Mermaid.js
- Marked.js
- Highlight.js
- Lucide Icons

### Hạ tầng phát triển

- Git / GitHub
- Local filesystem cache
- ZIP export để đóng gói artifact đầu ra

## Yêu cầu môi trường

- Node.js 18 trở lên
- npm 9 trở lên
- Một Gemini API key hợp lệ nếu muốn chạy live AI mode

## Cài đặt và chạy dự án

### 1. Cài dependency

```bash
npm install
```

### 2. Tạo file `.env`

Ví dụ:

```env
PORT=3000
CORS_ORIGIN=http://localhost:3000
GEMINI_API_KEY=your_primary_key
GEMINI_API_KEY_2=your_secondary_key_optional
GEMINI_API_KEY_3=your_third_key_optional
```

Ghi chú:

- Có thể cấu hình tối đa 10 key theo dạng `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, ..., `GEMINI_API_KEY_10`.
- Nếu không có key, hệ thống sẽ chạy mock mode.

### 3. Chạy ứng dụng

```bash
npm start
```

Hoặc:

```bash
npm run dev
```

Mở trình duyệt tại:

```text
http://localhost:3000
```

### 4. Dừng ứng dụng

- Nhấn `Ctrl + C` trong terminal đang chạy server.
- Server đã hỗ trợ graceful shutdown với `SIGINT` và `SIGTERM`.

## Cách sử dụng

1. Mở landing page và chọn `Bắt đầu thiết kế`.
2. Chọn preset hoặc nhập mô tả dự án tại `Project Description`.
3. Chọn backend stack.
4. Nhấn `Generate Pipeline`.
5. Theo dõi tiến trình của Analyst, Architect, Developer, Validator.
6. Kiểm tra kết quả ở các tab `SRS`, `ERD`, `SQL`, `DBML`, `Code`, `README`.
7. Tải từng tab hoặc export toàn bộ ZIP.

## API và route chính

### HTTP routes của ứng dụng hiện tại

| Method | Route | Mục đích |
|---|---|---|
| `GET` | `/api/generate` | Chạy pipeline bằng SSE |
| `GET` | `/api/download` | Tải file ZIP đã sinh |
| `GET` | `/report` | Mở báo cáo HTML |
| `GET` | `/*` | Trả về frontend app |

### SSE events từ pipeline

- `progress`
- `warning`
- `srs_ready`
- `db_ready`
- `backend_ready`
- `complete`
- `error`

## Cơ chế AI và fallback

`AIClient` hiện đang hỗ trợ:

- Model cascade nhiều tầng:
  - Gemini 2.5 Pro
  - Gemini 1.5 Pro
  - Gemini 2.5 Flash
  - Gemini 2.0 Flash
  - Gemini 1.5 Flash
  - Gemini 2.5 Flash Lite
  - Gemini 2.0 Flash Lite
- Retry khi gặp lỗi quota/tạm thời.
- Rotation qua nhiều API key.
- Cache phản hồi AI thật trong `.cache/` với TTL 24 giờ.
- Mock fallback nếu không còn model/key khả dụng.

## Artifact đầu ra

Mỗi lần chạy thành công, hệ thống có thể sinh:

- `docs/SRS.md`
- `docs/ERD.mmd`
- `docs/database.dbml`
- `database/schema.sql`
- `README.md` cho project đầu ra
- Source backend scaffold theo Express hoặc Flask
- `.env.example`, `.gitignore`, `package.json` hoặc `requirements.txt`

## Hạn chế hiện tại

- Chất lượng đầu ra vẫn phụ thuộc vào độ rõ ràng của prompt đầu vào.
- Chưa có bộ test tự động bao phủ toàn bộ pipeline.
- Chưa có cơ chế xác thực người dùng hoặc persistence lịch sử ở server.
- Chưa có bước chạy thử project scaffold được sinh ra để xác minh end-to-end.
- Một số chuỗi tiếng Việt trong code backend cũ còn lỗi encoding; điều này không ảnh hưởng đến luồng chạy chính nhưng nên tiếp tục dọn dẹp nếu phát triển lâu dài.

## Hướng phát triển tiếp theo

- Thêm test tự động cho controller/service/frontend state.
- Thêm validation và schema kiểm thử mạnh hơn cho output AI.
- Thêm traceability giữa user stories, schema và file code đầu ra.
- Thêm nhiều stack backend hơn.
- Tạo chế độ preview project output chi tiết hơn trước khi export ZIP.

## Tài liệu đi kèm

- Báo cáo markdown: [docs/Vibe-Architect-Midterm-Report.md](docs/Vibe-Architect-Midterm-Report.md)
- Kịch bản demo: [docs/demo-script-7-minutes.html](docs/demo-script-7-minutes.html)

## Đề xuất khi đẩy GitHub

Nên đưa lên GitHub:

- `backend/`
- `frontend/`
- `docs/` (trừ file nặng hoặc file sinh tự động không cần thiết)
- `scripts/`
- `README.md`
- `package.json`
- `package-lock.json`
- `.gitignore`
- `LICENSE`

Không nên public:

- `.env`
- `.cache/`
- `downloads/`
- API keys hoặc bất kỳ secret nào
- file ZIP export sinh ra trong quá trình chạy

Nếu repo dùng cho nộp bài học phần, có thể giữ thêm các file báo cáo `.docx` hoặc `.html` nếu giảng viên yêu cầu. Nếu repo dùng public portfolio, nên ưu tiên giữ bản Markdown/PDF sạch và loại bớt file nặng trùng lặp.
