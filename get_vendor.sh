#!/usr/bin/env bash
# Run on your machine before deploying. Downloads pdf.js (the only third-party code).
set -euo pipefail
cd "$(dirname "$0")/public/vendor"
V=3.11.174
curl -fsSLO "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/$V/pdf.min.js"
curl -fsSLO "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/$V/pdf.worker.min.js"
echo "pdf.js $V vendored:"; ls -la
