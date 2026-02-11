"""Configuration settings for the sanitization service."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration using Pydantic BaseSettings."""

    host: str = "0.0.0.0"
    port: int = 8000
    redis_url: str = "redis://localhost:6379"
    log_level: str = "info"
    spacy_models: list[str] = ["en_core_web_lg", "pt_core_news_lg"]
    default_confidence_threshold: float = 0.5

    class Config:
        """Pydantic config."""
        env_prefix = "SANITIZER_"
        case_sensitive = False


# Global settings instance
settings = Settings()
