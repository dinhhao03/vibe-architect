const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

class ScaffoldFactory {
    static async createProjectZip(projectData) {
        const timestamp = Date.now();
        const outputFilename = `vibe-architect-${timestamp}.zip`;
        // Root path đảm bảo an toàn cho mọi HDH vì lấy từ thư mục chạy lệnh
        const outputPath = path.resolve(process.cwd(), 'downloads', outputFilename);
        
        // Đảm bảo thư mục downloads tồn tại
        if (!fs.existsSync(path.dirname(outputPath))) {
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        }

        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(outputPath);
            const archive = archiver('zip', {
                zlib: { level: 9 } // Độ nén max
            });

            output.on('close', () => {
                resolve(outputPath);
            });

            archive.on('error', (err) => {
                reject(err);
            });

            // Gắn pipe luồng đệm vào luồng file
            archive.pipe(output);

            const srsJSON = projectData.srs;
            let userStoriesContent = "";
            if (srsJSON.userStories && Array.isArray(srsJSON.userStories)) {
                userStoriesContent = srsJSON.userStories.map(us => `### ${us.id} - ${us.title}\n${us.story}`).join('\n\n');
            }

            const srsMarkdown = `# TÀI LIỆU YÊU CẦU PHẦN MỀM (SRS)\n\n## 1. Project Overview\n${srsJSON.projectOverview}\n\n## 2. User Stories\n${userStoriesContent}`;

            // 1. Thư mục Tài liệu Đặc tả
            archive.append(srsMarkdown, { name: 'docs/SRS.md' });
            archive.append(projectData.erd, { name: 'docs/ERD.mmd' });
            archive.append(projectData.sql, { name: 'database/schema.sql' });
            
            // 2. Data động từ Agent 3 (Backend Developer)
            const backend = projectData.backend;
            archive.append(backend.readme || "# Vibe-Architect Dynamic App\nĐược gen bởi AI.", { name: 'README.md' });
            
            // Xóa markup rác do lỗi JSON parse để lại nếu AI trả lỗi nhẹ
            const cleanCode = (code) => {
                if(!code) return "// Empty block";
                return code.replace(/```javascript/g, '').replace(/```/g, '').trim();
            }

            // 3. Render khung MVC
            if (projectData.techStack.includes('Node.js')) {
                // Ignore configs
                archive.append(`node_modules/\n.env\n*.zip\n/downloads/`, { name: '.gitignore' });
                
                // Static Base Pattern code
                const repoCode = `class BaseRepository {\n  constructor(model) { this.model = model; }\n  async findAll() { return await this.model.findMany(); }\n  async findById(id) { return await this.model.findById(id); }\n}\nmodule.exports = BaseRepository;`;
                archive.append(repoCode, { name: 'src/repositories/BaseRepository.js' });
                
                // Dynamic AI code
                archive.append(cleanCode(backend.controllerCode), { name: 'src/controllers/AppController.js' });
                archive.append(cleanCode(backend.routeCode), { name: 'src/routes/ApiRoute.js' });
                archive.append(cleanCode(backend.serviceCode), { name: 'src/services/AppService.js' });
                
                // Bọc Entry Point (Express server)
                const entryCode = `const express = require('express');\nconst apiRoute = require('./routes/ApiRoute');\n\nconst app = express();\napp.use(express.json());\napp.use('/api', apiRoute);\n\nconst PORT = process.env.PORT || 3000;\napp.listen(PORT, () => {\n  console.log('App is live on http://localhost:' + PORT);\n});`;
                archive.append(entryCode, { name: 'src/server.js' });
                
                // Bọc NPM package
                const packageJson = `{\n  "name": "ai-generated-backend",\n  "version": "1.0.0",\n  "main": "src/server.js",\n  "scripts": {\n    "start": "node src/server.js"\n  },\n  "dependencies": {\n    "express": "^4.18.2",\n    "dotenv": "^16.0.3"\n  }\n}`;
                archive.append(packageJson, { name: 'package.json' });
            }

            archive.finalize();
        });
    }
}

module.exports = ScaffoldFactory;
