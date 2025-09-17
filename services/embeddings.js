const axios = require('axios');
const { createHash } = require('crypto');

const EMBEDDINGS_PROVIDER = (process.env.EMBEDDINGS_PROVIDER || '').toLowerCase();
const HF_MODEL = process.env.HF_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';

function meanPool(vectors) {
  if (!Array.isArray(vectors) || vectors.length === 0) return [];
  const length = vectors[0].length;
  const sum = new Array(length).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < length; i++) sum[i] += v[i];
  }
  for (let i = 0; i < length; i++) sum[i] /= vectors.length;
  return sum;
}

async function getEmbeddingViaJina(text) {
  const response = await axios.post('https://api.jina.ai/v1/embeddings', {
    model: 'jina-embeddings-v2-base-en',
    input: [text]
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.JINA_API_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 8000
  });
  return response.data.data[0].embedding;
}

async function getEmbeddingViaHuggingFace(text) {
  const url = `https://api-inference.huggingface.co/models/${HF_MODEL}`;
  const response = await axios.post(url, { inputs: text }, {
    headers: {
      'Authorization': `Bearer ${process.env.HF_API_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 8000
  });
  const data = response.data;
  if (Array.isArray(data) && data.length > 0) {
    if (typeof data[0] === 'number') return data;
    if (Array.isArray(data[0]) && typeof data[0][0] === 'number') {
      if (data.length === 1) return data[0];
      return meanPool(data);
    }
    if (Array.isArray(data[0]) && Array.isArray(data[0][0])) {
      return meanPool(data[0]);
    }
  }
  throw new Error('Unexpected HF embeddings response shape');
}

async function getEmbedding(text) {
  try {
    if (EMBEDDINGS_PROVIDER === 'hf' && process.env.HF_API_KEY) {
      return await getEmbeddingViaHuggingFace(text);
    }
    if (process.env.JINA_API_KEY) {
      return await getEmbeddingViaJina(text);
    }
    const hash = createHash('sha256').update(text).digest();
    const arr = Array.from(hash).slice(0, 64).map(v => (v - 128) / 128);
    return arr;
  } catch (err) {
    const hash = createHash('sha256').update(text).digest();
    const arr = Array.from(hash).slice(0, 64).map(v => (v - 128) / 128);
    return arr;
  }
}

module.exports = { getEmbedding, meanPool };


