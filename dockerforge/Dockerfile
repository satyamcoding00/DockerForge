# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python backend + serve static frontend ──────────────────────────
FROM python:3.11-slim

# Install Docker CLI + Git
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      docker.io \
      git \
      curl \
      ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (cache layer)
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend assets
COPY --from=frontend-build /app/frontend/dist ./static/

ENV GEMINI_API_KEY=""
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# NOTE: Mount docker.sock at runtime:
#   docker run -v /var/run/docker.sock:/var/run/docker.sock ...
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
