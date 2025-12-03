import { Router, Request, Response } from 'express';
import { Parser } from 'json2csv';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { CivitAIClient } from '../api/civitai.js';
import type { FetchModelsParams, ModelType, CivitAIModel } from '../types/models.js';

const router = Router();

// In-memory cache of last fetched results
let cachedModels: CivitAIModel[] = [];

// GET /api/models/single/:id - Fetch a single model by ID
router.get('/models/single/:id', async (req: Request, res: Response) => {
  try {
    const modelId = req.params.id;

    if (!modelId || isNaN(parseInt(modelId))) {
      return res.status(400).json({ error: 'Invalid model ID' });
    }

    // Use API key from header first, fall back to env var
    const apiKey = req.headers['x-civitai-api-key'] as string || process.env.CIVITAI_API_KEY;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`https://civitai.com/api/v1/models/${modelId}`, {
      headers,
    });

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: 'Model not found' });
      }
      throw new Error(`CivitAI API error: ${response.status} ${response.statusText}`);
    }

    const model = await response.json();
    return res.json(model);
  } catch (error) {
    console.error('Error fetching single model:', error);
    res.status(500).json({ error: 'Failed to fetch model from CivitAI' });
  }
});

// GET /api/models - Fetch models from CivitAI
router.get('/models', async (req: Request, res: Response) => {
  try {
    // Use API key from header first, fall back to env var
    const apiKey = req.headers['x-civitai-api-key'] as string || process.env.CIVITAI_API_KEY;
    const client = new CivitAIClient(apiKey);

    const params: FetchModelsParams = {
      limit: Math.min(parseInt(req.query.limit as string) || 100, 100),
      page: parseInt(req.query.page as string) || 1,
      sort: (req.query.sort as FetchModelsParams['sort']) || 'Most Downloaded',
      period: (req.query.period as FetchModelsParams['period']) || 'AllTime',
    };

    // Handle types filter
    if (req.query.types) {
      const typesParam = req.query.types as string;
      params.types = typesParam.split(',') as ModelType[];
    }

    if (req.query.query) {
      params.query = req.query.query as string;
    }

    if (req.query.nsfw !== undefined) {
      params.nsfw = req.query.nsfw === 'true';
    }

    const response = await client.fetchModels(params);
    cachedModels = response.items;

    res.json(response);
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models from CivitAI' });
  }
});

// GET /api/models/fetch-all - Fetch multiple pages
router.get('/models/fetch-all', async (req: Request, res: Response) => {
  try {
    // Use API key from header first, fall back to env var
    const apiKey = req.headers['x-civitai-api-key'] as string || process.env.CIVITAI_API_KEY;
    const client = new CivitAIClient(apiKey);

    const params: FetchModelsParams = {
      sort: (req.query.sort as FetchModelsParams['sort']) || 'Most Downloaded',
      period: (req.query.period as FetchModelsParams['period']) || 'AllTime',
    };

    if (req.query.types) {
      const typesParam = req.query.types as string;
      params.types = typesParam.split(',') as ModelType[];
    }

    if (req.query.baseModels) {
      const baseModelsParam = req.query.baseModels as string;
      params.baseModels = baseModelsParam.split(',');
    }

    if (req.query.nsfw !== undefined) {
      params.nsfw = req.query.nsfw === 'true';
    }

    const maxItems = Math.min(parseInt(req.query.maxItems as string) || 100, 500);

    const models = await client.fetchAllPages(params, maxItems);
    cachedModels = models;

    res.json({
      items: models,
      metadata: {
        totalItems: models.length,
        currentPage: 1,
        pageSize: models.length,
        totalPages: 1,
      },
    });
  } catch (error) {
    console.error('Error fetching all models:', error);
    res.status(500).json({ error: 'Failed to fetch models from CivitAI' });
  }
});

// Helper to get directory based on model type
function getModelDirectory(type: string): string {
  switch (type) {
    case 'Checkpoint':
      return 'checkpoints';
    case 'LORA':
      return 'loras';
    case 'TextualInversion':
      return 'embeddings';
    case 'Hypernetwork':
      return 'hypernetworks';
    case 'Controlnet':
      return 'controlnet';
    case 'VAE':
      return 'vae';
    default:
      return 'models';
  }
}

// Helper to convert baseModel to filename prefix
function getArchitecturePrefix(baseModel: string): string {
  const prefixMap: Record<string, string> = {
    'Flux.1 D': 'flux1',
    'Flux.1 S': 'flux1',
    'Flux.2 D': 'flux2',
    'SDXL 1.0': 'sdxl',
    'SDXL 0.9': 'sdxl',
    'SDXL Lightning': 'sdxl',
    'SDXL Hyper': 'sdxl',
    'SDXL 1.0 LCM': 'sdxl',
    'Pony': 'pony',
    'Illustrious': 'illustrious',
    'NoobAI': 'noobai',
    'SD 1.5': 'sd15',
    'SD 1.5 LCM': 'sd15',
    'SD 1.5 Hyper': 'sd15',
    'SD 2.1': 'sd21',
    'SD 2.1 768': 'sd21',
    'SD 3': 'sd3',
    'SD 3.5': 'sd35',
    'Wan Video 14B t2v': 'wan',
    'Wan Video 2.2 T2V-A14B': 'wan',
    'Qwen': 'qwen',
    'Qwen Image Edit 2509': 'qwen',
    'ZImageTurbo': 'zimage',
    'HiDream': 'hidream',
  };
  return prefixMap[baseModel] || 'unknown';
}

// Architecture/technical terms to strip from model names
const ARCH_TERMS_TO_STRIP = [
  // Base model architectures
  'flux', 'flux1', 'flux.1', 'flux_1', 'flux2', 'flux.2', 'flux_2',
  'sdxl', 'sd_xl', 'sd15', 'sd_15', 'sd1.5', 'sd_1_5', 'sd21', 'sd_21', 'sd2.1', 'sd_2_1',
  'sd3', 'sd_3', 'sd3.5', 'sd35', 'sd_3_5',
  'pony', 'pony_diffusion', 'ponydiffusion',
  'illustrious', 'illustrious_xl',
  'noobai', 'noob_ai', 'noob',
  'nai', 'novelai', 'novel_ai',
  'chroma', 'turbo', 'lightning', 'hyper', 'lcm',
  'hidream', 'hi_dream',
  'wan', 'wan_video',
  'qwen',
  // Model type indicators
  'lora', 'lo_ra', 'locon', 'lycoris', 'dora',
  'checkpoint', 'ckpt',
  'embedding', 'textual_inversion', 'ti',
  'controlnet', 'control_net',
  'vae',
  // Common suffixes/descriptors
  'safetensors', 'ckpt', 'pt', 'bin',
  'fp16', 'fp32', 'bf16',
  'v1', 'v2', 'v3', 'v4', 'v5', 'version',
  // ZImage specific
  'zimage', 'z_image', 'zimagexl', 'zimageturbo',
];

// Helper to strip architecture terms from model name
function stripArchitectureTerms(name: string): string {
  let cleanName = name.toLowerCase();

  // Sort by length descending so longer matches are replaced first
  const sortedTerms = [...ARCH_TERMS_TO_STRIP].sort((a, b) => b.length - a.length);

  for (const term of sortedTerms) {
    // Match the term with word boundaries or underscores/hyphens
    const patterns = [
      new RegExp(`\\b${term}\\b`, 'gi'),
      new RegExp(`[_-]${term}[_-]`, 'gi'),
      new RegExp(`^${term}[_-]`, 'gi'),
      new RegExp(`[_-]${term}$`, 'gi'),
    ];

    for (const pattern of patterns) {
      cleanName = cleanName.replace(pattern, ' ');
    }
  }

  // Clean up the result
  return cleanName
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper to create a clean filename from model name
function sanitizeModelName(name: string): string {
  // First strip architecture terms
  const strippedName = stripArchitectureTerms(name);

  // If stripping removed everything meaningful, fall back to original
  const nameToUse = strippedName.length >= 2 ? strippedName : name;

  return nameToUse
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')  // Replace non-alphanumeric with underscore
    .replace(/^_+|_+$/g, '')       // Trim leading/trailing underscores
    .replace(/_+/g, '_');          // Collapse multiple underscores
}

// Helper to format model for supported_models.json structure
function formatForSupportedModels(model: CivitAIModel) {
  const latestVersion = model.modelVersions?.[0];
  const primaryFile = latestVersion?.files?.[0];
  const previewImage = latestVersion?.images?.[0];

  if (!primaryFile) return null;

  let modelName = primaryFile.name;

  // For LoRAs, rename to architecture_prefix-descriptive_name.safetensors
  if (model.type === 'LORA' && latestVersion?.baseModel) {
    const archPrefix = getArchitecturePrefix(latestVersion.baseModel);
    const cleanName = sanitizeModelName(model.name);
    const extension = primaryFile.name.includes('.')
      ? primaryFile.name.substring(primaryFile.name.lastIndexOf('.'))
      : '.safetensors';
    modelName = `${archPrefix}-${cleanName}${extension}`;
  }

  const result: {
    model_name: string;
    url: string;
    directory: string;
    preview_url?: string;
  } = {
    model_name: modelName,
    url: `https://civitai.com/api/download/models/${latestVersion.id}`,
    directory: getModelDirectory(model.type),
  };

  // Only add preview_url if there's an image
  if (previewImage?.url) {
    result.preview_url = previewImage.url;
  }

  return result;
}

// GET /api/models/export - Export models as JSON or CSV
router.get('/models/export', async (req: Request, res: Response) => {
  try {
    const format = (req.query.format as string) || 'json';
    const modelIds = req.query.ids as string;

    let modelsToExport = cachedModels;

    // Filter by selected IDs if provided
    if (modelIds) {
      const ids = modelIds.split(',').map((id) => parseInt(id));
      modelsToExport = cachedModels.filter((m) => ids.includes(m.id));
    }

    if (modelsToExport.length === 0) {
      return res.status(400).json({ error: 'No models to export. Fetch models first.' });
    }

    const timestamp = new Date().toISOString().split('T')[0];

    if (format === 'csv') {
      // CSV keeps all the detailed/flattened data including triggers and descriptions
      const flattened = CivitAIClient.flattenModels(modelsToExport);
      const parser = new Parser();
      const csv = parser.parse(flattened);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=models_${timestamp}.csv`);
      return res.send(csv);
    }

    // JSON export uses supported_models.json structure
    const formattedModels = modelsToExport
      .map(formatForSupportedModels)
      .filter((m): m is NonNullable<typeof m> => m !== null);

    const output = {
      models: formattedModels,
    };

    // Format with 2-space indentation to match supported_models.txt structure
    const jsonString = JSON.stringify(output, null, 2);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=models_${timestamp}.json`);
    return res.send(jsonString);
  } catch (error) {
    console.error('Error exporting models:', error);
    res.status(500).json({ error: 'Failed to export models' });
  }
});

// GET /api/models/base-models - Get unique base models from cached results
router.get('/models/base-models', async (_req: Request, res: Response) => {
  try {
    const baseModels = new Set<string>();

    cachedModels.forEach((model) => {
      model.modelVersions?.forEach((version) => {
        if (version.baseModel) {
          baseModels.add(version.baseModel);
        }
      });
    });

    const sorted = Array.from(baseModels).sort();
    res.json({ baseModels: sorted });
  } catch (error) {
    console.error('Error getting base models:', error);
    res.status(500).json({ error: 'Failed to get base models' });
  }
});

// POST /api/models/save - Save models to local file
router.post('/models/save', async (req: Request, res: Response) => {
  try {
    const { models, format = 'json' } = req.body;
    const modelsToSave = models || cachedModels;

    if (!modelsToSave || modelsToSave.length === 0) {
      return res.status(400).json({ error: 'No models to save' });
    }

    const dataDir = path.join(process.cwd(), 'data');
    if (!existsSync(dataDir)) {
      await mkdir(dataDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];

    if (format === 'csv') {
      const flattened = CivitAIClient.flattenModels(modelsToSave);
      const parser = new Parser();
      const csv = parser.parse(flattened);
      const filePath = path.join(dataDir, `models_${timestamp}.csv`);
      await writeFile(filePath, csv);
      return res.json({ message: 'Saved', path: filePath });
    }

    const filePath = path.join(dataDir, `models_${timestamp}.json`);
    await writeFile(filePath, JSON.stringify(modelsToSave, null, 2));
    return res.json({ message: 'Saved', path: filePath });
  } catch (error) {
    console.error('Error saving models:', error);
    res.status(500).json({ error: 'Failed to save models' });
  }
});

export default router;
