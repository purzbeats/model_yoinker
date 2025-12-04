# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Model Yoinker (civit-scraper) is a web application for fetching and browsing AI model metadata from CivitAI and HuggingFace. It provides a UI to search, filter, and export model information in JSON/CSV formats suitable for download scripts.

## Commands

```bash
# Development (with hot reload)
npm run dev

# Production start
npm start
```

Both commands run the Express server on port 3000 (or `PORT` env var).

## Architecture

### Dual Deployment Structure

The app supports both local Express server and Vercel serverless deployment:

- **Local development**: `src/server.ts` runs Express with routes from `src/routes/`
- **Vercel serverless**: `api/index.ts` is a self-contained handler that duplicates route logic (required because Vercel serverless functions can't import from `src/`)

### Key Components

```
src/
├── server.ts              # Express app entry point
├── types/models.ts        # TypeScript interfaces for CivitAI/HuggingFace responses
├── api/
│   ├── civitai.ts         # CivitAIClient class - API wrapper with pagination and rate limiting
│   └── huggingface.ts     # HuggingFaceClient class - API wrapper with architecture detection
└── routes/
    ├── models.ts          # CivitAI endpoints (/api/models, /api/models/export, etc.)
    └── huggingface.ts     # HuggingFace endpoints (/api/huggingface/models, etc.)

api/index.ts               # Standalone Vercel serverless handler (duplicates src/ logic)
public/                    # Static frontend (HTML/CSS/JS)
```

### API Clients

**CivitAIClient** (`src/api/civitai.ts`):
- Handles pagination with `fetchAllPages()` including rate limit backoff
- `flattenModel()` converts nested API response to flat structure for CSV export
- Requires API key passed via `X-CivitAI-Api-Key` header

**HuggingFaceClient** (`src/api/huggingface.ts`):
- `detectArchitecture()` infers model architecture (Flux, SDXL, Pony, etc.) from tags
- `isLoRA()` and `getSafetensorFiles()` helpers for model type detection
- Optional token via `X-HuggingFace-Token` header

### Export Format

JSON exports use a `supported_models.json` structure with:
- `model_name`: Filename (LoRAs renamed to `{arch_prefix}-{clean_name}.safetensors`)
- `url`: Direct download URL
- `directory`: Target folder based on model type (loras, checkpoints, embeddings, etc.)
- `preview_url`: Optional thumbnail

### Environment Variables

- `CIVITAI_API_KEY`: CivitAI API key (passed from frontend via header)
- `HUGGINGFACE_TOKEN`: Optional HuggingFace token
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Set to `production` on Vercel to skip `app.listen()`
