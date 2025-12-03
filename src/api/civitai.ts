import type {
  CivitAIModelsResponse,
  CivitAIModel,
  FetchModelsParams,
  FlattenedModel,
} from '../types/models.js';

const BASE_URL = 'https://civitai.com/api/v1';

export class CivitAIClient {
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async fetchModels(params: FetchModelsParams = {}): Promise<CivitAIModelsResponse> {
    const searchParams = new URLSearchParams();

    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.page) searchParams.set('page', params.page.toString());
    if (params.query) searchParams.set('query', params.query);
    if (params.tag) searchParams.set('tag', params.tag);
    if (params.username) searchParams.set('username', params.username);
    if (params.sort) searchParams.set('sort', params.sort);
    if (params.period) searchParams.set('period', params.period);
    if (params.nsfw !== undefined) searchParams.set('nsfw', params.nsfw.toString());

    // Handle multiple types
    if (params.types && params.types.length > 0) {
      params.types.forEach((type) => searchParams.append('types', type));
    }

    // Handle multiple base models
    if (params.baseModels && params.baseModels.length > 0) {
      params.baseModels.forEach((bm) => searchParams.append('baseModels', bm));
    }

    const url = `${BASE_URL}/models?${searchParams.toString()}`;
    console.log(`Fetching: ${url}`);

    const response = await fetch(url, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`CivitAI API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async fetchAllPages(
    params: FetchModelsParams = {},
    maxItems: number = 100
  ): Promise<CivitAIModel[]> {
    const allModels: CivitAIModel[] = [];
    const seenIds = new Set<number>();
    let page = 1;
    // Only fetch what we need - limit per page is min of maxItems remaining and 100 (API max)
    const delay = 1000; // 1 second delay between requests

    while (allModels.length < maxItems) {
      const remaining = maxItems - allModels.length;
      const limit = Math.min(remaining, 100);
      let response;
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries) {
        try {
          response = await this.fetchModels({
            ...params,
            limit,
            page,
          });
          break; // Success, exit retry loop
        } catch (error) {
          if (error instanceof Error && error.message.includes('429')) {
            retries++;
            const backoff = delay * Math.pow(2, retries);
            console.log(`Rate limited, waiting ${backoff}ms before retry ${retries}/${maxRetries}...`);
            await new Promise((resolve) => setTimeout(resolve, backoff));
          } else {
            throw error; // Non-rate-limit error, rethrow
          }
        }
      }

      if (!response) {
        throw new Error('Max retries exceeded due to rate limiting');
      }

      // No more items from API
      if (response.items.length === 0) {
        break;
      }

      // Deduplicate as we collect
      const beforeCount = allModels.length;
      for (const model of response.items) {
        if (!seenIds.has(model.id)) {
          seenIds.add(model.id);
          allModels.push(model);
        }
      }

      // Stop if we've reached our target, no next page, or no new items were added
      if (allModels.length >= maxItems || !response.metadata.nextPage || allModels.length === beforeCount) {
        break;
      }

      page++;
      // Rate limiting - wait between requests
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    return allModels.slice(0, maxItems);
  }

  static flattenModel(model: CivitAIModel): FlattenedModel {
    const latestVersion = model.modelVersions?.[0];
    const thumbnail = latestVersion?.images?.[0];

    // Strip HTML tags from description
    const cleanDescription = model.description
      ? model.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      : '';

    return {
      id: model.id,
      name: model.name,
      description: cleanDescription,
      type: model.type,
      creator: model.creator?.username || '',
      downloads: model.stats?.downloadCount || 0,
      favorites: model.stats?.favoriteCount || 0,
      rating: model.stats?.rating || 0,
      ratingCount: model.stats?.ratingCount || 0,
      tags: (model.tags || []).join(', '),
      triggerWords: (latestVersion?.trainedWords || []).join(', '),
      nsfw: model.nsfw,
      baseModel: latestVersion?.baseModel || '',
      latestVersion: latestVersion?.name || '',
      createdAt: latestVersion?.createdAt || '',
      updatedAt: latestVersion?.updatedAt || '',
      url: `https://civitai.com/models/${model.id}`,
      thumbnailUrl: thumbnail?.url || '',
    };
  }

  static flattenModels(models: CivitAIModel[]): FlattenedModel[] {
    return models.map(CivitAIClient.flattenModel);
  }
}
