import io

import pytest
from fastapi import HTTPException, UploadFile
from PIL import Image
from starlette.datastructures import Headers

from app.storage import validate_image


def upload(image_format, media_type):
    body = io.BytesIO()
    Image.new("RGB", (32, 24), "gold").save(body, image_format)
    body.seek(0)
    return UploadFile(body, headers=Headers({"content-type": media_type}))


@pytest.mark.parametrize("image_format, media_type", [
    ("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp"),
])
def test_supported_upload_formats_are_reencoded_as_jpeg(image_format, media_type):
    with Image.open(io.BytesIO(validate_image(upload(image_format, media_type)))) as image:
        assert image.format == "JPEG"
        assert image.size == (32, 24)


def test_upload_does_not_invoke_unsupported_decoder(monkeypatch):
    photo = upload("BMP", "image/png")

    def unexpected_decoder(*args):
        pytest.fail("The upload must be rejected before invoking the BMP decoder")

    monkeypatch.setitem(Image.OPEN, "BMP", (unexpected_decoder, Image.OPEN["BMP"][1]))
    with pytest.raises(HTTPException) as response:
        validate_image(photo)
    assert response.value.status_code == 422
