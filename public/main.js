const { createApp, ref, computed } = Vue;

createApp({
  setup() {
    // Active tab state
    const activeTab = ref('civitai');

    // ==================== CivitAI State ====================
    const civitai = ref({
      models: [],
      selectedIds: [],
      loading: false,
      error: '',
      filters: {
        sort: 'Most Downloaded',
        period: 'AllTime',
        types: 'Checkpoint,LORA',
        baseModels: '',
        maxItems: '100',
        excludeNsfw: true,
        excludeEarlyAccess: true,
      },
      sortColumn: 'downloads',
      sortDirection: 'desc',
    });

    // ==================== Single Model State ====================
    const single = ref({
      url: '',
      model: null,
      selectedVersionId: null,
      loading: false,
      error: '',
    });

    // ==================== Settings State ====================
    const settings = ref({
      civitaiApiKey: '',
      huggingfaceToken: '',
      showCivitaiKey: false,
      showHuggingfaceToken: false,
      saveMessage: '',
      saveSuccess: false,
    });

    // Show API key prompt if no key saved
    const showApiKeyPrompt = ref(false);

    // Load settings from localStorage on init
    function loadSettings() {
      try {
        const saved = localStorage.getItem('modelYoinkerSettings');
        if (saved) {
          const parsed = JSON.parse(saved);
          settings.value.civitaiApiKey = parsed.civitaiApiKey || '';
          settings.value.huggingfaceToken = parsed.huggingfaceToken || '';
        }
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }

    function saveSettings() {
      try {
        localStorage.setItem('modelYoinkerSettings', JSON.stringify({
          civitaiApiKey: settings.value.civitaiApiKey,
          huggingfaceToken: settings.value.huggingfaceToken,
        }));
        settings.value.saveMessage = 'Settings saved!';
        settings.value.saveSuccess = true;
        setTimeout(() => {
          settings.value.saveMessage = '';
        }, 3000);
      } catch (e) {
        settings.value.saveMessage = 'Failed to save settings';
        settings.value.saveSuccess = false;
        console.error('Failed to save settings:', e);
      }
    }

    function clearSettings() {
      settings.value.civitaiApiKey = '';
      settings.value.huggingfaceToken = '';
      localStorage.removeItem('modelYoinkerSettings');
      settings.value.saveMessage = 'Settings cleared';
      settings.value.saveSuccess = true;
      setTimeout(() => {
        settings.value.saveMessage = '';
      }, 3000);
    }

    // Load settings immediately and check if we need to prompt
    loadSettings();

    // Show prompt if no CivitAI API key is saved
    if (!settings.value.civitaiApiKey) {
      showApiKeyPrompt.value = true;
    }

    function saveAndDismissPrompt() {
      saveSettings();
      showApiKeyPrompt.value = false;
    }

    function dismissApiKeyPrompt() {
      showApiKeyPrompt.value = false;
    }

    // ==================== My Models State ====================
    const mymodels = ref({
      models: [],
      selectedIndices: [],
      fileName: '',
      error: '',
      filters: {
        directory: '',
        search: '',
      },
      sortColumn: 'model_name',
      sortDirection: 'asc',
      showEditModal: false,
      bulkEdit: false,
      editingIndex: null,
      editForm: {
        model_name: '',
        directory: '',
        url: '',
        preview_url: '',
      },
    });

    // ==================== HuggingFace State ====================
    const huggingface = ref({
      models: [],
      selectedIds: [],
      loading: false,
      error: '',
      filters: {
        search: '',
        filterTags: '',
        author: '',
        architecture: '',
        sort: 'downloads',
        limit: '50',
        fetchFiles: false,
      },
      sortColumn: 'downloads',
      sortDirection: 'desc',
    });

    // ==================== CivitAI Computed ====================
    const civitaiAllSelected = computed(() => {
      return civitai.value.models.length > 0 &&
             civitai.value.selectedIds.length === civitai.value.models.length;
    });

    const civitaiSortedModels = computed(() => {
      if (!civitai.value.models.length) return [];

      return [...civitai.value.models].sort((a, b) => {
        let aVal, bVal;

        switch (civitai.value.sortColumn) {
          case 'name':
            aVal = a.name?.toLowerCase() || '';
            bVal = b.name?.toLowerCase() || '';
            break;
          case 'type':
            aVal = a.type?.toLowerCase() || '';
            bVal = b.type?.toLowerCase() || '';
            break;
          case 'creator':
            aVal = a.creator?.username?.toLowerCase() || '';
            bVal = b.creator?.username?.toLowerCase() || '';
            break;
          case 'downloads':
            aVal = a.stats?.downloadCount || 0;
            bVal = b.stats?.downloadCount || 0;
            break;
          case 'rating':
            aVal = a.stats?.rating || 0;
            bVal = b.stats?.rating || 0;
            break;
          case 'baseModel':
            aVal = a.modelVersions?.[0]?.baseModel?.toLowerCase() || '';
            bVal = b.modelVersions?.[0]?.baseModel?.toLowerCase() || '';
            break;
          default:
            return 0;
        }

        if (aVal < bVal) return civitai.value.sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return civitai.value.sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    });

    // ==================== HuggingFace Computed ====================
    const huggingfaceAllSelected = computed(() => {
      return huggingface.value.models.length > 0 &&
             huggingface.value.selectedIds.length === huggingface.value.models.length;
    });

    const huggingfaceSortedModels = computed(() => {
      if (!huggingface.value.models.length) return [];

      return [...huggingface.value.models].sort((a, b) => {
        let aVal, bVal;

        switch (huggingface.value.sortColumn) {
          case 'id':
            aVal = a.id?.toLowerCase() || '';
            bVal = b.id?.toLowerCase() || '';
            break;
          case 'author':
            aVal = a.author?.toLowerCase() || '';
            bVal = b.author?.toLowerCase() || '';
            break;
          case 'downloads':
            aVal = a.downloads || 0;
            bVal = b.downloads || 0;
            break;
          case 'likes':
            aVal = a.likes || 0;
            bVal = b.likes || 0;
            break;
          case 'arch':
            aVal = detectHFArchitecture(a).toLowerCase();
            bVal = detectHFArchitecture(b).toLowerCase();
            break;
          default:
            return 0;
        }

        if (aVal < bVal) return huggingface.value.sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return huggingface.value.sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    });

    // ==================== My Models Computed ====================
    const mymodelsDirectories = computed(() => {
      const dirs = new Set();
      mymodels.value.models.forEach((m) => {
        if (m.directory) dirs.add(m.directory);
      });
      return Array.from(dirs).sort();
    });

    const mymodelsFilteredModels = computed(() => {
      let filtered = mymodels.value.models.map((m, i) => ({ ...m, _index: i }));

      if (mymodels.value.filters.directory) {
        filtered = filtered.filter((m) => m.directory === mymodels.value.filters.directory);
      }

      if (mymodels.value.filters.search) {
        const search = mymodels.value.filters.search.toLowerCase();
        filtered = filtered.filter((m) =>
          m.model_name?.toLowerCase().includes(search) ||
          m.url?.toLowerCase().includes(search)
        );
      }

      return filtered;
    });

    const mymodelsSortedModels = computed(() => {
      if (!mymodelsFilteredModels.value.length) return [];

      return [...mymodelsFilteredModels.value].sort((a, b) => {
        let aVal, bVal;

        switch (mymodels.value.sortColumn) {
          case 'model_name':
            aVal = a.model_name?.toLowerCase() || '';
            bVal = b.model_name?.toLowerCase() || '';
            break;
          case 'directory':
            aVal = a.directory?.toLowerCase() || '';
            bVal = b.directory?.toLowerCase() || '';
            break;
          default:
            return 0;
        }

        if (aVal < bVal) return mymodels.value.sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return mymodels.value.sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    });

    const mymodelsAllSelected = computed(() => {
      if (mymodelsFilteredModels.value.length === 0) return false;
      const filteredIndices = mymodelsFilteredModels.value.map((m) => m._index);
      return filteredIndices.every((i) => mymodels.value.selectedIndices.includes(i));
    });

    // ==================== CivitAI Methods ====================
    async function fetchCivitAI() {
      civitai.value.loading = true;
      civitai.value.error = '';
      civitai.value.selectedIds = [];

      try {
        const params = new URLSearchParams({
          sort: civitai.value.filters.sort,
          period: civitai.value.filters.period,
          types: civitai.value.filters.types,
          maxItems: civitai.value.filters.maxItems,
        });

        if (civitai.value.filters.baseModels) {
          params.set('baseModels', civitai.value.filters.baseModels);
        }

        if (civitai.value.filters.excludeNsfw) {
          params.set('nsfw', 'false');
        }

        const headers = {};
        if (settings.value.civitaiApiKey) {
          headers['X-CivitAI-Api-Key'] = settings.value.civitaiApiKey;
        }
        const response = await fetch(`/api/models/fetch-all?${params}`, { headers });
        if (!response.ok) {
          if (response.status === 401) {
            const data = await response.json();
            throw new Error(data.error || 'API key required. Please add your CivitAI API key in Settings.');
          }
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        let items = data.items;

        // Deduplicate by model ID
        const seen = new Set();
        items = items.filter((model) => {
          if (seen.has(model.id)) {
            return false;
          }
          seen.add(model.id);
          return true;
        });

        // Filter out early access models client-side
        if (civitai.value.filters.excludeEarlyAccess) {
          items = items.filter((model) => {
            if (model.availability && model.availability !== 'Public') {
              return false;
            }
            const latestVersion = model.modelVersions?.[0];
            if (latestVersion?.availability && latestVersion.availability !== 'Public') {
              return false;
            }
            return true;
          });
        }

        civitai.value.models = items;
      } catch (err) {
        civitai.value.error = `Failed to fetch models: ${err.message}`;
        console.error(err);
      } finally {
        civitai.value.loading = false;
      }
    }

    function selectAllCivitAI() {
      if (civitaiAllSelected.value) {
        civitai.value.selectedIds = [];
      } else {
        civitai.value.selectedIds = civitai.value.models.map((m) => m.id);
      }
    }

    function getCivitAIThumbnail(model) {
      const version = model.modelVersions?.[0];
      const image = version?.images?.[0];
      return image?.url || null;
    }

    function getCivitAIBaseModel(model) {
      return model.modelVersions?.[0]?.baseModel || 'Unknown';
    }

    function exportCivitAI(format) {
      const ids = civitai.value.selectedIds.join(',');
      window.open(`/api/models/export?format=${format}&ids=${ids}`, '_blank');
    }

    function sortCivitAI(column) {
      if (civitai.value.sortColumn === column) {
        civitai.value.sortDirection = civitai.value.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        civitai.value.sortColumn = column;
        civitai.value.sortDirection = ['name', 'type', 'creator', 'baseModel'].includes(column) ? 'asc' : 'desc';
      }
    }

    function getCivitAISortIcon(column) {
      if (civitai.value.sortColumn !== column) return '';
      return civitai.value.sortDirection === 'asc' ? '▲' : '▼';
    }

    // ==================== HuggingFace Methods ====================
    async function fetchHuggingFace() {
      huggingface.value.loading = true;
      huggingface.value.error = '';
      huggingface.value.selectedIds = [];

      try {
        const params = new URLSearchParams({
          sort: huggingface.value.filters.sort,
          limit: huggingface.value.filters.limit,
        });

        if (huggingface.value.filters.search) {
          params.set('search', huggingface.value.filters.search);
        }

        if (huggingface.value.filters.author) {
          params.set('author', huggingface.value.filters.author);
        }

        if (huggingface.value.filters.filterTags) {
          params.set('filter', huggingface.value.filters.filterTags);
        }

        if (huggingface.value.filters.architecture) {
          params.set('architecture', huggingface.value.filters.architecture);
        }

        if (huggingface.value.filters.fetchFiles) {
          params.set('fetchFiles', 'true');
        }

        const headers = {};
        if (settings.value.huggingfaceToken) {
          headers['X-HuggingFace-Token'] = settings.value.huggingfaceToken;
        }
        const response = await fetch(`/api/huggingface/models?${params}`, { headers });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        let items = data.items;

        // Client-side architecture filtering (in case API search doesn't perfectly match)
        if (huggingface.value.filters.architecture) {
          const archFilter = huggingface.value.filters.architecture.toLowerCase();
          items = items.filter((model) => {
            const detectedArch = detectHFArchitecture(model).toLowerCase();
            // Match based on filter value
            if (archFilter === 'flux.1-dev') return detectedArch.includes('flux.1 dev');
            if (archFilter === 'flux.1-kontext') return detectedArch.includes('flux.1 kontext');
            if (archFilter === 'flux.1-schnell') return detectedArch.includes('flux.1 schnell');
            if (archFilter === 'flux.2') return detectedArch.includes('flux.2');
            if (archFilter === 'qwen-image-edit-2509') return detectedArch === 'qwen image edit 2509';
            if (archFilter === 'qwen-image-edit') return detectedArch === 'qwen image edit';
            if (archFilter === 'qwen-image') return detectedArch === 'qwen image';
            if (archFilter === 'wan') return detectedArch.includes('wan');
            if (archFilter === 'cogvideo') return detectedArch.includes('cogvideo');
            if (archFilter === 'hunyuan') return detectedArch.includes('hunyuan');
            if (archFilter === 'z-image-turbo') return detectedArch.includes('z-image');
            if (archFilter === 'hidream') return detectedArch.includes('hidream');
            if (archFilter === 'sdxl') return detectedArch === 'sdxl';
            if (archFilter === 'illustrious') return detectedArch.includes('illustrious');
            if (archFilter === 'noobai') return detectedArch.includes('noobai');
            if (archFilter === 'pony') return detectedArch.includes('pony');
            if (archFilter === 'sd15') return detectedArch === 'sd 1.5';
            return true;
          });
        }

        huggingface.value.models = items;
      } catch (err) {
        huggingface.value.error = `Failed to fetch models: ${err.message}`;
        console.error(err);
      } finally {
        huggingface.value.loading = false;
      }
    }

    function selectAllHuggingFace() {
      if (huggingfaceAllSelected.value) {
        huggingface.value.selectedIds = [];
      } else {
        huggingface.value.selectedIds = huggingface.value.models.map((m) => m.id);
      }
    }

    function exportHuggingFace(format) {
      const ids = huggingface.value.selectedIds.join(',');
      window.open(`/api/huggingface/models/export?format=${format}&ids=${encodeURIComponent(ids)}`, '_blank');
    }

    function sortHuggingFace(column) {
      if (huggingface.value.sortColumn === column) {
        huggingface.value.sortDirection = huggingface.value.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        huggingface.value.sortColumn = column;
        huggingface.value.sortDirection = ['id', 'author', 'arch'].includes(column) ? 'asc' : 'desc';
      }
    }

    function getHuggingFaceSortIcon(column) {
      if (huggingface.value.sortColumn !== column) return '';
      return huggingface.value.sortDirection === 'asc' ? '▲' : '▼';
    }

    function detectHFArchitecture(model) {
      const tags = model.tags || [];
      const tagsLower = tags.map((t) => t.toLowerCase());
      const modelId = model.id?.toLowerCase() || '';

      // Check base_model tag first (exclude adapter: and finetune: prefixes)
      const baseModelTag = tags.find((t) => t.startsWith('base_model:') && !t.includes(':adapter:') && !t.includes(':finetune:'));
      let baseModel = baseModelTag ? baseModelTag.replace('base_model:', '').replace('quantized:', '').replace('merge:', '').toLowerCase() : '';

      // Z-Image Turbo (Tongyi-MAI/Z-Image-Turbo)
      if (baseModel.includes('z-image-turbo') || baseModel.includes('zimage') || tagsLower.some((t) => t.includes('z-image')) || modelId.includes('z-image')) {
        return 'Z-Image Turbo';
      }

      // HiDream
      if (baseModel.includes('hidream') || tagsLower.some((t) => t.includes('hidream')) || modelId.includes('hidream')) {
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
      if (baseModel.includes('flux.1-kontext') || baseModel.includes('flux1-kontext')) {
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

    // ==================== My Models Methods ====================
    function handleFileUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      mymodels.value.error = '';
      mymodels.value.fileName = file.name;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (data.models && Array.isArray(data.models)) {
            mymodels.value.models = data.models;
            mymodels.value.selectedIndices = [];
          } else if (Array.isArray(data)) {
            mymodels.value.models = data;
            mymodels.value.selectedIndices = [];
          } else {
            throw new Error('Invalid JSON structure. Expected { models: [...] } or an array.');
          }
        } catch (err) {
          mymodels.value.error = `Failed to parse JSON: ${err.message}`;
          mymodels.value.models = [];
        }
      };
      reader.onerror = () => {
        mymodels.value.error = 'Failed to read file';
      };
      reader.readAsText(file);
    }

    function clearMyModels() {
      mymodels.value.models = [];
      mymodels.value.selectedIndices = [];
      mymodels.value.fileName = '';
      mymodels.value.error = '';
      mymodels.value.filters.directory = '';
      mymodels.value.filters.search = '';
      // Reset file input
      const fileInput = document.getElementById('json-file-input');
      if (fileInput) fileInput.value = '';
    }

    function selectAllMyModels() {
      if (mymodelsAllSelected.value) {
        // Deselect all filtered items
        const filteredIndices = mymodelsFilteredModels.value.map((m) => m._index);
        mymodels.value.selectedIndices = mymodels.value.selectedIndices.filter(
          (i) => !filteredIndices.includes(i)
        );
      } else {
        // Select all filtered items
        const filteredIndices = mymodelsFilteredModels.value.map((m) => m._index);
        const existing = new Set(mymodels.value.selectedIndices);
        filteredIndices.forEach((i) => existing.add(i));
        mymodels.value.selectedIndices = Array.from(existing);
      }
    }

    function sortMyModels(column) {
      if (mymodels.value.sortColumn === column) {
        mymodels.value.sortDirection = mymodels.value.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        mymodels.value.sortColumn = column;
        mymodels.value.sortDirection = 'asc';
      }
    }

    function getMyModelsSortIcon(column) {
      if (mymodels.value.sortColumn !== column) return '';
      return mymodels.value.sortDirection === 'asc' ? '▲' : '▼';
    }

    function truncateUrl(url) {
      if (!url) return '';
      if (url.length <= 50) return url;
      // Show domain and truncated path
      try {
        const parsed = new URL(url);
        const domain = parsed.hostname;
        const path = parsed.pathname;
        if (path.length > 30) {
          return `${domain}${path.substring(0, 27)}...`;
        }
        return `${domain}${path}`;
      } catch {
        return url.substring(0, 47) + '...';
      }
    }

    function openEditModal(index) {
      const model = mymodels.value.models[index];
      mymodels.value.editingIndex = index;
      mymodels.value.bulkEdit = false;
      mymodels.value.editForm = {
        model_name: model.model_name || '',
        directory: model.directory || '',
        url: model.url || '',
        preview_url: model.preview_url || '',
      };
      mymodels.value.showEditModal = true;
    }

    function openBulkEditModal() {
      mymodels.value.bulkEdit = true;
      mymodels.value.editingIndex = null;
      mymodels.value.editForm = {
        model_name: '',
        directory: '',
        url: '',
        preview_url: '',
      };
      mymodels.value.showEditModal = true;
    }

    function closeEditModal() {
      mymodels.value.showEditModal = false;
      mymodels.value.bulkEdit = false;
      mymodels.value.editingIndex = null;
    }

    function saveEdit() {
      if (mymodels.value.bulkEdit) {
        // Apply changes to all selected models
        const form = mymodels.value.editForm;
        mymodels.value.selectedIndices.forEach((index) => {
          const model = mymodels.value.models[index];

          if (form.directory) {
            model.directory = form.directory;
          }

          if (form.preview_url) {
            // Support placeholders
            let previewUrl = form.preview_url;
            previewUrl = previewUrl.replace('{directory}', model.directory || '');
            previewUrl = previewUrl.replace('{model_name}', model.model_name || '');
            model.preview_url = previewUrl;
          }
        });
      } else {
        // Single model edit
        const index = mymodels.value.editingIndex;
        if (index !== null) {
          const form = mymodels.value.editForm;
          mymodels.value.models[index] = {
            ...mymodels.value.models[index],
            model_name: form.model_name,
            directory: form.directory,
            url: form.url,
            preview_url: form.preview_url,
          };
        }
      }

      closeEditModal();
    }

    function deleteModel(index) {
      if (confirm('Are you sure you want to delete this model?')) {
        mymodels.value.models.splice(index, 1);
        // Update selected indices
        mymodels.value.selectedIndices = mymodels.value.selectedIndices
          .filter((i) => i !== index)
          .map((i) => (i > index ? i - 1 : i));
      }
    }

    function exportMyModels() {
      const output = {
        models: mymodels.value.models,
      };

      const jsonString = JSON.stringify(output, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = mymodels.value.fileName || 'supported_models.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function countSafetensors(model) {
      if (!model.siblings) return 0;
      return model.siblings.filter((f) => f.rfilename?.endsWith('.safetensors')).length;
    }

    function getDisplayTags(model) {
      const tags = model.tags || [];
      // Filter out base_model tags and other metadata tags for cleaner display
      return tags.filter((t) =>
        !t.startsWith('base_model:') &&
        !t.startsWith('license:') &&
        !t.startsWith('region:') &&
        t !== 'diffusers' &&
        t !== 'safetensors'
      );
    }

    // ==================== Single Model Methods ====================
    function extractModelId(input) {
      if (!input) return null;
      input = input.trim();

      // If it's just a number, use it directly
      if (/^\d+$/.test(input)) {
        return input;
      }

      // Try to extract from CivitAI URL patterns
      // https://civitai.com/models/123456
      // https://civitai.com/models/123456/model-name
      // https://civitai.com/models/123456?modelVersionId=789
      const urlMatch = input.match(/civitai\.com\/models\/(\d+)/);
      if (urlMatch) {
        return urlMatch[1];
      }

      return null;
    }

    async function fetchSingleModel() {
      const modelId = extractModelId(single.value.url);

      if (!modelId) {
        single.value.error = 'Please enter a valid CivitAI model URL or ID';
        return;
      }

      single.value.loading = true;
      single.value.error = '';
      single.value.model = null;
      single.value.selectedVersionId = null;

      try {
        const headers = {};
        if (settings.value.civitaiApiKey) {
          headers['X-CivitAI-Api-Key'] = settings.value.civitaiApiKey;
        }
        const response = await fetch(`/api/models/single/${modelId}`, { headers });

        if (!response.ok) {
          if (response.status === 401) {
            const data = await response.json();
            throw new Error(data.error || 'API key required. Please add your CivitAI API key in Settings.');
          }
          if (response.status === 404) {
            throw new Error('Model not found');
          }
          throw new Error(`HTTP ${response.status}`);
        }

        const model = await response.json();
        single.value.model = model;

        // Auto-select the first version
        if (model.modelVersions && model.modelVersions.length > 0) {
          single.value.selectedVersionId = model.modelVersions[0].id;
        }
      } catch (err) {
        single.value.error = `Failed to fetch model: ${err.message}`;
        console.error(err);
      } finally {
        single.value.loading = false;
      }
    }

    function getSingleModelThumbnail() {
      const version = single.value.model?.modelVersions?.[0];
      const image = version?.images?.[0];
      return image?.url || null;
    }

    function getModelDirectory(type) {
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

    function getArchitecturePrefix(baseModel) {
      const prefixMap = {
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

    function sanitizeModelNameForExport(name) {
      // Strip architecture terms (simplified version of backend logic)
      const archTerms = [
        'flux', 'flux1', 'flux2', 'sdxl', 'sd15', 'sd21', 'sd3', 'sd35',
        'pony', 'pony_diffusion', 'illustrious', 'noobai', 'nai',
        'chroma', 'turbo', 'lightning', 'hyper', 'lcm',
        'lora', 'locon', 'lycoris', 'checkpoint',
        'safetensors', 'fp16', 'fp32', 'bf16',
        'zimage', 'zimageturbo', 'hidream',
      ];

      let cleanName = name.toLowerCase();
      for (const term of archTerms) {
        cleanName = cleanName.replace(new RegExp(`\\b${term}\\b`, 'gi'), ' ');
      }

      cleanName = cleanName
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_');

      return cleanName.length >= 2 ? cleanName : name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    }

    function getSingleModelExportJSON() {
      if (!single.value.model || !single.value.selectedVersionId) return '';

      const model = single.value.model;
      const version = model.modelVersions.find(v => v.id === single.value.selectedVersionId);
      if (!version) return '';

      const primaryFile = version.files?.[0];
      if (!primaryFile) return '';

      const previewImage = version.images?.[0];

      let modelName = primaryFile.name;

      // For LoRAs, create clean filename
      if (model.type === 'LORA' && version.baseModel) {
        const archPrefix = getArchitecturePrefix(version.baseModel);
        const cleanName = sanitizeModelNameForExport(model.name);
        const extension = primaryFile.name.includes('.')
          ? primaryFile.name.substring(primaryFile.name.lastIndexOf('.'))
          : '.safetensors';
        modelName = `${archPrefix}-${cleanName}${extension}`;
      }

      const exportObj = {
        model_name: modelName,
        url: `https://civitai.com/api/download/models/${version.id}`,
        directory: getModelDirectory(model.type),
      };

      if (previewImage?.url) {
        exportObj.preview_url = previewImage.url;
      }

      return JSON.stringify(exportObj, null, 2);
    }

    async function copySingleModelExport() {
      const json = getSingleModelExportJSON();
      if (json) {
        try {
          await navigator.clipboard.writeText(json);
          alert('Copied to clipboard!');
        } catch (err) {
          console.error('Failed to copy:', err);
        }
      }
    }

    function formatDate(dateStr) {
      if (!dateStr) return 'Unknown';
      const date = new Date(dateStr);
      return date.toLocaleDateString();
    }

    function formatFileSize(sizeKB) {
      if (!sizeKB) return 'Unknown';
      if (sizeKB >= 1024 * 1024) {
        return (sizeKB / (1024 * 1024)).toFixed(2) + ' GB';
      }
      if (sizeKB >= 1024) {
        return (sizeKB / 1024).toFixed(2) + ' MB';
      }
      return sizeKB.toFixed(0) + ' KB';
    }

    // ==================== Shared Utility Methods ====================
    function formatNumber(num) {
      if (num == null) return '0';
      if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
      }
      if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
      }
      return num.toString();
    }

    function formatRating(rating) {
      if (rating == null) return 'N/A';
      return rating.toFixed(1);
    }

    return {
      // Tab state
      activeTab,

      // CivitAI
      civitai,
      civitaiAllSelected,
      civitaiSortedModels,
      fetchCivitAI,
      selectAllCivitAI,
      getCivitAIThumbnail,
      getCivitAIBaseModel,
      exportCivitAI,
      sortCivitAI,
      getCivitAISortIcon,

      // HuggingFace
      huggingface,
      huggingfaceAllSelected,
      huggingfaceSortedModels,
      fetchHuggingFace,
      selectAllHuggingFace,
      exportHuggingFace,
      sortHuggingFace,
      getHuggingFaceSortIcon,
      detectHFArchitecture,
      countSafetensors,
      getDisplayTags,

      // Single Model
      single,
      fetchSingleModel,
      getSingleModelThumbnail,
      getSingleModelExportJSON,
      copySingleModelExport,
      formatDate,
      formatFileSize,

      // My Models
      mymodels,
      mymodelsDirectories,
      mymodelsFilteredModels,
      mymodelsSortedModels,
      mymodelsAllSelected,
      handleFileUpload,
      clearMyModels,
      selectAllMyModels,
      sortMyModels,
      getMyModelsSortIcon,
      truncateUrl,
      openEditModal,
      openBulkEditModal,
      closeEditModal,
      saveEdit,
      deleteModel,
      exportMyModels,

      // Shared utilities
      formatNumber,
      formatRating,

      // Settings
      settings,
      saveSettings,
      clearSettings,
      showApiKeyPrompt,
      saveAndDismissPrompt,
      dismissApiKeyPrompt,
    };
  },
}).mount('#app');
