// CivitAI API Response Types

export interface CivitAIModelsResponse {
  items: CivitAIModel[];
  metadata: {
    totalItems: number;
    currentPage: number;
    pageSize: number;
    totalPages: number;
    nextPage?: string;
    prevPage?: string;
  };
}

export interface CivitAIModel {
  id: number;
  name: string;
  description: string | null;
  type: ModelType;
  nsfw: boolean;
  tags: string[];
  creator: {
    username: string;
    image: string | null;
  };
  stats: ModelStats;
  modelVersions: ModelVersion[];
}

export type ModelType =
  | 'Checkpoint'
  | 'LORA'
  | 'TextualInversion'
  | 'Hypernetwork'
  | 'AestheticGradient'
  | 'Controlnet'
  | 'Poses';

export interface ModelStats {
  downloadCount: number;
  favoriteCount: number;
  commentCount: number;
  rating: number;
  ratingCount: number;
}

export interface ModelVersion {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  trainedWords: string[];
  baseModel: string;
  files: ModelFile[];
  images: ModelImage[];
}

export interface ModelFile {
  id: number;
  name: string;
  sizeKB: number;
  type: string;
  format: string;
  pickleScanResult: string;
  virusScanResult: string;
  downloadUrl: string;
}

export interface ModelImage {
  id: number;
  url: string;
  nsfw: boolean | string;
  width: number;
  height: number;
  hash: string;
  meta: Record<string, unknown> | null;
}

export type BaseModel =
  | 'SD 1.5'
  | 'SD 2.1'
  | 'SDXL 1.0'
  | 'SDXL Turbo'
  | 'Pony'
  | 'Flux.1 D'
  | 'Flux.1 S'
  | 'SD 3'
  | 'SD 3.5'
  | 'Illustrious'
  | 'Other';

// Query parameters for fetching models
export interface FetchModelsParams {
  limit?: number;
  page?: number;
  query?: string;
  tag?: string;
  username?: string;
  types?: ModelType[];
  baseModels?: string[];
  sort?: 'Highest Rated' | 'Most Downloaded' | 'Newest';
  period?: 'AllTime' | 'Year' | 'Month' | 'Week' | 'Day';
  nsfw?: boolean;
}

// Flattened model for CSV export
export interface FlattenedModel {
  id: number;
  name: string;
  description: string;
  type: ModelType;
  creator: string;
  downloads: number;
  favorites: number;
  rating: number;
  ratingCount: number;
  tags: string;
  triggerWords: string;
  nsfw: boolean;
  baseModel: string;
  latestVersion: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  thumbnailUrl: string;
}
