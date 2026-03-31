const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

class ScaffoldFactory {
    static async createProjectZip(projectData) {
        const timestamp = Date.now();
        const outputFilename = `vibe-architect-${timestamp}.zip`;
        const outputPath = path.join(__dirname, '../../', outputFilename);
        
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

            // 3. Tech Stack Boilerplate (Factory Pattern concept)
            if (projectData.techStack === 'Node.js') {
                archive.append(`node_modules/\n.env\n*.zip`, { name: '.gitignore' });
                
                const repoCode = `class BaseRepository {
  constructor(model) { this.model = model; }
  async findAll() { return await this.model.findMany(); }
  async findById(id) { return await this.model.findById(id); }
}
module.exports = BaseRepository;`;
                archive.append(repoCode, { name: 'src/repositories/BaseRepository.js' });
                
            } else if (projectData.techStack === 'Python') {
                archive.append(`__pycache__/\nvenv/\n.env`, { name: '.gitignore' });
                
                const repoCode = `class BaseRepository:
    def __init__(self, model):
        self.model = model
    def get_all(self):
        return self.model.objects.all()`;
                archive.append(repoCode, { name: 'src/repositories/base_repository.py' });
            }

            archive.finalize();
        });
    }
}

module.exports = ScaffoldFactory;
