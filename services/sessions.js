const Redis = require('redis');
const { withTimeout } = require('../lib/timeout');

function buildRedisUrlFromEnv() {
  const rawUrl = process.env.REDIS_URL;
  const hasProtocol = typeof rawUrl === 'string' && rawUrl.includes('://');
  if (rawUrl && hasProtocol) return rawUrl;

  const tlsEnabled = String(process.env.REDIS_TLS || process.env.REDIS_SSL || '').toLowerCase() === 'true';
  const scheme = (process.env.REDIS_SCHEME || (tlsEnabled ? 'rediss' : 'redis'));

  if (rawUrl && !hasProtocol) {
    return `${scheme}://${rawUrl}`;
  }

  const host = process.env.REDIS_HOST || 'localhost';
  const port = process.env.REDIS_PORT || '6379';
  const username = process.env.REDIS_USERNAME || process.env.REDIS_USER || (process.env.REDIS_PASSWORD ? 'default' : '');
  const password = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || '';
  const auth = password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : '';
  return `${scheme}://${auth}${host}:${port}`;
}

const redisUrl = buildRedisUrlFromEnv();
const redis = Redis.createClient({
  url: redisUrl,
  socket: { tls: redisUrl.startsWith('rediss://') }
});
redis.on('error', (err) => {
  console.error('Redis error:', err?.message || err);
});
redis.connect().catch((err) => {
  console.error('Redis connect error:', err?.message || err);
});

const REQUIRE_REDIS = String(process.env.REQUIRE_REDIS || 'false').toLowerCase() === 'true';
const inMemorySessions = new Map();

async function getSessionHistory(sessionId) {
  try {
    if (redis.isOpen) {
      const history = await withTimeout(redis.get(`session:${sessionId}`), 500, null);
      return history ? JSON.parse(history) : [];
    }
  } catch (e) {
    console.warn('Redis GET failed, using in-memory session store');
  }
  if (REQUIRE_REDIS) {
    throw new Error('Redis is required but unavailable');
  }
  return inMemorySessions.get(sessionId) || [];
}

async function saveSessionHistory(sessionId, history) {
  const ttlSeconds = parseInt(process.env.SESSION_TTL_SECONDS || '3600', 10);
  try {
    if (redis.isOpen) {
      const ok = await withTimeout(redis.setEx(`session:${sessionId}`, ttlSeconds, JSON.stringify(history)), 500, null);
      if (ok) return;
    }
  } catch (e) {
    console.warn('Redis SET failed, using in-memory session store');
  }
  if (REQUIRE_REDIS) {
    throw new Error('Redis is required but unavailable');
  }
  inMemorySessions.set(sessionId, history);
  setTimeout(() => {
    inMemorySessions.delete(sessionId);
  }, ttlSeconds * 1000).unref?.();
}

async function clearSession(sessionId) {
  try {
    if (redis.isOpen) {
      await withTimeout(redis.del(`session:${sessionId}`), 500, null);
      return;
    }
  } catch (e) {
    console.warn('Redis DEL failed, clearing in-memory session store');
  }
  if (REQUIRE_REDIS) {
    throw new Error('Redis is required but unavailable');
  }
  inMemorySessions.delete(sessionId);
}

function redisStatus() {
  return redis?.isOpen ? 'connected' : 'unavailable';
}

module.exports = { getSessionHistory, saveSessionHistory, clearSession, redisStatus };


