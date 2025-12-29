import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";

let client: GoogleGenAI | null = null;
let model: any | null = null; // Typing 'any' for now to avoid specific version issues, or use proper type if available

export const getGeminiModel = (): any => {
  if (!apiKey) {
    console.warn("NEXT_PUBLIC_GEMINI_API_KEY is not set");
  }

  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  
  // Using the model specific to the user request or default
  // The SDK usage in the sample was: client.models.generateContent
  // But standard way is client.getGenerativeModel usually.
  // The sample code used: const ai = new GoogleGenAI(...) then ai.models.generateContent used slightly different API than standard web SDK?
  // Let's check sample code again carefully.
  // Sample: import { GoogleGenAI } from "@google/genai"; const ai = new GoogleGenAI({ ... }); ai.models.generateContent(...)
  // This looks like the new Google Gen AI SDK (v1.x?).
  
  return client;
};

export const generateContent = async (prompt: string, history: any[] = []): Promise<string> => {
    const ai = getGeminiModel();
    // Start Chat or just generate? 
    // Sample used ai.models.generateContent({ contents: chatHistory ... })
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [...history, { role: "user", parts: [{ text: prompt }] }]
        });
        
        return response.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error("Gemini API Error:", error);
        throw error;
    }
}
