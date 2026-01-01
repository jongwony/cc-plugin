#!/usr/bin/env bash
#
# NotebookLM Enterprise API Helper Script
# Usage: notebooklm-api.sh <command> [args...]
#

set -euo pipefail

# Configuration
: "${PROJECT_NUMBER:?Error: PROJECT_NUMBER environment variable is required}"
: "${LOCATION:=global}"
: "${ENDPOINT_LOCATION:=global}"

BASE_URL="https://${ENDPOINT_LOCATION}-discoveryengine.googleapis.com/v1alpha/projects/${PROJECT_NUMBER}/locations/${LOCATION}"

# Get access token
get_token() {
  gcloud auth print-access-token
}

# Get content type from file extension
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

# Create a new notebook
cmd_create() {
  local title="${1:?Error: Notebook title required}"

  curl -s -X POST \
    -H "Authorization: Bearer $(get_token)" \
    -H "Content-Type: application/json" \
    "${BASE_URL}/notebooks" \
    -d "{\"title\": \"${title}\"}"
}

# Get notebook details
cmd_get() {
  local notebook_id="${1:?Error: Notebook ID required}"

  curl -s -X GET \
    -H "Authorization: Bearer $(get_token)" \
    -H "Content-Type: application/json" \
    "${BASE_URL}/notebooks/${notebook_id}"
}

# List recently viewed notebooks
cmd_list() {
  local page_size="${1:-50}"

  curl -s -X GET \
    -H "Authorization: Bearer $(get_token)" \
    -H "Content-Type: application/json" \
    "${BASE_URL}/notebooks:listRecentlyViewed?pageSize=${page_size}"
}

# Delete notebooks
cmd_delete() {
  local notebook_ids=("$@")

  if [[ ${#notebook_ids[@]} -eq 0 ]]; then
    echo "Error: At least one notebook ID required" >&2
    return 1
  fi

  local names=""
  for id in "${notebook_ids[@]}"; do
    names="${names}\"projects/${PROJECT_NUMBER}/locations/${LOCATION}/notebooks/${id}\","
  done
  names="[${names%,}]"

  curl -s -X POST \
    -H "Authorization: Bearer $(get_token)" \
    -H "Content-Type: application/json" \
    "${BASE_URL}/notebooks:batchDelete" \
    -d "{\"names\": ${names}}"
}

# Share notebook
cmd_share() {
  local notebook_id="${1:?Error: Notebook ID required}"
  local email="${2:?Error: Email required}"
  local role="${3:-PROJECT_ROLE_READER}"

  # Normalize role
  case "${role,,}" in
    owner) role="PROJECT_ROLE_OWNER" ;;
    writer|write) role="PROJECT_ROLE_WRITER" ;;
    reader|read) role="PROJECT_ROLE_READER" ;;
    remove|none) role="PROJECT_ROLE_NOT_SHARED" ;;
    *) role="${role}" ;;
  esac

  curl -s -X POST \
    -H "Authorization: Bearer $(get_token)" \
    -H "Content-Type: application/json" \
    "${BASE_URL}/notebooks/${notebook_id}:share" \
    -d "{\"accountAndRoles\": [{\"email\": \"${email}\", \"role\": \"${role}\"}]}"
}

# Add web source
cmd_add_web() {
  local notebook_id="${1:?Error: Notebook ID required}"
  local url="${2:?Error: URL required}"
  local name="${3:-Web Source}"

  curl -s -X POST \
    -H "Authorization: Bearer $(get_token)" \
    -H "Content-Type: application/json" \
    "${BASE_URL}/notebooks/${notebook_id}/sources:batchCreate" \
    -d "{\"userContents\": [{\"webContent\": {\"url\": \"${url}\", \"sourceName\": \"${name}\"}}]}"
}

# Add text source
cmd_add_text() {
  local notebook_id="${1:?Error: Notebook ID required}"
  local content="${2:?Error: Content required}"
  local name="${3:-Text Source}"

  curl -s -X POST \
    -H "Authorization: Bearer $(get_token)" \
    -H "Content-Type: application/json" \
    "${BASE_URL}/notebooks/${notebook_id}/sources:batchCreate" \
    -d "{\"userContents\": [{\"textContent\": {\"sourceName\": \"${name}\", \"content\": \"${content}\"}}]}"
}

# Add YouTube source
cmd_add_youtube() {
  local notebook_id="${1:?Error: Notebook ID required}"
  local url="${2:?Error: YouTube URL required}"

  curl -s -X POST \
    -H "Authorization: Bearer $(get_token)" \
    -H "Content-Type: application/json" \
    "${BASE_URL}/notebooks/${notebook_id}/sources:batchCreate" \
    -d "{\"userContents\": [{\"videoContent\": {\"url\": \"${url}\"}}]}"
}

# Add Google Drive source
cmd_add_drive() {
  local notebook_id="${1:?Error: Notebook ID required}"
  local doc_id="${2:?Error: Document ID required}"
  local mime_type="${3:?Error: MIME type required (docs or slides)}"
  local name="${4:-Google Drive Source}"

  case "${mime_type,,}" in
    docs|document) mime_type="application/vnd.google-apps.document" ;;
    slides|presentation) mime_type="application/vnd.google-apps.presentation" ;;
    *) mime_type="${mime_type}" ;;
  esac

  curl -s -X POST \
    -H "Authorization: Bearer $(get_token)" \
    -H "Content-Type: application/json" \
    "${BASE_URL}/notebooks/${notebook_id}/sources:batchCreate" \
    -d "{\"userContents\": [{\"googleDriveContent\": {\"documentId\": \"${doc_id}\", \"mimeType\": \"${mime_type}\", \"sourceName\": \"${name}\"}}]}"
}

# Upload file
cmd_upload() {
  local notebook_id="${1:?Error: Notebook ID required}"
  local file_path="${2:?Error: File path required}"
  local display_name="${3:-$(basename "${file_path}")}"

  if [[ ! -f "${file_path}" ]]; then
    echo "Error: File not found: ${file_path}" >&2
    return 1
  fi

  local content_type
  content_type=$(get_content_type "${file_path}")

  curl -s -X POST \
    --data-binary "@${file_path}" \
    -H "Authorization: Bearer $(get_token)" \
    -H "X-Goog-Upload-File-Name: ${display_name}" \
    -H "X-Goog-Upload-Protocol: raw" \
    -H "Content-Type: ${content_type}" \
    "https://${ENDPOINT_LOCATION}-discoveryengine.googleapis.com/upload/v1alpha/projects/${PROJECT_NUMBER}/locations/${LOCATION}/notebooks/${notebook_id}/sources:uploadFile"
}

# Get source
cmd_get_source() {
  local notebook_id="${1:?Error: Notebook ID required}"
  local source_id="${2:?Error: Source ID required}"

  curl -s -X GET \
    -H "Authorization: Bearer $(get_token)" \
    -H "Content-Type: application/json" \
    "${BASE_URL}/notebooks/${notebook_id}/sources/${source_id}"
}

# Delete sources
cmd_delete_sources() {
  local notebook_id="${1:?Error: Notebook ID required}"
  shift
  local source_ids=("$@")

  if [[ ${#source_ids[@]} -eq 0 ]]; then
    echo "Error: At least one source ID required" >&2
    return 1
  fi

  local names=""
  for id in "${source_ids[@]}"; do
    names="${names}\"projects/${PROJECT_NUMBER}/locations/${LOCATION}/notebooks/${notebook_id}/sources/${id}\","
  done
  names="[${names%,}]"

  curl -s -X POST \
    -H "Authorization: Bearer $(get_token)" \
    -H "Content-Type: application/json" \
    "${BASE_URL}/notebooks/${notebook_id}/sources:batchDelete" \
    -d "{\"names\": ${names}}"
}

# Print usage
usage() {
  cat <<EOF
NotebookLM Enterprise API Helper

Usage: $(basename "$0") <command> [args...]

Environment Variables:
  PROJECT_NUMBER    GCP project number (required)
  LOCATION          Data store location (default: global)
  ENDPOINT_LOCATION Multi-region prefix (default: global)

Commands:
  Notebook Management:
    create <title>                          Create a new notebook
    get <notebook_id>                       Get notebook details
    list [page_size]                        List recently viewed notebooks
    delete <notebook_id> [more_ids...]      Delete notebooks
    share <notebook_id> <email> [role]      Share notebook (role: owner|writer|reader|remove)

  Source Management:
    add-web <notebook_id> <url> [name]      Add web URL as source
    add-text <notebook_id> <content> [name] Add raw text as source
    add-youtube <notebook_id> <url>         Add YouTube video as source
    add-drive <notebook_id> <doc_id> <type> [name]
                                            Add Google Drive doc (type: docs|slides)
    upload <notebook_id> <file> [name]      Upload file as source
    get-source <notebook_id> <source_id>    Get source details
    delete-sources <notebook_id> <source_id> [more_ids...]
                                            Delete sources

Examples:
  # Create notebook
  export PROJECT_NUMBER="123456789"
  $(basename "$0") create "Research Notes"

  # Add web source
  $(basename "$0") add-web abc123 "https://example.com" "Example Article"

  # Upload PDF
  $(basename "$0") upload abc123 /path/to/document.pdf "My Document"

  # Share notebook
  $(basename "$0") share abc123 user@example.com writer
EOF
}

# Main
main() {
  local cmd="${1:-help}"
  shift || true

  case "${cmd}" in
    create)         cmd_create "$@" ;;
    get)            cmd_get "$@" ;;
    list)           cmd_list "$@" ;;
    delete)         cmd_delete "$@" ;;
    share)          cmd_share "$@" ;;
    add-web)        cmd_add_web "$@" ;;
    add-text)       cmd_add_text "$@" ;;
    add-youtube)    cmd_add_youtube "$@" ;;
    add-drive)      cmd_add_drive "$@" ;;
    upload)         cmd_upload "$@" ;;
    get-source)     cmd_get_source "$@" ;;
    delete-sources) cmd_delete_sources "$@" ;;
    help|--help|-h) usage ;;
    *)
      echo "Unknown command: ${cmd}" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
