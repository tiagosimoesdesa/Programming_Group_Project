from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./beerreal.db"
    jwt_secret: str
    public_url: str = "http://localhost:8000"
    storage_mode: str = "local"
    upload_dir: str = "uploads"
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_bucket: str = "beerreal"
    cors_origins: list[str] = ["http://localhost:8082", "http://127.0.0.1:8082"]


settings = Settings()
if len(settings.jwt_secret) < 32:
    raise RuntimeError("JWT_SECRET must contain at least 32 characters")
if settings.storage_mode not in {"local", "supabase"}:
    raise RuntimeError("STORAGE_MODE must be local or supabase")
if settings.storage_mode == "supabase" and not (settings.supabase_url and settings.supabase_service_key):
    raise RuntimeError("Supabase storage credentials are required")
