"""Validate and decode an uploaded photo without saving it to disk."""
from io import BytesIO
import warnings

import numpy as np
from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_PIXELS = 24_000_000


def decode_image(data):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as original:
                if original.format not in {'JPEG', 'PNG', 'WEBP'}:
                    raise HTTPException(415, 'Use a JPG, PNG, or WebP photo.')
                if original.width * original.height > MAX_PIXELS:
                    raise HTTPException(413, 'Photo exceeds 24 megapixels. Resize it and try again.')
                image = ImageOps.exif_transpose(original).convert('RGB')
                # Models use BGR, and boxes refer to this orientation-corrected image.
                return np.ascontiguousarray(np.asarray(image)[:, :, ::-1])
    except HTTPException:
        raise
    except (Image.DecompressionBombWarning, Image.DecompressionBombError):
        raise HTTPException(413, 'Photo dimensions are too large.') from None
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(400, 'This image could not be decoded. Try a different photo.') from None


