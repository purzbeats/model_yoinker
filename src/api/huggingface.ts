// HuggingFace API Types and Client

export interface HFModel {
  _id: string;
  id: string;
  modelId: string;
  author: string;
  downloads: number;
  likes: number;
  private: boolean;
  tags: string[];
  createdAt: string;
  lastModified?: string;
  pipeline_tag?: string;
  library_name?: string;
  siblings?: HFFile[];
}

export interface HFFile {
  rfilename: string;
  size?: number;
  lfs?: {
    sha256: string;
    size: number;
  };
}

export interface HFModelDetailed extends HFModel {
  siblings: HFFile[];
  description?: string;
}

export interface FetchHFModelsParams {
  search?: string;
  author?: string;
  filter?: string[];  // Tags to filter by
  sort?: 'downloads' | 'likes' | 'lastModified' | 'createdAt';
  direction?: '1' | '-1';
  limit?: number;
}

const BASE_URL = 'https://huggingface.co/api';

export class HuggingFaceClient {
  private token: string | undefined;

  constructor(token?: string) {
    this.token = token;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async fetchModels(params: FetchHFModelsParams = {}): Promise<HFModel[]> {
    const searchParams = new URLSearchParams();

    if (params.search) searchParams.set('search', params.search);
    if (params.author) searchParams.set('author', params.author);
    if (params.sort) searchParams.set('sort', params.sort);
    if (params.direction) searchParams.set('direction', params.direction);
    if (params.limit) searchParams.set('limit', params.limit.toString());

    // Handle multiple filter tags
    if (params.filter && params.filter.length > 0) {
      params.filter.forEach((tag) => searchParams.append('filter', tag));
    }

    const url = `${BASE_URL}/models?${searchParams.toString()}`;
    console.log(`HuggingFace Fetching: ${url}`);

    const response = await fetch(url, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async fetchModelDetails(modelId: string): Promise<HFModelDetailed> {
    const url = `${BASE_URL}/models/${modelId}`;

    const response = await fetch(url, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Fetch models with file details (slower but includes file list)
  async fetchModelsWithFiles(
    params: FetchHFModelsParams = {},
    maxItems: number = 50
  ): Promise<HFModelDetailed[]> {
    const models = await this.fetchModels({ ...params, limit: maxItems });
    const detailed: HFModelDetailed[] = [];

    for (const model of models.slice(0, maxItems)) {
      try {
        const details = await this.fetchModelDetails(model.id);
        detailed.push(details);
        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Failed to fetch details for ${model.id}:`, error);
        // Include basic model info without file details
        detailed.push({ ...model, siblings: [] });
      }
    }

    return detailed;
  }

  // Get download URL for a file in a model repo
  static getDownloadUrl(modelId: string, filename: string): string {
    return `https://huggingface.co/${modelId}/resolve/main/${filename}`;
  }

  // Extract base model from tags (e.g., "base_model:black-forest-labs/FLUX.1-dev")
  static extractBaseModel(tags: string[]): string | null {
    const baseModelTag = tags.find((t) => t.startsWith('base_model:') && !t.includes(':adapter:') && !t.includes(':finetune:'));
    if (baseModelTag) {
      return baseModelTag.replace('base_model:', '');
    }
    return null;
  }

  // Determine architecture from tags/base model
  static detectArchitecture(tags: string[]): string {
    const tagsLower = tags.map((t) => t.toLowerCase());
    let baseModel = HuggingFaceClient.extractBaseModel(tags)?.toLowerCase() || '';
    // Strip quantized: and merge: prefixes
    baseModel = baseModel.replace('quantized:', '').replace('merge:', '');

    // Z-Image Turbo
    if (baseModel.includes('z-image-turbo') || baseModel.includes('zimage') || tagsLower.some((t) => t.includes('z-image'))) {
      return 'Z-Image Turbo';
    }

    // HiDream
    if (baseModel.includes('hidream') || tagsLower.some((t) => t.includes('hidream'))) {
      return 'HiDream';
    }

    // Qwen variants (check specific ones first)
    if (baseModel.includes('qwen/qwen-image-edit-2509') || baseModel.includes('qwen-image-edit-2509')) {
      return 'Qwen Image Edit 2509';
    }
    if (baseModel.includes('qwen/qwen-image-edit') || baseModel.includes('qwen-image-edit')) {
      return 'Qwen Image Edit';
    }
    if (baseModel.includes('qwen/qwen-image') || baseModel.includes('qwen-image')) {
      return 'Qwen Image';
    }
    if (baseModel.includes('qwen') || tagsLower.some((t) => t.includes('qwen'))) {
      return 'Qwen';
    }

    // Flux variants
    if (baseModel.includes('flux.1-kontext')) {
      return 'Flux.1 Kontext';
    }
    if (baseModel.includes('flux.1-fill')) {
      return 'Flux.1 Fill';
    }
    if (baseModel.includes('flux.1-schnell')) {
      return 'Flux.1 Schnell';
    }
    if (baseModel.includes('flux.1-dev') || baseModel.includes('flux.1 d')) {
      return 'Flux.1 Dev';
    }
    if (baseModel.includes('flux') || tagsLower.some((t) => t.includes('flux'))) {
      return 'Flux.1';
    }

    // Wan Video variants
    if (baseModel.includes('wan2.2') || baseModel.includes('wan-2.2')) {
      return 'Wan 2.2';
    }
    if (baseModel.includes('wan2.1') || baseModel.includes('wan-2.1')) {
      return 'Wan 2.1';
    }
    if (baseModel.includes('wan') || tagsLower.some((t) => t.includes('wan-ai'))) {
      return 'Wan Video';
    }

    // NoobAI (before Illustrious since it's based on it)
    if (baseModel.includes('noobai') || tagsLower.some((t) => t.includes('noobai'))) {
      return 'NoobAI';
    }

    // Illustrious variants
    if (baseModel.includes('illustrious-xl-v2') || baseModel.includes('illustrious-xl-v1')) {
      return 'Illustrious XL';
    }
    if (baseModel.includes('illustrious') || tagsLower.some((t) => t.includes('illustrious'))) {
      return 'Illustrious';
    }

    // Pony
    if (baseModel.includes('pony') || tagsLower.some((t) => t.includes('pony'))) {
      return 'Pony';
    }

    // CogVideoX
    if (baseModel.includes('cogvideo') || tagsLower.some((t) => t.includes('cogvideo'))) {
      return 'CogVideoX';
    }

    // HunyuanVideo
    if (baseModel.includes('hunyuanvideo') || tagsLower.some((t) => t.includes('hunyuan'))) {
      return 'HunyuanVideo';
    }

    // AuraFlow
    if (baseModel.includes('auraflow') || tagsLower.some((t) => t.includes('auraflow'))) {
      return 'AuraFlow';
    }

    // SD 3.5
    if (baseModel.includes('stable-diffusion-3.5') || baseModel.includes('sd-3.5') || tagsLower.some((t) => t.includes('sd3.5') || t.includes('sd-3.5'))) {
      return 'SD 3.5';
    }

    // SD 3
    if (baseModel.includes('stable-diffusion-3') || baseModel.includes('sd-3') || tagsLower.some((t) => t.includes('sd3') || t.includes('sd-3'))) {
      return 'SD 3';
    }

    // SDXL variants
    if (baseModel.includes('sdxl') || baseModel.includes('stable-diffusion-xl') || tagsLower.some((t) => t.includes('sdxl'))) {
      return 'SDXL';
    }

    // SD 1.5
    if (baseModel.includes('stable-diffusion-v1') || baseModel.includes('sd-v1') || tagsLower.some((t) => t.includes('sd-1') || t.includes('sd1') || t.includes('stable-diffusion-v1'))) {
      return 'SD 1.5';
    }

    // SD 2.x
    if (baseModel.includes('stable-diffusion-v2') || baseModel.includes('sd-v2') || tagsLower.some((t) => t.includes('sd-2') || t.includes('sd2') || t.includes('stable-diffusion-v2'))) {
      return 'SD 2.1';
    }

    return 'Other';
  }

  // Check if model is a LoRA
  static isLoRA(model: HFModel): boolean {
    const tagsLower = model.tags.map((t) => t.toLowerCase());
    return tagsLower.some((t) => t === 'lora' || t.includes('adapter'));
  }

  // Get safetensor files from model
  static getSafetensorFiles(model: HFModelDetailed): HFFile[] {
    return (model.siblings || []).filter((f) =>
      f.rfilename.endsWith('.safetensors')
    );
  }
}
