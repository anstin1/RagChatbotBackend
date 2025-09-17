const { GoogleGenerativeAI } = require('@google/generative-ai');
const { withTimeout } = require('../lib/timeout');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = process.env.GEMINI_API_KEY ? genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }) : null;

async function generateAnswer(query, passages) {
  const context = passages.map(p => `Title: ${p.title}\nContent: ${p.content}\nURL: ${p.url}`).join('\n\n');
  const prompt = `Based on the following news articles, please answer the user's question. If the information is not available in the provided articles, please say so.\n\nContext:\n${context}\n\nQuestion: ${query}\n\nPlease provide a comprehensive answer based on the available information and cite relevant sources when possible.`;
  if (!model) {
    return `No LLM key configured. Here's what I found based on retrieval:\n\n${context}`;
  }
  const llmCall = (async () => {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (err) {
      // Log detailed error on the server to aid debugging
      console.error('LLM call failed:', err?.response?.error || err?.message || err);
      const base = `LLM unavailable. Here's retrieved context instead:\n\n${context}`;
      // In non-production, surface brief error detail to the client
      if ((process.env.NODE_ENV || 'development') !== 'production') {
        const detail = typeof err === 'string' ? err : (err?.message || err?.response?.error?.message || 'Unknown error');
        return `${base}\n\n(details: ${detail})`;
      }
      return base;
    }
  })();
  return withTimeout(llmCall, 10000, `Timed out generating answer. Here's retrieved context instead:\n\n${context}`);
}

module.exports = { generateAnswer };


