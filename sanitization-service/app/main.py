"""Main FastAPI application for Layer8 Sanitization Service."""
import logging
from contextlib import asynccontextmanager
from typing import Any

import spacy
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.health import router as health_router
from app.routes import sanitize_router
from app.services.sanitizer import SanitizationService

# Configure logging
logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global state for spaCy models and sanitizer
nlp_models: dict[str, Any] = {}
models_loaded: bool = False
sanitizer: Any = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context manager for startup and shutdown events."""
    global nlp_models, models_loaded, sanitizer

    # Startup: Load spaCy models
    logger.info("Starting Layer8 Sanitization Service...")
    logger.info(f"Loading {len(settings.spacy_models)} spaCy models...")

    model_mapping = {
        "en_core_web_lg": "en",
        "pt_core_news_lg": "pt",
    }

    loaded_count = 0
    for model_name in settings.spacy_models:
        try:
            logger.info(f"Loading {model_name}...")
            nlp = spacy.load(model_name)
            lang_code = model_mapping.get(model_name, model_name.split("_")[0])
            nlp_models[lang_code] = nlp
            loaded_count += 1
            logger.info(f"Loaded {loaded_count}/{len(settings.spacy_models)} models")
        except Exception as e:
            logger.error(f"Failed to load {model_name}: {e}")

    if loaded_count == len(settings.spacy_models):
        models_loaded = True
        logger.info("All spaCy models loaded successfully")
    else:
        logger.warning(
            f"Only {loaded_count}/{len(settings.spacy_models)} models loaded"
        )

    # Initialize sanitization service
    if models_loaded:
        logger.info("Initializing sanitization service...")
        sanitizer = SanitizationService(nlp_models)
        app.state.sanitizer = sanitizer
        logger.info("Sanitization service initialized")
    else:
        logger.error("Cannot initialize sanitization service without models")
        app.state.sanitizer = None

    yield

    # Shutdown: Clean up resources
    logger.info("Shutting down Layer8 Sanitization Service...")
    nlp_models.clear()


# Create FastAPI application
app = FastAPI(
    title="Layer8 Sanitization Service",
    description="PII detection and sanitization microservice for Layer8",
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware (called from Node backend on same network)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store state in app.state for access from routes
app.state.nlp_models = nlp_models
app.state.models_loaded_flag = lambda: models_loaded

# Mount routers
app.include_router(health_router, tags=["health"])
app.include_router(sanitize_router, tags=["sanitization"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "Layer8 Sanitization Service",
        "version": "1.0.0",
        "status": "running",
    }
