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
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => resolve(outputPath));
            archive.on('error', (err) => reject(err));
            archive.pipe(output);

            const srsJSON = projectData.srs;
            let userStoriesContent = "";
            if (srsJSON.userStories && Array.isArray(srsJSON.userStories)) {
                userStoriesContent = srsJSON.userStories.map(us => `### ${us.id} - ${us.title}\n${us.story}`).join('\n\n');
            }
            const srsMarkdown = `# TÀI LIỆU YÊU CẦU PHẦN MỀM (SRS)\n\n## 1. Project Overview\n${srsJSON.projectOverview}\n\n## 2. User Stories\n${userStoriesContent}`;

            // 1. Documentation
            archive.append(srsMarkdown, { name: 'docs/SRS.md' });
            archive.append(projectData.erd, { name: 'docs/ERD.mmd' });
            archive.append(projectData.sql, { name: 'database/schema.sql' });

            const backend = projectData.backend;
            archive.append(backend.readme || "# Vibe-Architect Generated App", { name: 'README.md' });

            const cleanCode = (code) => {
                if (!code) return "# Empty block";
                return code.replace(/```python/g, '').replace(/```javascript/g, '').replace(/```/g, '').trim();
            };

            const isFlask = projectData.techStack.includes('Flask') || projectData.techStack.includes('Python');

            if (isFlask) {
                // ===== PYTHON FLASK STRUCTURE =====
                archive.append("__pycache__/\n*.pyc\n.env\nvenv/\n*.zip\ndownloads/", { name: '.gitignore' });
                archive.append(cleanCode(backend.runCode), { name: 'run.py' });
                archive.append(cleanCode(backend.initCode), { name: 'app/__init__.py' });
                archive.append(cleanCode(backend.configCode || ""), { name: 'app/config.py' });

                // Dynamic Flask MVC arrays
                if (Array.isArray(backend.controllers)) {
                    backend.controllers.forEach(c => {
                        archive.append(cleanCode(c.code), { name: `app/controllers/${c.filename}` });
                    });
                }
                if (Array.isArray(backend.services)) {
                    backend.services.forEach(s => {
                        archive.append(cleanCode(s.code), { name: `app/services/${s.filename}` });
                    });
                }
                if (Array.isArray(backend.routes)) {
                    backend.routes.forEach(r => {
                        archive.append(cleanCode(r.code), { name: `app/routes/${r.filename}` });
                    });
                }

                // __init__.py files for Python packages
                archive.append("", { name: 'app/controllers/__init__.py' });
                archive.append("", { name: 'app/services/__init__.py' });
                archive.append("", { name: 'app/routes/__init__.py' });

                // requirements.txt
                let deps = ["flask", "flask-cors", "python-dotenv"];
                if (Array.isArray(backend.dependencies)) {
                    backend.dependencies.forEach(d => {
                        if (d && !deps.includes(d.toLowerCase())) deps.push(d);
                    });
                }
                archive.append(deps.join('\n'), { name: 'requirements.txt' });

                // .env.example
                archive.append("SECRET_KEY=your-secret-key\nDATABASE_URL=sqlite:///app.db\nFLASK_ENV=development\nFLASK_DEBUG=1", { name: '.env.example' });

            } else {
                // ===== NODE.JS EXPRESS STRUCTURE =====
                archive.append("node_modules/\n.env\n*.zip\ndownloads/", { name: '.gitignore' });
                archive.append(cleanCode(backend.dbCode), { name: 'src/db.js' });
                archive.append(cleanCode(backend.appCode), { name: 'src/app.js' });
                archive.append(cleanCode(backend.serverCode), { name: 'src/server.js' });

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

                let depObj = { "express": "^4.18.2", "dotenv": "^16.0.3" };
                if (Array.isArray(backend.dependencies)) {
                    backend.dependencies.forEach(d => {
                        if (d && !depObj[d]) depObj[d] = "latest";
                    });
                }
                const packageJson = {
                    name: (srsJSON.projectName || "ai-generated-backend").toLowerCase().replace(/[^a-z0-9\-]/g, '-'),
                    version: "1.0.0",
                    description: `Backend API generated by Vibe Architect for ${srsJSON.projectName || 'project'}`,
                    main: "src/server.js",
                    scripts: {
                        start: "node src/server.js",
                        dev: "node --watch src/server.js"
                    },
                    dependencies: depObj
                };
                archive.append(JSON.stringify(packageJson, null, 2), { name: 'package.json' });

                // .env.example
                archive.append("PORT=3000\nDATABASE_URL=postgresql://postgres:password@localhost:5432/mydb\nNODE_ENV=development", { name: '.env.example' });
            }

            archive.finalize();
        });
    }
}

module.exports = ScaffoldFactory;
