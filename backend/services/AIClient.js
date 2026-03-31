const { GoogleGenAI } = require('@google/genai');
const dotenv = require('dotenv');
dotenv.config();

class AIClient {
    constructor() {
        if (!AIClient.instance) {
            this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            AIClient.instance = this;
        }
        return AIClient.instance;
    }

    async generate(prompt, systemInstruction = '', responseSchema = null) {
        try {
            const config = {};
            if (systemInstruction) {
                config.systemInstruction = systemInstruction;
            }
            if (responseSchema) {
                config.responseMimeType = "application/json";
                config.responseSchema = responseSchema;
            }

            const response = await this.ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: config
            });
            
            if (responseSchema) {
                return JSON.parse(response.text());
            }
            return response.text();
            
        } catch (error) {
            console.error("AI Generate Error:", error);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new AIClient();
