#!/usr/bin/env bash
# يبني الطبعات الثلاث من أجزاء المتن: الصفحة الرقمية، وPDF، وWord
set -euo pipefail
cd "$(dirname "$0")"
cat ../parts/*.html > sanaa-book.html
python3 extract.py              # يحوّل المتن إلى كتل ويُخرج الأشكال صوراً
NODE_PATH=$(npm root -g) node build_docx.js
python3 make_pdf.py
cp sanaa-book.html ../../book/index.html
cp sanaa-book.pdf  ../../dist/kitab-alsanaa.pdf
cp sanaa-book.docx ../../dist/kitab-alsanaa.docx
rm -f fig*.png figsrc.html blocks.json sanaa-book.*
echo "تم البناء"
