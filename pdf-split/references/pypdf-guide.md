# pypdf Quick Reference

## Installation

```python
# /// script
# dependencies = ["pypdf"]
# ///
```

Or via pip: `pip install pypdf`

## Basic Operations

### Read PDF

```python
from pypdf import PdfReader

reader = PdfReader("document.pdf")
print(f"Pages: {len(reader.pages)}")
```

### Extract Text

```python
# Single page
text = reader.pages[0].extract_text()

# All pages
full_text = ""
for page in reader.pages:
    full_text += page.extract_text()
```

### Access Metadata

```python
meta = reader.metadata
print(f"Title: {meta.title}")
print(f"Author: {meta.author}")
print(f"Subject: {meta.subject}")
print(f"Creator: {meta.creator}")
```

### Extract Outline/Bookmarks

```python
def print_outline(outline, level=0):
    for item in outline:
        if isinstance(item, list):
            print_outline(item, level + 1)
        else:
            page = reader.get_destination_page_number(item) + 1
            print(f"{'  ' * level}{item.title} (page {page})")

if reader.outline:
    print_outline(reader.outline)
```

## Writing PDFs

### Create New PDF

```python
from pypdf import PdfWriter

writer = PdfWriter()
```

### Add Pages from Existing PDF

```python
reader = PdfReader("source.pdf")
writer = PdfWriter()

# Add single page
writer.add_page(reader.pages[0])

# Add page range
for i in range(5, 10):
    writer.add_page(reader.pages[i])

# Save
with open("output.pdf", "wb") as f:
    writer.write(f)
```

### Merge Multiple PDFs

```python
writer = PdfWriter()

for pdf_file in ["doc1.pdf", "doc2.pdf", "doc3.pdf"]:
    reader = PdfReader(pdf_file)
    for page in reader.pages:
        writer.add_page(page)

with open("merged.pdf", "wb") as f:
    writer.write(f)
```

### Split PDF by Pages

```python
reader = PdfReader("input.pdf")

# One file per page
for i, page in enumerate(reader.pages):
    writer = PdfWriter()
    writer.add_page(page)
    with open(f"page_{i+1}.pdf", "wb") as f:
        writer.write(f)
```

### Split by Page Range

```python
def extract_pages(input_path, output_path, start, end):
    """Extract pages start to end (1-indexed, inclusive)."""
    reader = PdfReader(input_path)
    writer = PdfWriter()

    for i in range(start - 1, min(end, len(reader.pages))):
        writer.add_page(reader.pages[i])

    with open(output_path, "wb") as f:
        writer.write(f)
```

## Page Manipulation

### Rotate Page

```python
page = reader.pages[0]
page.rotate(90)  # Clockwise: 90, 180, 270
writer.add_page(page)
```

### Crop Page

```python
page = reader.pages[0]
page.mediabox.left = 50
page.mediabox.bottom = 50
page.mediabox.right = 550
page.mediabox.top = 750
```

### Scale Page

```python
page = reader.pages[0]
page.scale_by(0.5)  # 50% scale
# or
page.scale_to(width=400, height=600)
```

## Security

### Password Protected PDF

```python
# Reading
reader = PdfReader("encrypted.pdf")
if reader.is_encrypted:
    reader.decrypt("password")

# Writing with password
writer = PdfWriter()
writer.add_page(reader.pages[0])
writer.encrypt("user_password", "owner_password")
with open("protected.pdf", "wb") as f:
    writer.write(f)
```

## Common Patterns

### Search for Text Pattern

```python
import re

pattern = r"Chapter\s+\d+"
for i, page in enumerate(reader.pages):
    text = page.extract_text()
    if text and re.search(pattern, text, re.IGNORECASE):
        print(f"Found on page {i + 1}")
```

### Extract Pages Containing Pattern

```python
def find_pages_with_pattern(reader, pattern):
    results = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if re.search(pattern, text, re.IGNORECASE):
            results.append(i + 1)
    return results
```

### Batch Process Multiple PDFs

```python
import glob
import os

for pdf_file in glob.glob("input/*.pdf"):
    reader = PdfReader(pdf_file)
    # Process...
    output_name = os.path.basename(pdf_file).replace(".pdf", "_processed.pdf")
    # Save...
```

## Error Handling

```python
from pypdf.errors import PdfReadError

try:
    reader = PdfReader("document.pdf")
except PdfReadError as e:
    print(f"Invalid PDF: {e}")
except FileNotFoundError:
    print("File not found")
```

## Performance Tips

1. **Large PDFs**: Process pages in chunks, don't load all at once
2. **Text extraction**: Use `page.extract_text()` sparingly on large docs
3. **Memory**: Create new PdfWriter for each output file, don't reuse
4. **Validation**: Check `len(reader.pages)` before accessing indices

## Alternative Tools

| Tool | Use Case |
|------|----------|
| `qpdf` (CLI) | Fast merging/splitting, repair corrupted PDFs |
| `pdfplumber` | Better table extraction |
| `pypdfium2` | PDF rendering to images |
| `pdf2image` | Convert PDF pages to images |
