# News Chatbot Backend (RAG)

A Retrieval-Augmented Generation (RAG) backend that answers queries over a sample news corpus using embeddings-based retrieval and an LLM for generation.

## Tech Stack
- **Runtime**: Node.js (>=16)
- **Framework**: Express.js
- **LLM**: Google Generative AI (Gemini)
- **Embeddings**: Hugging Face Inference API or Jina AI (with deterministic local fallback)
- **Cache/Sessions**: Redis (optional fallback to in-memory if not required)
- **HTTP**: axios
- **Utilities**: dotenv, uuid, cors

## Folder Structure
```
RagChatbotBackend/
├─ lib/
│  └─ timeout.js                # Promise timeout helper
├─ services/
│  ├─ embeddings.js             # Embedding providers and fallback
│  ├─ llm.js                    # Gemini call with graceful fallback
│  ├─ retrieval.js              # In-memory vector store and retrieval
│  └─ sessions.js               # Redis-backed session store with fallback
├─ server.js                    # Express app and API routes
├─ package.json
├─ package-lock.json
└─ README.md
```

## Environment Variables
Place in `.env` (loaded by `dotenv`). Key variables:

- LLM
  - `GEMINI_API_KEY` (string): Google Generative AI key. If omitted, responses fall back to a context summary string.

- Embeddings
  - `EMBEDDINGS_PROVIDER` (string): `hf` to use Hugging Face; if not `hf` and `JINA_API_KEY` is set, uses Jina; otherwise uses a deterministic local fallback.
  - `HF_API_KEY` (string): Hugging Face Inference API key (required if `EMBEDDINGS_PROVIDER=hf`).
  - `HF_EMBEDDING_MODEL` (string): HF model id. Default: `sentence-transformers/all-MiniLM-L6-v2`.
  - `JINA_API_KEY` (string): Jina AI key (optional alternative to HF).

- Redis (Sessions)
  - Use a single URL:
    - `REDIS_URL` (string): e.g. `rediss://default:PASSWORD@host:port` (TLS) or `redis://default:PASSWORD@host:port` (non‑TLS)
  - Or discrete values:
    - `REDIS_HOST` (string)
    - `REDIS_PORT` (number)
    - `REDIS_USERNAME` (string) optional; defaults to `default` when password is set
    - `REDIS_PASSWORD` (string)
    - `REDIS_TLS` or `REDIS_SSL` (bool): `true` to enable TLS even if using `redis://` scheme
  - Behavior flags:
    - `REQUIRE_REDIS` (bool): if `true`, failures in Redis operations will error; if `false`, the service falls back to in-memory sessions.
    - `SESSION_TTL_SECONDS` (number): default `3600`.

- Server
  - `PORT` (number): default `5000`.
  - `NODE_ENV` (string): `production` or `development`. In non‑production, some responses include `details` for easier debugging.

### Redis TLS Examples
- Redis Cloud with TLS (most common):
  - `REDIS_URL=rediss://default:YOURPASSWORD@redis-19887.c57.us-east-1-4.ec2.redns.redis-cloud.com:19887`
- Redis Cloud non‑TLS (only if your endpoint is non‑TLS):
  - `REDIS_URL=redis://default:YOURPASSWORD@hostname:port`
- Using discrete variables with TLS:
  - `REDIS_HOST=redis-19887.c57.us-east-1-4.ec2.redns.redis-cloud.com`
  - `REDIS_PORT=19887`
  - `REDIS_USERNAME=default`
  - `REDIS_PASSWORD=YOURPASSWORD`
  - `REDIS_TLS=true`

On startup the server logs a safe summary of the Redis target: `{ target: "host:port", tls: true|false }`.

## Run Locally
1) Install dependencies
```bash
npm install
```

2) Set environment
- Create `.env` and set your keys (see variables above).

3) Start server
```bash
# Development (auto-reload if you add nodemon)
npm run dev

# Production
npm start
```
Server listens on `http://localhost:${PORT}` (default `5000`).

## API Reference
Base URL: `http://localhost:5000`

### Health
- Method: GET
- URL: `/api/health`
- Response:
```json
{
  "status": "OK",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "redis": "connected" | "unavailable",
  "requireRedis": true | false
}
```

### Create Session
- Method: POST
- URL: `/api/sessions`
- Body: none
- Response:
```json
{ "sessionId": "3a7b8b1e-1f18-4c2e-9b4d-1c7a7a2e7b90" }
```

### Get Session History
- Method: GET
- URL: `/api/sessions/:sessionId/history`
- Response (200):
```json
{ "history": [
  {
    "id": "...",
    "type": "user" | "bot",
    "content": "...",
    "timestamp": "2025-01-01T00:00:00.000Z",
    "passages": [
      { "title": "...", "content": "...", "url": "...", "score": 0.87 }
    ]
  }
] }
```
- Error (when `REQUIRE_REDIS=true` and Redis operation fails):
```json
{ "error": "Failed to fetch session history" }
```
- When `REQUIRE_REDIS=false`, endpoint returns `{ "history": [] }` on transient Redis errors (non‑production may include `details`).

### Clear Session
- Method: DELETE
- URL: `/api/sessions/:sessionId`
- Response (200):
```json
{ "message": "Session cleared successfully" }
```
- Error:
```json
{ "error": "Failed to clear session" }
```

### Chat
- Method: POST
- URL: `/api/chat`
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "sessionId": "3a7b8b1e-1f18-4c2e-9b4d-1c7a7a2e7b90",
  "message": "What are today’s top tech news?"
}
```
- Response (200):
```json
{
  "response": "... the generated or fallback answer ...",
  "passages": [
    { "title": "...", "content": "...", "url": "...", "score": 0.91 },
    { "title": "...", "content": "...", "url": "...", "score": 0.88 }
  ]
}
```
- Error (500):
```json
{ "error": "Failed to process message" }
```
In `development`, a `details` field is included to aid debugging. In `production`, server logs indicate the failing stage (e.g., `chat:retrieval_failed`, `chat:llm_failed`, `chat:save_failed`).

## RAG Pipeline
1) Ingestion (demo)
   - On startup, `server.js` ingests a built‑in set of sample news articles into an in‑memory vector store.
2) Embeddings
   - If `EMBEDDINGS_PROVIDER=hf` and `HF_API_KEY` provided: uses Hugging Face Inference API.
   - Else if `JINA_API_KEY` provided: uses Jina AI embeddings.
   - Otherwise: uses a deterministic local hash‑based embedding for reliability without network access.
3) Retrieval
   - Cosine similarity over the in‑memory vectors; returns top‑K passages (default 3).
4) Generation
   - `llm.js` calls Gemini if `GEMINI_API_KEY` is set; otherwise returns a context summary string.
   - LLM errors are caught and downgraded to a context summary (non‑production includes brief error detail).
5) Sessions
   - Chat history is stored under `session:{sessionId}` with TTL `SESSION_TTL_SECONDS` (default 3600).
   - If Redis is unavailable and `REQUIRE_REDIS=false`, falls back to an in‑memory `Map` with the same TTL behavior.

## Production Notes
- Set `REQUIRE_REDIS=true` only when Redis connectivity is reliable.
- Confirm Redis TLS settings match your provider. If using Redis Cloud, prefer `rediss://` or set `REDIS_TLS=true` with discrete vars.
- Outbound network access is required if using HF or Jina embeddings and Gemini LLM.
- Logs include per‑step markers in the chat flow: `chat:history_loaded`, `chat:retrieval_ok`, `chat:llm_ok`, `chat:history_saved`, and error markers for failures.

## Postman Quickstart
1) Create session
   - POST `{{baseUrl}}/api/sessions` → copy `sessionId`
2) Get history
   - GET `{{baseUrl}}/api/sessions/{{sessionId}}/history` → `{ "history": [] }`
3) Chat
   - POST `{{baseUrl}}/api/chat` with JSON body `{ sessionId, message }`
4) Verify history
   - GET `{{baseUrl}}/api/sessions/{{sessionId}}/history` → now contains user and bot messages

## Scripts
- `npm run dev` – start in development
- `npm start` – start in production
- `npm test` – run tests (placeholder)
- `npm run lint` – lint (placeholder rules)

## License
MIT

