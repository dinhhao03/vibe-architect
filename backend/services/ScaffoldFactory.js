const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

class ScaffoldFactory {
    static async createProjectZip(projectData) {
        const timestamp = Date.now();
        const outputFilename = `vibe-architect-${timestamp}.zip`;
        const outputPath = path.resolve(process.cwd(), 'downloads', outputFilename);
        
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(outputPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => {
                resolve(outputPath);
            });

            archive.on('warning', function(err) {
                if (err.code === 'ENOENT') {
                    console.warn(err);
                } else {
                    reject(err);
                }
            });

            archive.on('error', function(err) {
                reject(err);
            });

            archive.pipe(output);

            // 1. Tạo file yêu cầu (SRS)
            let srsMarkdown = `# TÀI LIỆU YÊU CẦU: ${projectData.srs.projectName}\n\n`;
            srsMarkdown += `## Mô tả\n${projectData.srs.description}\n\n`;
            srsMarkdown += `## User Stories (INVEST & GWT)\n`;
            projectData.srs.userStories.forEach(s => {
                srsMarkdown += `### ${s.id}: ${s.title}\n**Story:** ${s.story}\n\n**Acceptance Criteria:**\n`;
                if(s.acceptanceCriteria) {
                    s.acceptanceCriteria.forEach(ac => {
                        srsMarkdown += `- ${ac}\n`;
                    });
                }
                srsMarkdown += '\n';
            });
            archive.append(srsMarkdown, { name: 'docs/SRS.md' });

            // 2. ERD & SQL
            archive.append(projectData.erd, { name: 'docs/ERD.txt' });
            archive.append(projectData.sql, { name: 'database/schema.sql' });

            // 3. Tech Stack Boilerplate (Factory Pattern concept & Chuyên Nghiệp 10đ)
            if (projectData.techStack.includes('Node.js')) {
                archive.append(`node_modules/\n.env\n*.zip`, { name: '.gitignore' });
                
                const repoCode = `class BaseRepository {\n  constructor(model) { this.model = model; }\n  async findAll() { return await this.model.findMany(); }\n  async findById(id) { return await this.model.findById(id); }\n}\nmodule.exports = BaseRepository;`;
                archive.append(repoCode, { name: 'src/repositories/BaseRepository.js' });
                
                const controllerCode = `class AppController {\n  static async getDashboard(req, res) {\n    res.json({ status: 'success', system: 'Architect Scaffold' });\n  }\n}\nmodule.exports = AppController;`;
                archive.append(controllerCode, { name: 'src/controllers/AppController.js' });
                
                archive.append(`const express = require('express');\nconst app = express();\nrequire('dotenv').config();\napp.listen(3000, () => console.log('Server Ready'));`, { name: 'src/server.js' });
                
                archive.append(`{\n  "name": "ai-generated-app",\n  "version": "1.0.0",\n  "main": "src/server.js",\n  "dependencies": {\n    "express": "^4.18.2",\n    "dotenv": "^16.0.3"\n  }\n}`, { name: 'package.json' });
                
            } else if (projectData.techStack.includes('Python')) {
                archive.append(`__pycache__/\nvenv/\n.env`, { name: '.gitignore' });
                
                const repoCode = `class BaseRepository:\n    def __init__(self, model):\n        self.model = model\n    def get_all(self):\n        return self.model.objects.all()`;
                archive.append(repoCode, { name: 'src/repositories/base_repository.py' });
                
                archive.append(`def create_app():\n    print("Starting Django/FastAPI Scaffold")\n    return application`, { name: 'src/main.py' });
                archive.append(`fastapi==0.95.0\nuvicorn==0.21.1\npydantic==1.10.7`, { name: 'requirements.txt' });
            }

            archive.finalize();
        });
    }
}

module.exports = ScaffoldFactory;
