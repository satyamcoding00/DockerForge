# DockerForge 🐳

> **AI-Powered Dockerfile Generator** — Point it at any GitHub repo, get a working Dockerfile.

## Architecture

```
┌────────────┐     POST /api/generate      ┌─────────────────────────────────────────┐
│  React UI  │ ─────────────────────────▶  │           FastAPI Backend               │
│  (Vite)    │ ◀──── SSE /api/stream ───   │                                         │
└────────────┘                             │  ┌──────────────────────────────────┐   │
                                           │  │       Agent Orchestrator          │   │
                                           │  │                                   │   │
                                           │  │  1. Clone Repo (GitPython)        │   │
                                           │  │  2. Scan & Detect Stack           │   │
                                           │  │  3. Generate Dockerfile ──────────┼───┼──▶ Gemini 2.0 Flash
                                           │  │  4. docker build (subprocess)     │   │
                                           │  │  5. Analyze Error (if fail) ──────┼───┼──▶ Gemini 2.0 Flash
                                           │  │  6. Retry (max 3 attempts)        │   │
                                           │  │  7. docker run (verify)           │   │
                                           │  └──────────────────────────────────┘   │
                                           └─────────────────────────────────────────┘
```

### Agentic Retry Loop

```
Generate Dockerfile
       │
       ▼
   docker build ──── success ──▶ docker run ──▶ COMPLETE
       │
     failed
       │
       ▼
  Analyze Error
       │
       ▼
  Regenerate (Gemini gets error context + original dockerfile)
       │
       ▼
   docker build  (attempt 2/3)
       │  ...
       ▼
  Max 3 attempts ──▶ ERROR
```

## LLM Choice: Gemini 2.0 Flash

| Property | Value |
|---|---|
| **Model** | `gemini-2.0-flash` |
| **Context window** | 1M tokens — can read entire codebases |
| **Why Flash over Pro** | Fast iteration for retry loops; low latency on fix attempts |
| **Free tier** | Sufficient for testing (15 RPM, 1M TPM) |

The large context window is critical: DockerForge feeds the full file tree + key config files directly into each prompt, so Gemini has complete project context when generating Dockerfiles.

## Project Structure

```
dockerforge/
├── backend/
│   ├── main.py                  # FastAPI app, /api/generate, /api/stream, /api/result
│   ├── agent/
│   │   ├── orchestrator.py      # 7-step agentic loop
│   │   ├── repo_scanner.py      # Clone + walk file tree, detect language/framework
│   │   ├── dockerfile_generator.py  # Gemini prompts (initial + retry)
│   │   ├── docker_builder.py    # subprocess docker build/run with async streaming
│   │   └── error_analyzer.py   # Regex-based error pattern matching
│   ├── models/schemas.py        # Pydantic models
│   ├── utils/sse_manager.py     # asyncio.Queue-based SSE event bus
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Phase-based layout: idle → running → done
│   │   ├── components/
│   │   │   ├── URLInput.jsx         # GitHub URL input + example chips
│   │   │   ├── AgentTimeline.jsx    # 7-step vertical progress tracker
│   │   │   ├── LogViewer.jsx        # Live terminal-style log stream
│   │   │   ├── DockerfileDisplay.jsx # Syntax-highlighted Dockerfile + copy/download
│   │   │   └── StatusBadge.jsx      # pending/active/done/failed/retrying badges
│   │   └── hooks/useSSE.js      # EventSource hook with reconnect logic
│   ├── package.json
│   └── vite.config.js           # Proxy /api → localhost:8000
├── Dockerfile                   # Multi-stage: node build + python runtime
├── docker-compose.yml
└── README.md
```

## Setup

### Prerequisites

- Docker Desktop (running)
- A [Gemini API key](https://aistudio.google.com/app/apikey) (free tier works)

---

### Option 1: Docker (Recommended)

```bash
# Build the image
docker build -t dockerforge .

# Run (mount docker.sock for Docker-in-Docker)
docker run -p 8000:8000 \
  -e GEMINI_API_KEY=your_key_here \
  -v /var/run/docker.sock:/var/run/docker.sock \
  dockerforge
```

Open [http://localhost:8000](http://localhost:8000)

---

### Option 2: docker-compose

```bash
# Create .env file
echo "GEMINI_API_KEY=your_key_here" > .env

docker compose up --build
```

---

### Option 3: Local Development

**Backend:**
```bash
cd backend
pip install -r requirements.txt

# Create .env
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

uvicorn backend.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev     # Runs on http://localhost:5173 (proxies /api to :8000)
```

## API Reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/generate` | Start a generation job. Body: `{"github_url": "..."}`. Returns `{"job_id": "..."}` |
| `GET` | `/api/stream/{job_id}` | SSE stream of agent events |
| `GET` | `/api/result/{job_id}` | Final result: dockerfile, attempts, success |
| `GET` | `/api/health` | Health check |

### SSE Event Types

| Event | Meaning |
|---|---|
| `CLONING` | Cloning the GitHub repository |
| `SCANNING` | Analyzing file structure and stack |
| `GENERATING` | Calling Gemini to write the Dockerfile |
| `BUILDING` | Running `docker build` |
| `BUILD_SUCCESS` | Build succeeded |
| `BUILD_FAILED` | Build failed, analyzing error |
| `RETRYING` | Calling Gemini with error context for a fix |
| `RUNNING` | Running `docker run` to verify |
| `RUN_SUCCESS` | Container started successfully |
| `RUN_FAILED` | Container failed to start (Dockerfile was built successfully) |
| `COMPLETE` | Everything done |
| `ERROR` | Fatal error or max retries exceeded |
| `LOG` | Raw log line from docker build output |

## Known Limitations

- **Requires Docker daemon** running on the host (mounts `/var/run/docker.sock`)
- **Public repos only** — private repositories require SSH key setup
- **Build timeout** is 5 minutes — very large images (e.g. PyTorch) may time out
- **Large monorepos** (>500 files) may exceed Gemini's effective context
- **Port detection** is heuristic — some apps need manual `-p` flags to be accessible
- **docker run verification** only checks that the container starts, not that it serves traffic
- Results are stored in-memory — server restart clears all job history

## Security Note

Mounting `/var/run/docker.sock` gives the container full Docker daemon access on the host. Only run DockerForge in trusted environments. Never expose it to the public internet without authentication.
