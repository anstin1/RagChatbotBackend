// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

// Load environment variables BEFORE importing modules that read process.env
dotenv.config();

const { ingestArticles, retrievePassages } = require('./services/retrieval');
const { generateAnswer } = require('./services/llm');
const { getSessionHistory, saveSessionHistory, clearSession, redisStatus } = require('./services/sessions');
const { withTimeout } = require('./lib/timeout');

const app = express();
app.use(cors());
app.use(express.json());

// Simple request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Ensure REQUIRE_REDIS is defined globally
const REQUIRE_REDIS = String(process.env.REQUIRE_REDIS || 'false').toLowerCase() === 'true';

async function scrapeNews() {
  const sampleArticles = [
    {
      title: "Global Climate Summit Reaches Historic Agreement",
      content: "World leaders have reached a groundbreaking agreement on climate action, setting ambitious targets for carbon emission reductions by 2030. The summit, held in Geneva, saw unprecedented cooperation between major economies.",
      url: "https://example.com/climate-summit",
      publishedAt: new Date().toISOString()
    },
    {
      title: "Tech Giants Announce Major AI Safety Initiative",
      content: "Leading technology companies have announced a joint initiative to develop safer AI systems. The collaboration includes new safety standards and ethical guidelines for AI development.",
      url: "https://example.com/ai-safety",
      publishedAt: new Date().toISOString()
    },
    {
      title: "Global Economy Shows Signs of Recovery",
      content: "Economic indicators suggest a strong recovery across major markets. GDP growth has exceeded expectations in several countries, signaling renewed confidence in global trade.",
      url: "https://example.com/economy-recovery",
      publishedAt: new Date().toISOString()
    },
    {
      title: "Breakthrough in Renewable Energy Storage",
      content: "Scientists have developed a revolutionary battery technology that could store renewable energy for months. This breakthrough could solve one of the biggest challenges in clean energy adoption.",
      url: "https://example.com/energy-storage",
      publishedAt: new Date().toISOString()
    },
    {
      title: "International Space Station Welcomes New Crew",
      content: "A new crew of astronauts has successfully docked with the International Space Station. The mission includes groundbreaking experiments in microgravity research.",
      url: "https://example.com/space-station",
      publishedAt: new Date().toISOString()
    }
  ];
  return sampleArticles;
}

async function ingestAll() {
  const articles = await scrapeNews();
  await ingestArticles(articles);
}

// logic delegated to services

// --- API Routes ---
app.get('/api/health', async (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString(), redis: redisStatus(), requireRedis: REQUIRE_REDIS });
});

app.post('/api/sessions', (req, res) => {
  const sessionId = uuidv4();
  res.json({ sessionId });
});

app.get('/api/sessions/:sessionId/history', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.json({ history: [] });
    }
    const history = await getSessionHistory(sessionId);
    res.json({ history });
  } catch (e) {
    console.error('Failed to fetch session history:', e?.message || e);
    const nonProd = (process.env.NODE_ENV || 'development') !== 'production';
    if (!REQUIRE_REDIS) {
      // When Redis isn't required, don't fail the page; return empty history
      return res.status(200).json({ history: [], ...(nonProd ? { details: e?.message || String(e) } : {}) });
    }
    res.status(500).json({ error: 'Failed to fetch session history', ...(nonProd ? { details: e?.message || String(e) } : {}) });
  }
});

app.delete('/api/sessions/:sessionId', async (req, res) => {
  try {
    await clearSession(req.params.sessionId);
    res.json({ message: 'Session cleared successfully' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to clear session' });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId || !message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Session ID and message are required' });
    }

    const overallTimeoutMs = 10000;
    const work = (async () => {
      let history;
      try {
        history = await getSessionHistory(sessionId);
        console.log('chat:history_loaded', { sessionId, messages: history.length });
      } catch (err) {
        console.error('chat:history_failed', err?.message || err);
        throw new Error('history_failed');
      }

      const userMessage = {
        id: uuidv4(),
        type: 'user',
        content: message,
        timestamp: new Date().toISOString()
      };
      history.push(userMessage);

      let passages;
      try {
        passages = await retrievePassages(message);
        console.log('chat:retrieval_ok', { sessionId, passages: passages.length });
      } catch (err) {
        console.error('chat:retrieval_failed', err?.message || err);
        throw new Error('retrieval_failed');
      }

      let answer;
      try {
        answer = await generateAnswer(message, passages);
        console.log('chat:llm_ok', { sessionId, answerChars: typeof answer === 'string' ? answer.length : 0 });
      } catch (err) {
        console.error('chat:llm_failed', err?.message || err);
        throw new Error('llm_failed');
      }

      const botMessage = {
        id: uuidv4(),
        type: 'bot',
        content: answer,
        passages,
        timestamp: new Date().toISOString()
      };
      history.push(botMessage);

      try {
        await saveSessionHistory(sessionId, history);
        console.log('chat:history_saved', { sessionId, messages: history.length });
      } catch (err) {
        console.error('chat:save_failed', err?.message || err);
        throw new Error('save_failed');
      }

      return { response: answer, passages };
    })();

    const result = await withTimeout(work, overallTimeoutMs, {
      response: 'Timed out processing your request. Please try again in a moment.',
      passages: []
    });
    res.json(result);
  } catch (e) {
    console.error('Error processing chat message:', e);
    const payload = { error: 'Failed to process message' };
    if ((process.env.NODE_ENV || 'development') !== 'production') {
      payload.details = e?.message || String(e);
    }
    res.status(500).json(payload);
  }
});

// --- Startup ---
async function start() {
  try {
    await ingestAll();
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (e) {
    console.error('Failed to start server:', e);
    process.exit(1);
  }
}

start();