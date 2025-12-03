import type { VercelRequest, VercelResponse } from '@vercel/node';

// Simple CSV converter (json2csv has ESM issues in serverless)
function toCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  for (const row of data) {
    const values = headers.map(h => {
      const val = row[h];
      const str = val === null || val === undefined ? '' : String(val);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\n');
}

// ==================== Types ====================
interface CivitAIModel {
  id: number;
  name: string;
  description?: string;
  type: string;
  nsfw: boolean;
  tags?: string[];
  creator?: { username: string };
  stats?: {
    downloadCount: number;
    favoriteCount: number;
    rating: number;
    ratingCount: number;
  };
  modelVersions?: Array<{
    id: number;
    name: string;
    baseModel?: string;
    trainedWords?: string[];
    createdAt?: string;
    updatedAt?: string;
    files?: Array<{
      id: number;
      name: string;
      sizeKB?: number;
    }>;
    images?: Array<{
      url: string;
    }>;
  }>;
  availability?: string;
}

interface CivitAIModelsResponse {
  items: CivitAIModel[];
  metadata: {
    totalItems?: number;
    currentPage?: number;
    pageSize?: number;
    totalPages?: number;
    nextPage?: string;
  };
}

interface HFModel {
  id: string;
  author: string;
  downloads: number;
  likes: number;
  tags: string[];
  createdAt?: string;
  siblings?: Array<{ rfilename: string }>;
}

// In-memory cache (note: this resets on each cold start in serverless)
let cachedModels: CivitAIModel[] = [];
let cachedHFModels: HFModel[] = [];

// Helper functions
function getModelDirectory(type: string): string {
  switch (type) {
    case 'Checkpoint': return 'checkpoints';
    case 'LORA': return 'loras';
    case 'TextualInversion': return 'embeddings';
    case 'Hypernetwork': return 'hypernetworks';
    case 'Controlnet': return 'controlnet';
    case 'VAE': return 'vae';
    default: return 'models';
  }
}

function getArchitecturePrefix(baseModel: string): string {
  const prefixMap: Record<string, string> = {
    'Flux.1 D': 'flux1', 'Flux.1 S': 'flux1', 'Flux.2 D': 'flux2',
    'SDXL 1.0': 'sdxl', 'SDXL 0.9': 'sdxl', 'SDXL Lightning': 'sdxl',
    'SDXL Hyper': 'sdxl', 'SDXL 1.0 LCM': 'sdxl', 'Pony': 'pony',
    'Illustrious': 'illustrious', 'NoobAI': 'noobai',
    'SD 1.5': 'sd15', 'SD 1.5 LCM': 'sd15', 'SD 1.5 Hyper': 'sd15',
    'SD 2.1': 'sd21', 'SD 2.1 768': 'sd21', 'SD 3': 'sd3', 'SD 3.5': 'sd35',
  };
  return prefixMap[baseModel] || 'unknown';
}

function sanitizeModelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { url, method } = req;
  const path = url?.split('?')[0] || '';

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CivitAI-Api-Key, X-HuggingFace-Token');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // ==================== CivitAI Routes ====================

    // GET /api/models/single/:id
    if (path.match(/^\/api\/models\/single\/\d+$/)) {
      const modelId = path.split('/').pop();
      const apiKey = req.headers['x-civitai-api-key'] as string;

      if (!apiKey) {
        return res.status(401).json({
          error: 'CivitAI API key required. Please add your API key in Settings.'
        });
      }

      const response = await fetch(`https://civitai.com/api/v1/models/${modelId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ error: 'Model not found' });
        }
        throw new Error(`CivitAI API error: ${response.status}`);
      }

      const model = await response.json();
      return res.json(model);
    }

    // GET /api/models/fetch-all
    if (path === '/api/models/fetch-all') {
      const apiKey = req.headers['x-civitai-api-key'] as string;

      if (!apiKey) {
        return res.status(401).json({
          error: 'CivitAI API key required. Please add your API key in Settings.'
        });
      }

      const query = req.query;
      const sort = (query.sort as string) || 'Most Downloaded';
      const period = (query.period as string) || 'AllTime';
      const types = (query.types as string)?.split(',') || [];
      const baseModels = (query.baseModels as string)?.split(',').filter(Boolean) || [];
      const nsfw = query.nsfw === 'true';
      const maxItems = Math.min(parseInt(query.maxItems as string) || 100, 500);

      const allModels: CivitAIModel[] = [];
      const seenIds = new Set<number>();
      let page = 1;

      while (allModels.length < maxItems) {
        const remaining = maxItems - allModels.length;
        const limit = Math.min(remaining, 100);

        const searchParams = new URLSearchParams();
        searchParams.set('limit', limit.toString());
        searchParams.set('page', page.toString());
        searchParams.set('sort', sort);
        searchParams.set('period', period);
        searchParams.set('nsfw', nsfw.toString());

        types.forEach((type) => searchParams.append('types', type));
        baseModels.forEach((bm) => searchParams.append('baseModels', bm));

        const apiUrl = `https://civitai.com/api/v1/models?${searchParams.toString()}`;

        const response = await fetch(apiUrl, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) {
          throw new Error(`CivitAI API error: ${response.status}`);
        }

        const data: CivitAIModelsResponse = await response.json();

        if (data.items.length === 0) break;

        for (const model of data.items) {
          if (!seenIds.has(model.id)) {
            seenIds.add(model.id);
            allModels.push(model);
          }
        }

        if (allModels.length >= maxItems || !data.metadata.nextPage) break;

        page++;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      cachedModels = allModels.slice(0, maxItems);

      return res.json({
        items: cachedModels,
        metadata: {
          totalItems: cachedModels.length,
          currentPage: 1,
          pageSize: cachedModels.length,
          totalPages: 1,
        },
      });
    }

    // GET /api/models/export
    if (path === '/api/models/export') {
      const query = req.query;
      const format = (query.format as string) || 'json';
      const modelIds = query.ids as string;

      let modelsToExport = cachedModels;

      if (modelIds) {
        const ids = modelIds.split(',').map((id) => parseInt(id));
        modelsToExport = cachedModels.filter((m) => ids.includes(m.id));
      }

      if (modelsToExport.length === 0) {
        return res.status(400).json({ error: 'No models to export. Fetch models first.' });
      }

      const timestamp = new Date().toISOString().split('T')[0];

      if (format === 'csv') {
        const flattened = modelsToExport.map((model) => {
          const latestVersion = model.modelVersions?.[0];
          return {
            id: model.id,
            name: model.name,
            type: model.type,
            creator: model.creator?.username || '',
            downloads: model.stats?.downloadCount || 0,
            rating: model.stats?.rating || 0,
            baseModel: latestVersion?.baseModel || '',
            tags: (model.tags || []).join(', '),
            url: `https://civitai.com/models/${model.id}`,
          };
        });
        const csv = toCSV(flattened);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=models_${timestamp}.csv`);
        return res.send(csv);
      }

      // JSON export
      const formattedModels = modelsToExport.map((model) => {
        const latestVersion = model.modelVersions?.[0];
        const primaryFile = latestVersion?.files?.[0];
        const previewImage = latestVersion?.images?.[0];

        if (!primaryFile) return null;

        let modelName = primaryFile.name;

        if (model.type === 'LORA' && latestVersion?.baseModel) {
          const archPrefix = getArchitecturePrefix(latestVersion.baseModel);
          const cleanName = sanitizeModelName(model.name);
          modelName = `${archPrefix}-${cleanName}.safetensors`;
        }

        const result: { model_name: string; url: string; directory: string; preview_url?: string } = {
          model_name: modelName,
          url: `https://civitai.com/api/download/models/${latestVersion!.id}`,
          directory: getModelDirectory(model.type),
        };

        if (previewImage?.url) {
          result.preview_url = previewImage.url;
        }

        return result;
      }).filter(Boolean);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=models_${timestamp}.json`);
      return res.send(JSON.stringify({ models: formattedModels }, null, 2));
    }

    // ==================== HuggingFace Routes ====================

    // GET /api/huggingface/models
    if (path === '/api/huggingface/models') {
      const query = req.query;
      const token = req.headers['x-huggingface-token'] as string;
      const sort = (query.sort as string) || 'downloads';
      const limit = Math.min(parseInt(query.limit as string) || 50, 100);
      const search = query.search as string;
      const author = query.author as string;
      const filter = query.filter as string;

      const params = new URLSearchParams();
      params.set('sort', sort);
      params.set('direction', '-1');
      params.set('limit', limit.toString());

      if (search) params.set('search', search);
      if (author) params.set('author', author);
      if (filter) {
        filter.split(',').forEach((f) => params.append('filter', f.trim()));
      }

      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`https://huggingface.co/api/models?${params.toString()}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error(`HuggingFace API error: ${response.status}`);
      }

      const models: HFModel[] = await response.json();
      cachedHFModels = models;

      return res.json({
        items: models,
        metadata: { totalItems: models.length },
      });
    }

    // GET /api/huggingface/models/export
    if (path === '/api/huggingface/models/export') {
      const query = req.query;
      const format = (query.format as string) || 'json';
      const modelIds = query.ids as string;

      let modelsToExport = cachedHFModels;

      if (modelIds) {
        const ids = modelIds.split(',');
        modelsToExport = cachedHFModels.filter((m) => ids.includes(m.id));
      }

      if (modelsToExport.length === 0) {
        return res.status(400).json({ error: 'No models to export.' });
      }

      const timestamp = new Date().toISOString().split('T')[0];

      if (format === 'csv') {
        const flattened = modelsToExport.map((m) => ({
          id: m.id,
          author: m.author,
          downloads: m.downloads,
          likes: m.likes,
          tags: m.tags.join(', '),
          url: `https://huggingface.co/${m.id}`,
        }));
        const csv = toCSV(flattened);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=hf_models_${timestamp}.csv`);
        return res.send(csv);
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=hf_models_${timestamp}.json`);
      return res.send(JSON.stringify({ models: modelsToExport }, null, 2));
    }

    // 404 for unmatched routes
    return res.status(404).json({ error: 'Not found', path });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
