import io
import warnings
from pathlib import Path
from urllib.parse import quote
import httpx
from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from .config import settings
from .security import encode

MAX_BYTES = 5 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 20_000_000


def validate_image(upload: UploadFile) -> bytes:
    raw = upload.file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "Each photo must be smaller than 5 MB")
    if upload.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(415, "Use a JPEG, PNG, or WebP photo")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as im:
                if im.format not in {"JPEG", "PNG", "WEBP"}:
                    raise ValueError()
                im.load()
                im = im.convert("RGB")
                im.thumbnail((1600, 1600))
                output = io.BytesIO()
                im.save(output, "JPEG", quality=82)  # Re-encode and remove metadata.
                return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, "This photo could not be read. Please retake it.")


def headers():
    key = settings.supabase_admin_key
    result = {"apikey": key}
    if not key.startswith("sb_secret_"):
        result["Authorization"] = f"Bearer {key}"
    return result


def local_path(key):
    root = Path(settings.upload_dir).resolve()
    target = (root / key).resolve()
    if not target.is_relative_to(root):
        raise HTTPException(403, "Invalid photo path")
    return target


def put(key: str, data: bytes):
    if settings.storage_mode == "local":
        path = local_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    else:
        try:
            r = httpx.post(f"{settings.supabase_url}/storage/v1/object/{settings.supabase_bucket}/{key}", headers={**headers(), "Content-Type": "image/jpeg"}, content=data, timeout=30)
            r.raise_for_status()
        except httpx.HTTPError:
            raise HTTPException(503, "Photo storage is unavailable. Your capture can be retried.")


def remove(key: str):
    if settings.storage_mode == "local":
        local_path(key).unlink(missing_ok=True)
    else:
        try:
            httpx.request("DELETE", f"{settings.supabase_url}/storage/v1/object/{settings.supabase_bucket}", headers=headers(), json={"prefixes": [key]}, timeout=15).raise_for_status()
        except httpx.HTTPError:
            import logging
            logging.getLogger(__name__).warning("Could not clean up storage object %s", key)


def photo_url(key: str | None):
    if not key:
        return None
    if settings.storage_mode == "local":
        token = encode(key, "photo", 600)
        return f"{settings.public_url}/media?token={quote(token)}"
    try:
        r = httpx.post(f"{settings.supabase_url}/storage/v1/object/sign/{settings.supabase_bucket}/{key}", headers=headers(), json={"expiresIn": 600}, timeout=15)
        r.raise_for_status()
        return f"{settings.supabase_url}/storage/v1{r.json()['signedURL']}"
    except (httpx.HTTPError, KeyError):
        raise HTTPException(503, "Photo storage is temporarily unavailable")
