const { GoogleGenAI } = require('@google/genai');
const dotenv = require('dotenv');
dotenv.config();

class AIClient {
    constructor() {
        if (!AIClient.instance) {
            this.apiKey = process.env.GEMINI_API_KEY;
            if (this.apiKey && this.apiKey !== '') {
                this.ai = new GoogleGenAI({ apiKey: this.apiKey });
            } else {
                console.log("No GEMINI_API_KEY found, running in MOCK mode.");
                this.isMock = true;
            }
            AIClient.instance = this;
        }
        return AIClient.instance;
    }

    async generate(prompt, systemInstruction = '', responseSchema = null, retries = 3) {
        try {
            if (this.isMock) {
                await new Promise(resolve => setTimeout(resolve, 2500)); // Giả lập AI call
                if (systemInstruction.includes("Analyst")) {
                    return {
                        projectOverview: "Dự án Demo (MOCK). Đây là dữ liệu cứng do bạn không có Internet hoặc hỏng File .env. Chức năng chính: Đặt món, Tính tiền.",
                        userStories: [
                            { id: "FR-01", title: "Khách Đặt món", story: "Là khách hàng, tôi muốn đặt món ăn." },
                            { id: "FR-02", title: "Thu ngân Tính tiền", story: "Là thu ngân, tôi muốn tính tiền." }
                        ]
                    };
                } else if (systemInstruction.includes("Architect")) {
                    return {
                        erd: 'erDiagram\n  Users {\n    int id PK\n    string username\n    string password_hash\n    string role\n  }\n  Restaurants {\n    int id PK\n    string name\n    string address\n  }\n  Categories {\n    int id PK\n    string name\n  }\n  MenuItems {\n    int id PK\n    string name\n    float price\n    int category_id FK\n    int restaurant_id FK\n  }\n  Orders {\n    int id PK\n    int user_id FK\n    int restaurant_id FK\n    float total_price\n    string status\n  }\n  OrderItems {\n    int id PK\n    int order_id FK\n    int menu_item_id FK\n    int quantity\n  }\n  Users ||--o{ Orders : "places"\n  Restaurants ||--o{ MenuItems : "offers"\n  Categories ||--o{ MenuItems : "contains"\n  Restaurants ||--o{ Orders : "receives"\n  Orders ||--o{ OrderItems : "includes"\n  MenuItems ||--o{ OrderItems : "ordered_in"',
                        sql: 'CREATE TABLE Users (id SERIAL PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, role VARCHAR(20));\nCREATE TABLE Restaurants (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, address TEXT);\nCREATE TABLE Categories (id SERIAL PRIMARY KEY, name VARCHAR(50) NOT NULL);\nCREATE TABLE MenuItems (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, price DECIMAL(10,2) NOT NULL, category_id INT REFERENCES Categories(id), restaurant_id INT REFERENCES Restaurants(id));\nCREATE TABLE Orders (id SERIAL PRIMARY KEY, user_id INT REFERENCES Users(id), restaurant_id INT REFERENCES Restaurants(id), total_price DECIMAL(10,2), status VARCHAR(20) DEFAULT \'PENDING\');\nCREATE TABLE OrderItems (id SERIAL PRIMARY KEY, order_id INT REFERENCES Orders(id) ON DELETE CASCADE, menu_item_id INT REFERENCES MenuItems(id), quantity INT NOT NULL);'
                    };
                } else if (systemInstruction.includes("Developer")) {
                    return {
                        readme: "# Server API Setup\n\n1. `npm install`\n2. `npm start`\n",
                        controllerCode: "const AppService = require('../services/AppService');\n\nclass AppController {\n  static async index(req, res) {\n    res.json({ message: 'Mock API Loaded' });\n  }\n}\nmodule.exports = AppController;",
                        serviceCode: "class AppService {\n  static handleLogic() { return true; }\n}\nmodule.exports = AppService;",
                        routeCode: "const express = require('express');\nconst AppController = require('../controllers/AppController');\nconst router = express.Router();\n\nrouter.get('/dashboard', AppController.index);\n\nmodule.exports = router;"
                    };
                }
            }

            const config = {};
            if (systemInstruction) config.systemInstruction = systemInstruction;
            if (responseSchema) {
                config.responseMimeType = "application/json";
                config.responseSchema = responseSchema;
            }

            let lastError;
            for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                    const response = await this.ai.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: prompt,
                        config: config
                    });
                    if (responseSchema) return JSON.parse(response.text);
                    return response.text;
                } catch (e) {
                    lastError = e;
                    const errString = String(e.message || e);
                    console.log(`[AIClient] Attempt ${attempt} failed: ${errString}`);
                    // Kiểm tra lỗi 503 Quá tải
                    if (e.status === 503 || errString.includes('503') || errString.includes('high demand') || errString.includes('UNAVAILABLE')) {
                        if (attempt < retries) {
                            console.log(`[AIClient] Retrying in ${attempt * 3} seconds due to 503...`);
                            await new Promise(res => setTimeout(res, attempt * 3000));
                        }
                    } else {
                        break; // Nếu lỗi khác (như key sai) thì thoát vòng lặp ngay
                    }
                }
            }
            
            // Xử lý throw error rõ ràng cho người dùng
            const finalErrStr = String(lastError.message || lastError);
            if (finalErrStr.includes('503') || finalErrStr.includes('high demand')) {
                throw new Error("Lỗi Server Gemini (503): Máy chủ AI đang cực kỳ quá tải ngay lúc này. Hệ thống Architect đã cố kết nối lại nhiều lần nhưng không thành công. Hãy nghỉ ngơi lấy cốc nước rồi thử lại nhé!");
            }
            throw lastError;
            
        } catch (error) {
            console.error("AI Generate Fatal Error:", error);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new AIClient();
