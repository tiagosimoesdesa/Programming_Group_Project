import io
import threading
import time
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
SIGNED_URL_SECONDS = 600
SIGNED_URL_CACHE_SECONDS = 540
_storage_client = httpx.Client()
_signed_urls: dict[str, tuple[float, str]] = {}
_signed_urls_lock = threading.Lock()
_signing_lock = threading.Lock()


def validate_image(upload: UploadFile) -> bytes:
    raw = upload.file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "Each photo must be smaller than 5 MB")
    if upload.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(415, "Use a JPEG, PNG, or WebP photo")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw), formats=("JPEG", "PNG", "WEBP")) as im:
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
    with _signed_urls_lock:
        _signed_urls.pop(key, None)
    if settings.storage_mode == "local":
        path = local_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    else:
        try:
            r = _storage_client.post(f"{settings.supabase_url}/storage/v1/object/{settings.supabase_bucket}/{key}", headers={**headers(), "Content-Type": "image/jpeg"}, content=data, timeout=30)
            r.raise_for_status()
        except httpx.HTTPError:
            raise HTTPException(503, "Photo storage is unavailable. Your capture can be retried.")


def remove(key: str):
    with _signed_urls_lock:
        _signed_urls.pop(key, None)
    if settings.storage_mode == "local":
        local_path(key).unlink(missing_ok=True)
    else:
        try:
            _storage_client.request("DELETE", f"{settings.supabase_url}/storage/v1/object/{settings.supabase_bucket}", headers=headers(), json={"prefixes": [key]}, timeout=15).raise_for_status()
        except httpx.HTTPError:
            import logging
            logging.getLogger(__name__).warning("Could not clean up storage object %s", key)


def prime_photo_urls(keys):
    unique = list(dict.fromkeys(key for key in keys if key))
    if not unique:
        return

    def missing_urls():
        now = time.monotonic()
        return [key for key in unique if key not in _signed_urls or _signed_urls[key][0] <= now]

    with _signed_urls_lock:
        if not missing_urls():
            return
    # Coalesce cache misses while letting cached reads and uploads continue.
    with _signing_lock:
        now = time.monotonic()
        with _signed_urls_lock:
            if len(_signed_urls) > 1024:
                expired = [key for key, value in _signed_urls.items() if value[0] <= now]
                for key in expired:
                    _signed_urls.pop(key, None)
            missing = missing_urls()
        if not missing:
            return
        expires = now + SIGNED_URL_CACHE_SECONDS
        if settings.storage_mode == "local":
            with _signed_urls_lock:
                for key in missing:
                    token = encode(key, "photo", SIGNED_URL_SECONDS)
                    _signed_urls[key] = (expires, f"{settings.public_url}/media?token={quote(token)}")
            return
        try:
            response = _storage_client.post(
                f"{settings.supabase_url}/storage/v1/object/sign/{settings.supabase_bucket}",
                headers=headers(),
                json={"expiresIn": SIGNED_URL_SECONDS, "paths": missing},
                timeout=15,
            )
            response.raise_for_status()
            results = response.json()
            if not isinstance(results, list) or len(results) != len(missing):
                raise ValueError("Unexpected signed URL response")
            requested = set(missing)
            signed_urls = {}
            for index, item in enumerate(results):
                if not isinstance(item, dict):
                    raise ValueError("Unexpected signed URL entry")
                key = item.get("path") or missing[index]
                signed = item.get("signedURL")
                if (
                    item.get("error") or not isinstance(signed, str) or not signed.startswith("/")
                    or not isinstance(key, str) or key not in requested or key in signed_urls
                ):
                    raise ValueError("A photo URL could not be signed")
                signed_urls[key] = (expires, f"{settings.supabase_url}/storage/v1{signed}")
            with _signed_urls_lock:
                _signed_urls.update(signed_urls)
        except (httpx.HTTPError, KeyError, TypeError, ValueError):
            raise HTTPException(503, "Photo storage is temporarily unavailable")


def photo_url(key: str | None):
    if not key:
        return None
    with _signed_urls_lock:
        cached = _signed_urls.get(key)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    prime_photo_urls([key])
    try:
        with _signed_urls_lock:
            return _signed_urls[key][1]
    except KeyError:
        raise HTTPException(503, "Photo storage is temporarily unavailable")
