const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const orchestratorRoutes = require('./controllers/OrchestratorController');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api', orchestratorRoutes);

// Serve report
app.get('/report', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../report.html'));
});

app.listen(port, () => {
    console.log(`Vibe-Architect Server running at http://localhost:${port}`);
});
