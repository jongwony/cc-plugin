# Supported File Formats for NotebookLM

Complete reference of supported content types for file uploads.

## Document Formats

| Extension | Content Type | Description |
|-----------|--------------|-------------|
| `.pdf` | `application/pdf` | PDF documents |
| `.txt` | `text/plain` | Plain text files |
| `.md` | `text/markdown` | Markdown files |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Microsoft Word |
| `.pptx` | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | Microsoft PowerPoint |
| `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | Microsoft Excel |

## Audio Formats

| Extension | Content Type |
|-----------|--------------|
| `.3g2` | `audio/3gpp2` |
| `.3gp` | `audio/3gpp` |
| `.aac` | `audio/aac` |
| `.aif` | `audio/aiff` |
| `.aifc` | `audio/aiff` |
| `.aiff` | `audio/aiff` |
| `.amr` | `audio/amr` |
| `.au` | `audio/basic` |
| `.avi` | `video/x-msvideo` |
| `.cda` | `application/x-cdf` |
| `.m4a` | `audio/m4a` |
| `.mid` | `audio/midi` |
| `.midi` | `audio/midi` |
| `.mp3` | `audio/mpeg` |
| `.mp4` | `video/mp4` |
| `.mpeg` | `audio/mpeg` |
| `.ogg` | `audio/ogg` |
| `.opus` | `audio/ogg` |
| `.ra` | `audio/vnd.rn-realaudio` |
| `.ram` | `audio/vnd.rn-realaudio` |
| `.snd` | `audio/basic` |
| `.wav` | `audio/wav` |
| `.weba` | `audio/webm` |
| `.wma` | `audio/x-ms-wma` |

## Image Formats

| Extension | Content Type |
|-----------|--------------|
| `.png` | `image/png` |
| `.jpg` | `image/jpg` |
| `.jpeg` | `image/jpeg` |

## Google Workspace Formats

These are added via `googleDriveContent`, not file upload:

| Type | MIME Type |
|------|-----------|
| Google Docs | `application/vnd.google-apps.document` |
| Google Slides | `application/vnd.google-apps.presentation` |

## Content Type Detection

When uploading files, use the appropriate `Content-Type` header:

```bash
# PDF
-H "Content-Type: application/pdf"

# Plain text
-H "Content-Type: text/plain"

# Markdown
-H "Content-Type: text/markdown"

# Word document
-H "Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document"

# PowerPoint
-H "Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation"

# Excel
-H "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# MP3
-H "Content-Type: audio/mpeg"

# PNG image
-H "Content-Type: image/png"
```

## File Size Limits

While specific limits may vary, general guidelines:
- Documents: Up to 500,000 characters
- Audio files: Up to 200MB
- Images: Standard web image sizes

Check current limits in the [official documentation](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs).

## Bash Helper Function

Detect content type from file extension:

```bash
get_content_type() {
  local file="$1"
  local ext="${file##*.}"

  case "${ext,,}" in
    pdf) echo "application/pdf" ;;
    txt) echo "text/plain" ;;
    md)  echo "text/markdown" ;;
    docx) echo "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ;;
    pptx) echo "application/vnd.openxmlformats-officedocument.presentationml.presentation" ;;
    xlsx) echo "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ;;
    mp3) echo "audio/mpeg" ;;
    wav) echo "audio/wav" ;;
    m4a) echo "audio/m4a" ;;
    ogg) echo "audio/ogg" ;;
    png) echo "image/png" ;;
    jpg|jpeg) echo "image/jpeg" ;;
    *) echo "application/octet-stream" ;;
  esac
}

# Usage
CONTENT_TYPE=$(get_content_type "/path/to/file.pdf")
echo "Content-Type: $CONTENT_TYPE"
```
