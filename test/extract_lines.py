"""Extract text lines per page from fixture PDFs (simulates pdf.js text layer -> lines)."""
import json, os
from pypdf import PdfReader
OUT = os.path.join(os.path.dirname(__file__), 'fixtures')
result = {}
for fn in sorted(os.listdir(OUT)):
    if not fn.endswith('.pdf'): continue
    pages = []
    for page in PdfReader(os.path.join(OUT, fn)).pages:
        text = page.extract_text() or ""
        pages.append([l for l in text.split('\n') if l.strip()])
    result[fn] = pages
with open(os.path.join(OUT, 'extracted_lines.json'), 'w') as f:
    json.dump(result, f)
print({k: sum(len(p) for p in v) for k, v in result.items()})
