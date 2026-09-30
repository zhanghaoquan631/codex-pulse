import json
import sys
import tempfile
from os import path

from PIL import Image, ImageOps
from rapidocr_onnxruntime import RapidOCR


def recognize(engine: RapidOCR, image_path: str, rotation_degrees: int) -> dict:
    result, _ = engine(image_path)
    lines = result or []
    text = "\n".join(str(line[1]) for line in lines if len(line) > 1)
    confidence_values = [float(line[2]) for line in lines if len(line) > 2 and isinstance(line[2], (int, float))]
    confidence = (sum(confidence_values) / len(confidence_values) * 100) if confidence_values else 0
    return {"text": text, "confidence": confidence, "rotationDegrees": rotation_degrees}


def main() -> None:
    engine = RapidOCR()
    source_path = sys.argv[1]
    try:
        image = ImageOps.exif_transpose(Image.open(source_path)).convert("RGB")
        # Phone photos can be sideways even when EXIF is missing. Running all
        # orthogonal orientations lets the Node layer choose the most receipt-like result.
        image = ImageOps.autocontrast(image, cutoff=1)
        image.thumbnail((3200, 3200))
        variants = []
        with tempfile.TemporaryDirectory(prefix="mezip-ocr-") as directory:
            for rotation_degrees in (0, 90, 180, 270):
                candidate = image.rotate(rotation_degrees, expand=True)
                candidate_path = path.join(directory, f"receipt-{rotation_degrees}.png")
                candidate.save(candidate_path, format="PNG", optimize=True)
                variants.append(recognize(engine, candidate_path, rotation_degrees))
    except Exception:
        # Some uncommon phone formats cannot be decoded by Pillow. Preserve the
        # existing direct-RapidOCR path instead of rejecting a usable image.
        variants = [recognize(engine, source_path, 0)]
    # Use ASCII JSON escapes so Windows child-process encoding cannot corrupt
    # Chinese OCR text before Node parses it back into Unicode.
    print(json.dumps({"variants": variants}, ensure_ascii=True))


if __name__ == "__main__":
    main()
