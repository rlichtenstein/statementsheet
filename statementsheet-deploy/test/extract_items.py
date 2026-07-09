"""Extract positioned text items per page (same shape pdf.js getTextContent provides)."""
import json, os
from pypdf import PdfReader
OUT = os.path.join(os.path.dirname(__file__), 'fixtures')
result = {}
for fn in sorted(os.listdir(OUT)):
    if not fn.endswith('.pdf'): continue
    pages = []
    for page in PdfReader(os.path.join(OUT, fn)).pages:
        items = []
        def visitor(text, cm, tm, font_dict, font_size):
            if text and text.strip():
                items.append({"str": text, "x": tm[4], "y": tm[5]})
        page.extract_text(visitor_text=visitor)
        pages.append(items)
    result[fn] = pages
with open(os.path.join(OUT, 'extracted_items.json'), 'w') as f:
    json.dump(result, f)
print({k: sum(len(p) for p in v) for k, v in result.items()})
