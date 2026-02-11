# Base image with Python 3.12 for spaCy compatibility
FROM python:3.12-slim

# Install system dependencies for spaCy and curl for healthcheck
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first (Docker layer caching)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy models (large files, ~560MB each)
RUN python -m spacy download en_core_web_lg && \
    python -m spacy download pt_core_news_lg

# Copy application code
COPY app/ ./app/

# Create non-root user and set ownership
RUN useradd -m appuser && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check (allow 15s startup time for model loading)
HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=15s \
    CMD curl -f http://localhost:8000/health || exit 1

# Run uvicorn server
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
