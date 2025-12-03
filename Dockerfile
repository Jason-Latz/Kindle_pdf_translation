# Multi-stage Dockerfile for Render (single service: FastAPI API + static Next.js frontend)

# 1) Build the frontend as a static export
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
# Allow overriding API base at build time (Render sets env at build)
ARG NEXT_PUBLIC_API_BASE=http://localhost:8000
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}
# Build (output: export is configured in next.config.js); build writes the static site to ./out.
RUN npm run build \
    && mv ./out /app/out

# 2) Build the backend
FROM python:3.11-slim AS backend
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /tmp/requirements.txt
RUN python -m pip install --upgrade pip \
    && if [ -s /tmp/requirements.txt ]; then pip install -r /tmp/requirements.txt; fi \
    && pip install watchfiles

# Copy backend source
COPY backend /app

# Copy the exported frontend into the image so FastAPI can serve it
COPY --from=frontend /app/out /app/frontend_static

# Data directory for uploads/artifacts (uses container FS; add Render disk for persistence)
RUN mkdir -p /app/data

EXPOSE 8000
ENV PORT=8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
