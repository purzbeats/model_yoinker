import { Router, Request, Response } from 'express';
import { Parser } from 'json2csv';
import {
  HuggingFaceClient,
  HFModelDetailed,
  FetchHFModelsParams,
} from '../api/huggingface.js';

const router = Router();

// In-memory cache of last fetched results
let cachedModels: HFModelDetailed[] = [];

// Helper to get architecture prefix for naming
function getArchitecturePrefix(arch: string): string {
  const prefixMap: Record<string, string> = {
    'Flux.1 Dev': 'flux1',
    'Flux.1 Schnell': 'flux1s',
    'Flux.1 Kontext': 'flux1k',
    'Flux.1 Fill': 'flux1f',
    'Flux.1': 'flux1',
    'Wan 2.2': 'wan22',
    'Wan 2.1': 'wan21',
    'Wan Video': 'wan',
    'Qwen Image Edit 2509': 'qwen2509',
    'Qwen Image Edit': 'qwenedit',
    'Qwen Image': 'qwenimg',
    'Qwen': 'qwen',
    'Z-Image Turbo': 'zimage',
    'HiDream': 'hidream',
    'SDXL': 'sdxl',
    'Pony': 'pony',
    'NoobAI': 'noobai',
    'Illustrious XL': 'illustrious',
    'Illustrious': 'illustrious',
    'SD 1.5': 'sd15',
    'SD 2.1': 'sd21',
    'SD 3': 'sd3',
    'SD 3.5': 'sd35',
    'CogVideoX': 'cogvideo',
    'HunyuanVideo': 'hunyuan',
    'AuraFlow': 'auraflow',
  };
  return prefixMap[arch] || 'other';
}

// Architecture to search term mapping for HuggingFace API
const architectureSearchMap: Record<string, string> = {
  'flux.1-dev': 'flux lora',
  'flux.1-kontext': 'flux kontext',
  'flux.1-schnell': 'flux schnell',
  'flux.2': 'flux.2',
  'qwen-image-edit-2509': 'qwen image edit 2509',
  'qwen-image-edit': 'qwen image edit',
  'qwen-image': 'qwen image',
  'wan': 'wan video lora',
  'cogvideo': 'cogvideo',
  'hunyuan': 'hunyuan video',
  'z-image-turbo': 'z-image turbo',
  'hidream': 'hidream',
  'sdxl': 'sdxl lora',
  'illustrious': 'illustrious',
  'noobai': 'noobai',
  'pony': 'pony diffusion',
  'sd15': 'stable diffusion 1.5 lora',
};

// GET /api/huggingface/models - Fetch models from HuggingFace
router.get('/models', async (req: Request, res: Response) => {
  try {
    // Use token from header first, fall back to env var
    const token = req.headers['x-huggingface-token'] as string || process.env.HUGGINGFACE_TOKEN;
    const client = new HuggingFaceClient(token);

    const params: FetchHFModelsParams = {
      sort: (req.query.sort as FetchHFModelsParams['sort']) || 'downloads',
      direction: '-1',
      limit: Math.min(parseInt(req.query.limit as string) || 50, 100),
    };

    // Handle architecture filter - add to search terms
    const architecture = req.query.architecture as string;
    if (architecture && architectureSearchMap[architecture]) {
      const archSearch = architectureSearchMap[architecture];
      // Combine with existing search if present
      if (req.query.search) {
        params.search = `${req.query.search} ${archSearch}`;
      } else {
        params.search = archSearch;
      }
    } else if (req.query.search) {
      params.search = req.query.search as string;
    }

    if (req.query.author) {
      params.author = req.query.author as string;
    }

    // Handle filter tags
    if (req.query.filter) {
      const filterParam = req.query.filter as string;
      params.filter = filterParam.split(',');
    }

    const fetchFiles = req.query.fetchFiles === 'true';

    let models: HFModelDetailed[];
    if (fetchFiles) {
      models = await client.fetchModelsWithFiles(params, params.limit);
    } else {
      const basicModels = await client.fetchModels(params);
      models = basicModels.map((m) => ({ ...m, siblings: [] }));
    }

    cachedModels = models;

    res.json({
      items: models,
      metadata: {
        totalItems: models.length,
      },
    });
  } catch (error) {
    console.error('Error fetching HuggingFace models:', error);
    res.status(500).json({ error: 'Failed to fetch models from HuggingFace' });
  }
});

// GET /api/huggingface/models/export - Export models
router.get('/models/export', async (req: Request, res: Response) => {
  try {
    const format = (req.query.format as string) || 'json';
    const modelIds = req.query.ids as string;

    let modelsToExport = cachedModels;

    // Filter by selected IDs if provided
    if (modelIds) {
      const ids = modelIds.split(',');
      modelsToExport = cachedModels.filter((m) => ids.includes(m.id));
    }

    if (modelsToExport.length === 0) {
      return res.status(400).json({ error: 'No models to export. Fetch models first.' });
    }

    const timestamp = new Date().toISOString().split('T')[0];

    if (format === 'csv') {
      // Flatten for CSV
      const flattened = modelsToExport.map((m) => {
        const arch = HuggingFaceClient.detectArchitecture(m.tags);
        const safetensors = HuggingFaceClient.getSafetensorFiles(m);
        return {
          id: m.id,
          author: m.author,
          downloads: m.downloads,
          likes: m.likes,
          architecture: arch,
          isLoRA: HuggingFaceClient.isLoRA(m),
          tags: m.tags.join(', '),
          files: safetensors.map((f) => f.rfilename).join(', '),
          url: `https://huggingface.co/${m.id}`,
          createdAt: m.createdAt,
        };
      });

      const parser = new Parser();
      const csv = parser.parse(flattened);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=hf_models_${timestamp}.csv`);
      return res.send(csv);
    }

    // JSON export - supported_models.json format
    const formattedModels: Array<{
      model_name: string;
      url: string;
      directory: string;
      preview_url?: string;
    }> = [];

    for (const model of modelsToExport) {
      const safetensors = HuggingFaceClient.getSafetensorFiles(model);
      const isLoRA = HuggingFaceClient.isLoRA(model);
      const arch = HuggingFaceClient.detectArchitecture(model.tags);
      const archPrefix = getArchitecturePrefix(arch);

      for (const file of safetensors) {
        let modelName = file.rfilename;

        // Rename LoRAs to follow naming convention
        if (isLoRA) {
          const cleanName = model.id
            .split('/')[1]  // Get repo name without author
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .replace(/_+/g, '_');
          modelName = `${archPrefix}-${cleanName}.safetensors`;
        }

        formattedModels.push({
          model_name: modelName,
          url: HuggingFaceClient.getDownloadUrl(model.id, file.rfilename),
          directory: isLoRA ? 'loras' : 'checkpoints',
        });
      }
    }

    const output = {
      models: formattedModels,
    };

    const jsonString = JSON.stringify(output, null, 2);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=hf_models_${timestamp}.json`);
    return res.send(jsonString);
  } catch (error) {
    console.error('Error exporting HuggingFace models:', error);
    res.status(500).json({ error: 'Failed to export models' });
  }
});

export default router;
