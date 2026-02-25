// services/claude.js
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { saveConversation } = require('./db'); // tu lógica de guardar conversaciones

// Inicializar Gemini
const genAI = new GoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Construye el prompt del sistema
function buildSystemPrompt(clientConfig) {
  return `Eres ${clientConfig.bot.name}, asistente virtual de ${clientConfig.business.name}. Responde de forma profesional y cercana.`;
}

// Función principal que procesa el mensaje
async function processMessage(userMessage, conversationHistory, clientConfig, sessionId) {
  try {
    const systemPrompt = buildSystemPrompt(clientConfig);

    // Convertimos el historial a formato Gemini
    const chatHistory = conversationHistory.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5', // estable
      systemInstruction: systemPrompt,
      generationConfig: { maxOutputTokens: 500, temperature: 0.7 }
    });

    const chat = model.startChat({ history: chatHistory });
    const result = await chat.sendMessage(userMessage);

    // Dependiendo de la versión de la librería
    const rawText = result.response?.text?.() || result.output_text || '';
    console.log('💬 Gemini raw response:', rawText);

    const updatedHistory = [
      ...conversationHistory,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: rawText }
    ];

    await saveConversation(sessionId, clientConfig.id, updatedHistory);

    return {
      response: rawText || 'Lo siento, no pude procesar tu mensaje.',
      messages: updatedHistory.slice(-20)
    };
  } catch (err) {
    console.error('❌ Error generando respuesta:', err.message);
    return {
      response: 'Lo siento, hubo un problema generando la respuesta.',
      messages: conversationHistory
    };
  }
}

module.exports = { processMessage };
