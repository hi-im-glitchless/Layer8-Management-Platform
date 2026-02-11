# Layer8 Sanitization Service

FastAPI microservice for PII detection and sanitization using spaCy NLP models.

## Python Version Requirement

**Production (Docker)**: Python 3.12 (as specified in Dockerfile)
**Local Development**: Python 3.9-3.12 recommended

Note: Python 3.14+ has compatibility issues with spaCy 3.8.x and Pydantic v1. Use Python 3.12 for local development or run via Docker.

## Quick Start (Docker)

```bash
docker build -t sanitization-service .
docker run -p 8000:8000 sanitization-service
```

## Local Development Setup

```bash
# Requires Python 3.9-3.12
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Download spaCy models (large files, ~560MB each)
python -m spacy download en_core_web_lg
python -m spacy download pt_core_news_lg

# Run service
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Health Check

The service provides a `/health` endpoint:
- Returns **503** while models are loading (startup takes 3-5 seconds)
- Returns **200** when models are loaded and ready

```bash
curl http://localhost:8000/health
```

Expected response when ready:
```json
{
  "status": "healthy",
  "models_loaded": true,
  "supported_languages": ["en", "pt"]
}
```

## Configuration

Environment variables with `SANITIZER_` prefix:

- `SANITIZER_HOST`: Server host (default: 0.0.0.0)
- `SANITIZER_PORT`: Server port (default: 8000)
- `SANITIZER_REDIS_URL`: Redis connection URL (default: redis://localhost:6379)
- `SANITIZER_LOG_LEVEL`: Logging level (default: info)

See `.env.example` for complete configuration.
