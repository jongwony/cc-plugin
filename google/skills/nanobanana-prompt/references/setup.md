# Nanobanana Setup & Troubleshooting

Environment configuration and common issue resolution.

---

## Environment Variables

Configure these environment variables for Vertex AI integration:

```bash
GEMINI_API_KEY=<your-api-key>
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=<your-project>
GOOGLE_CLOUD_LOCATION="global"
NANOBANANA_MODEL="gemini-3-pro-image-preview"
```

**Model Reference:**
- [Gemini 3 Pro Image Preview - Vertex AI Model Garden](https://console.cloud.google.com/vertex-ai/publishers/google/model-garden/gemini-3-pro-image-preview)

---

## Prerequisites

- Nanobanana MCP server configured and authenticated
- Node.js environment for the MCP server
- Valid Google Cloud credentials with Vertex AI access

---

## Troubleshooting

### Authentication Failures

**Symptoms:** MCP server connection errors, 401/403 responses

**Solutions:**
1. Verify nanobanana MCP server is properly configured
2. Check authentication credentials are valid
3. Ensure Google Cloud project has Vertex AI API enabled
4. Verify service account has required permissions

### Generation Failures

**Symptoms:** Image generation requests fail or timeout

**Solutions:**
1. Simplify complex prompts if needed
2. Ensure prompt doesn't contain prohibited content
3. Try alternative phrasing for the same concept
4. Check API quota limits

### Quality Issues

**Symptoms:** Generated images don't match expectations

**Solutions:**
1. **Increase specificity** - Add more descriptive details
2. **Add context** - Explain intended use (e.g., "for website hero banner")
3. **Use precise terminology** - Photography/artistic terms yield better results
4. **Iterate deliberately** - Refine prompts based on previous outputs

See `strategies.md` for detailed prompting strategies per use case.

---

## Supported Input Modes

| Mode | Description |
|------|-------------|
| Text-to-image | Generate from text prompt |
| Image editing | Edit existing image with text guidance |
| Multi-image | Compose multiple images |
| Iterative | Refine across conversation turns |

---

## API Documentation

- [Gemini API - Image Generation](https://ai.google.dev/gemini-api/docs/image-generation?hl=ko#prompt)
