News Chatbot Backend
A RAG-powered chatbot backend that answers queries over a news corpus using a Retrieval-Augmented Generation pipeline.

🚀 Tech Stack
Backend Framework: Node.js with Express.js
Vector Store: In-memory for demo (replaceable with Qdrant/FAISS later)
Cache & Sessions: Redis for in-memory chat history
LLM API: Google Gemini Pro
Embeddings: Hugging Face (default) or Jina (optional), with local fallback

📁 Project Structure
backend/
├── server.js              # Main server file with RAG pipeline
├── package.json           # Dependencies and scripts
├── .env.example          # Environment variables template
├── README.md             # This file
└── docs/                 # Additional documentation

🛠️ Installation & Setup
Prerequisites
Node.js (v16 or higher)
Redis server

1. Install Dependencies
bash
npm install

2. Environment Configuration
Copy .env.example to .env and fill in your API keys:

bash
cp .env.example .env

Required environment variables:

GEMINI_API_KEY: Get from Google AI Studio
EMBEDDINGS_PROVIDER: Set to hf to use Hugging Face; leave empty to use Jina if JINA_API_KEY is set, otherwise local fallback
HF_API_KEY: Get from Hugging Face (if using hf)
HF_EMBEDDING_MODEL: e.g., sentence-transformers/all-MiniLM-L6-v2
JINA_API_KEY: (optional) Get from Jina AI (used if EMBEDDINGS_PROVIDER is not hf)
REDIS_URL: Redis connection string

3. Start Required Services
Redis:

bash
# Using Docker
docker run -d -p 6379:6379 redis:alpine

# Or install locally
# macOS: brew install redis && brew services start redis
# Ubuntu: sudo apt install redis-server && sudo systemctl start redis

4. Run the Application
bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start

The server will start on port 5000 by default.

🔧 API Endpoints
REST API
Method	Endpoint	Description
GET	/api/health	Health check
POST	/api/sessions	Create new chat session
GET	/api/sessions/:id/history	Get session chat history
DELETE	/api/sessions/:id	Clear session history
POST	/api/chat	Send message and get response

🧠 RAG Pipeline Flow
1. Document Ingestion
Uses sample articles for demo
Processes title and content together
2. Embedding Generation
Uses Hugging Face Inference API (default) or Jina if configured
If no keys provided, uses deterministic local fallback
3. Query Processing
User sends query
Generate query embedding
Search in-memory store for top-K similar articles (default: 3)
Pass retrieved context to Gemini for answer generation
Return structured response with sources
4. Session Management
Each user gets unique session ID
Chat history stored in Redis with TTL

⚡ Caching & Performance
Redis Configuration
TTL Settings:

javascript
// Session history: 1 hour (configurable via SESSION_TTL_SECONDS)
await redis.setEx(`session:${sessionId}`, 3600, JSON.stringify(history));

Performance Considerations:

Embeddings are generated during startup for the demo corpus
Popular queries can be pre-computed and cached (future work)

Recommended Production Settings
env
# Redis Configuration
SESSION_TTL_SECONDS=3600
MAX_HISTORY_LENGTH=100

# RAG Configuration
TOP_K_RESULTS=3

# Server Configuration
NODE_ENV=production
PORT=5000

🚀 Deployment
Using Docker

dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]

📊 Monitoring & Logs
The application includes basic logging for:

API requests and responses
RAG pipeline steps
Session management
Error tracking

🔒 Security Considerations
API keys stored in environment variables
CORS configured for specific origins
Input validation and sanitization
Rate limiting for API endpoints (recommendation)

🧪 Testing
bash
# Run tests
npm test

# Lint code
npm run lint

📈 Scaling Considerations
Horizontal Scaling: Use Redis Cluster for session storage
Vector Database: Replace in-memory with Qdrant/FAISS for production
Load Balancing: Multiple server instances behind load balancer
Caching: CDN for static content, Redis for dynamic content
Monitoring: Application metrics and health checks

🤝 Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

