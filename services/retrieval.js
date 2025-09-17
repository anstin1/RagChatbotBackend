const { createHash } = require('crypto');
const { getEmbedding } = require('./embeddings');
const { withTimeout } = require('../lib/timeout');

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const vectorStore = [];

async function ingestArticles(articles) {
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const text = `${article.title}. ${article.content}`;
    const embedding = await withTimeout(getEmbedding(text), 1500, []);
    vectorStore.push({
      id: createHash('md5').update(article.url).digest('hex'),
      vector: embedding,
      payload: { ...article }
    });
  }
}

async function retrievePassages(query, topK = 3) {
  const queryEmbedding = await withTimeout(getEmbedding(query), 1500, []);
  const scored = vectorStore.map(item => ({
    score: cosineSimilarity(queryEmbedding, item.vector),
    payload: item.payload
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(s => ({
    title: s.payload.title,
    content: s.payload.content,
    url: s.payload.url,
    score: s.score
  }));
}

module.exports = { ingestArticles, retrievePassages };


