const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

class ScaffoldFactory {
    static async createProjectZip(projectData) {
        const timestamp = Date.now();
        const outputFilename = `vibe-architect-${timestamp}.zip`;
        const outputPath = path.resolve(process.cwd(), 'downloads', outputFilename);
        
        if (!fs.existsSync(path.dirname(outputPath))) {
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        }

        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(outputPath);
            const archive = archiver('zip', {
                zlib: { level: 9 }
            });

            output.on('close', () => resolve(outputPath));
            archive.on('error', (err) => reject(err));
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
            archive.append(backend.readme || "# Vibe-Architect Generated App", { name: 'README.md' });
            archive.append(`node_modules/\n.env\n*.zip\n/downloads/`, { name: '.gitignore' });

            const cleanCode = (code) => {
                if(!code) return "// Empty block";
                return code.replace(/```javascript/g, '').replace(/```/g, '').trim();
            }

            if (projectData.techStack.includes('Node.js')) {
                // Core Files
                archive.append(cleanCode(backend.dbCode), { name: 'src/db.js' });
                archive.append(cleanCode(backend.appCode), { name: 'src/app.js' });
                archive.append(cleanCode(backend.serverCode), { name: 'src/server.js' });

                // Dynamic MVC Files Array
                if (Array.isArray(backend.controllers)) {
                    backend.controllers.forEach(c => {
                        archive.append(cleanCode(c.code), { name: `src/controllers/${c.filename}` });
                    });
                }
                if (Array.isArray(backend.services)) {
                    backend.services.forEach(s => {
                        archive.append(cleanCode(s.code), { name: `src/services/${s.filename}` });
                    });
                }
                if (Array.isArray(backend.routes)) {
                    backend.routes.forEach(r => {
                        archive.append(cleanCode(r.code), { name: `src/routes/${r.filename}` });
                    });
                }
                
                // Npm package dependencies builder
                let depObj = { "express": "^4.18.2", "dotenv": "^16.0.3" };
                if(Array.isArray(backend.dependencies)) {
                    backend.dependencies.forEach(d => {
                        if(d && !depObj[d]) depObj[d] = "latest";
                    });
                }
                const packageJson = {
                    name: (srsJSON.projectName || "ai-generated-backend").toLowerCase().replace(/[^a-z0-9\-]/g, '-'),
                    version: "1.0.0",
                    main: "src/server.js",
                    scripts: { start: "node src/server.js" },
                    dependencies: depObj
                };
                archive.append(JSON.stringify(packageJson, null, 2), { name: 'package.json' });
            }

            archive.finalize();
        });
    }
}

module.exports = ScaffoldFactory;
