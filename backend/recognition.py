"""Convert local model predictions into normalized plate results."""
import math
from statistics import mean
from time import perf_counter

from backend.image_decoder import decode_image


def confidence(value):
    if isinstance(value, (list, tuple)):
        value = mean(value) if value else 0
    value = float(value or 0)
    return round(max(0, min(1, value)), 4) if math.isfinite(value) else 0


def recognize(engine, data):
    image = decode_image(data)
    height, width = image.shape[:2]
    start = perf_counter()
    results = engine.predict(image)
    plates = []
    for result in results:
        box = result.detection.bounding_box
        x1, y1 = max(0, min(width, int(box.x1))), max(0, min(height, int(box.y1)))
        x2, y2 = max(0, min(width, int(box.x2))), max(0, min(height, int(box.y2)))
        if x2 <= x1 or y2 <= y1:
            continue
        plates.append({
            'text': result.ocr.text.strip().upper() if result.ocr else '',
            'detectionConfidence': confidence(result.detection.confidence),
            'recognitionConfidence': confidence(result.ocr.confidence) if result.ocr else 0,
            'box': {'x': x1 / width, 'y': y1 / height, 'w': (x2 - x1) / width, 'h': (y2 - y1) / height},
        })
    plates.sort(key=lambda plate: (bool(plate['text']), plate['recognitionConfidence']), reverse=True)
    return {'plates': plates, 'width': width, 'height': height, 'elapsedMs': round((perf_counter() - start) * 1000)}


