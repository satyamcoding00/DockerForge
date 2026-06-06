import os
import uuid
import asyncio
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sse_starlette.sse import EventSourceResponse
import google.generativeai as genai

from backend.models.schemas import GenerateRequest, GenerateResponse, JobResult
from backend.agent.orchestrator import run_agent
from backend.utils.sse_manager import event_emitter

load_dotenv()

# ── Gemini setup ─────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

_model = None


def get_model():
    global _model
    if _model is None:
        if not GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY is not set")
        _model = genai.GenerativeModel("gemini-2.0-flash")
    return _model


# ── In-memory job store ───────────────────────────────────────────────────────
jobs: dict = {}

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="DockerForge API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure /tmp/dockerforge exists
Path("/tmp/dockerforge").mkdir(parents=True, exist_ok=True)


# ── API Routes ────────────────────────────────────────────────────────────────

@app.post("/api/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest, background_tasks: BackgroundTasks):
    url = request.github_url.strip()
    if not url.startswith("https://github.com/") and not url.startswith("http://github.com/"):
        raise HTTPException(status_code=400, detail="URL must be a GitHub repository URL")

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "queued",
        "success": None,
        "dockerfile": None,
        "compose": None,
        "attempts": 0,
        "image_name": None,
        "build_time_seconds": None,
        "error": None,
    }
    event_emitter.register(job_id)

    model = get_model()
    background_tasks.add_task(run_agent, job_id, url, model, jobs)

    return GenerateResponse(job_id=job_id)


@app.get("/api/stream/{job_id}")
async def stream(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_generator():
        async for chunk in event_emitter.stream(job_id):
            yield chunk
        event_emitter.unregister(job_id)

    return EventSourceResponse(event_generator())


@app.get("/api/result/{job_id}", response_model=JobResult)
async def result(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    data = jobs[job_id]
    return JobResult(
        job_id=job_id,
        success=bool(data.get("success")),
        dockerfile=data.get("dockerfile"),
        compose=data.get("compose"),
        attempts=data.get("attempts", 0),
        image_name=data.get("image_name"),
        build_time_seconds=data.get("build_time_seconds"),
        error=data.get("error"),
    )


@app.get("/api/health")
async def health():
    return {"status": "ok", "gemini_configured": bool(GEMINI_API_KEY)}


# ── Serve React frontend ──────────────────────────────────────────────────────
_static_dir = Path(__file__).parent.parent / "static"
if _static_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(_static_dir / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        index = _static_dir / "index.html"
        return FileResponse(str(index))
