(() => {
  const apiMeta = document.querySelector('meta[name="happy-pet-photos-api-base"]');
  const apiFromMeta = (apiMeta?.getAttribute('content') || '').trim();
  const API_BASE = (window.HAPPY_PET_PHOTOS_API_BASE || apiFromMeta || '').replace(/\/+$/, '');
  const apiUrl = (path) => `${API_BASE}${path}`;

  const DB_NAME = 'happyPetPhotos';
  const DB_VERSION = 1;
  const STORE = 'posts';

  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const els = {
    form: qs('[data-pet-form]'),
    status: qs('[data-pet-status]'),
    fileInput: qs('#pet-photo'),
    petName: qs('#pet-name'),
    petType: qs('#pet-type'),
    caption: qs('#pet-caption'),
    sharePublic: qs('[data-share-public]'),
    preview: qs('[data-preview]'),
    previewImg: qs('[data-preview-img]'),
    removePhoto: qs('[data-remove-photo]'),
    tabs: qsa('[data-tab]'),
    localControls: qs('[data-local-controls]'),
    publicControls: qs('[data-public-controls]'),
    localFeed: qs('[data-feed]'),
    publicFeed: qs('[data-public-feed]'),
    emptyState: qs('[data-empty-state]'),
    search: qs('[data-search]'),
    sort: qs('[data-sort]'),
    publicEmpty: qs('[data-public-empty-state]'),
    publicSearch: qs('[data-public-search]'),
    publicSort: qs('[data-public-sort]'),
    publicLoadMore: qs('[data-public-load-more]'),
    publicFooter: qs('[data-public-footer]'),
    publicStatus: qs('[data-public-status]'),
    demoPost: qs('[data-demo-post]'),
    clearPosts: qs('[data-clear-posts]')
  };

  const state = {
    selectedFile: null,
    selectedPreviewUrl: '',
    posts: [],
    filter: '',
    sort: 'newest',
    activeTab: 'local',
    publicPosts: [],
    publicCursor: null,
    publicHasMore: true,
    publicFilter: '',
    publicSort: 'newest',
    publicIsLoading: false
  };

  const setStatus = (type, message) => {
    if (!els.status) return;
    els.status.classList.remove('form-status--success', 'form-status--error');
    if (!message) {
      els.status.hidden = true;
      els.status.textContent = '';
      return;
    }
    if (type === 'success') els.status.classList.add('form-status--success');
    if (type === 'error') els.status.classList.add('form-status--error');
    els.status.hidden = false;
    els.status.textContent = message;
  };

  const toggleButtonLoading = (button, isLoading) => {
    if (!button) return;
    if (isLoading) {
      if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
      button.textContent = button.getAttribute('data-loading-text') || 'Working...';
      button.disabled = true;
      return;
    }
    const original = button.dataset.originalLabel;
    if (original) button.textContent = original;
    button.disabled = false;
  };

  const openDb = () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('petName', 'petName', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

  const withStore = async (mode, fn) => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const result = fn(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }).finally(() => db.close());
  };

  const listPosts = () =>
    withStore('readonly', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    });

  const putPost = (post) =>
    withStore('readwrite', (store) => {
      store.put(post);
    });

  const deletePost = (id) =>
    withStore('readwrite', (store) => {
      store.delete(id);
    });

  const clearAllPosts = () =>
    withStore('readwrite', (store) => {
      store.clear();
    });

  const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

  const uid = () => {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `post_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const loadImageFromFile = (file) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not load image.'));
      };
      img.src = url;
    });

  const resizeToJpegBlob = async (file, options = {}) => {
    const maxDim = options.maxDim ?? 1600;
    const quality = options.quality ?? 0.85;

    const img = await loadImageFromFile(file);
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas not supported.');
    ctx.drawImage(img, 0, 0, dstW, dstH);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('Could not process image.');
    return blob;
  };

  const setPreview = (file) => {
    state.selectedFile = file || null;

    if (!els.preview || !els.previewImg || !els.fileInput) return;

    if (state.selectedPreviewUrl) {
      URL.revokeObjectURL(state.selectedPreviewUrl);
      state.selectedPreviewUrl = '';
    }

    if (!file) {
      els.preview.hidden = true;
      els.previewImg.removeAttribute('src');
      els.fileInput.value = '';
      return;
    }

    state.selectedPreviewUrl = URL.createObjectURL(file);
    els.previewImg.src = state.selectedPreviewUrl;
    els.preview.hidden = false;
  };

  const normalizeForSearch = (value) => safeText(value).toLowerCase();

  const getVisiblePosts = () => {
    const term = normalizeForSearch(state.filter);
    let posts = state.posts.slice();

    if (term) {
      posts = posts.filter((p) => {
        const haystack = [
          normalizeForSearch(p.petName),
          normalizeForSearch(p.petType),
          normalizeForSearch(p.caption)
        ].join(' ');
        return haystack.includes(term);
      });
    }

    if (state.sort === 'oldest') posts.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    if (state.sort === 'newest') posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (state.sort === 'name') {
      posts.sort((a, b) => normalizeForSearch(a.petName).localeCompare(normalizeForSearch(b.petName)));
    }

    return posts;
  };

  const humanDate = (timestamp) => {
    try {
      return new Date(timestamp).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  const revokeAllRenderedImageUrls = () => {
    if (!els.localFeed) return;
    els.localFeed.querySelectorAll('[data-object-url]').forEach((img) => {
      const url = img.getAttribute('data-object-url');
      if (url) URL.revokeObjectURL(url);
    });
  };

  const setActiveTab = (tab) => {
    state.activeTab = tab === 'public' ? 'public' : 'local';
    if (els.localControls) els.localControls.hidden = state.activeTab !== 'local';
    if (els.publicControls) els.publicControls.hidden = state.activeTab !== 'public';
    if (els.localFeed) els.localFeed.hidden = state.activeTab !== 'local';
    if (els.publicFeed) els.publicFeed.hidden = state.activeTab !== 'public';
    if (els.publicFooter) els.publicFooter.hidden = state.activeTab !== 'public';

    els.tabs.forEach((btn) => {
      const isActive = btn.getAttribute('data-tab') === state.activeTab;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });
  };

  const renderLocal = () => {
    if (!els.localFeed) return;

    revokeAllRenderedImageUrls();
    els.localFeed.innerHTML = '';

    const visible = getVisiblePosts();
    if (els.emptyState) {
      els.emptyState.hidden = visible.length > 0;
      if (!els.emptyState.hidden) els.localFeed.appendChild(els.emptyState);
    }

    visible.forEach((post) => {
      const card = document.createElement('article');
      card.className = 'pet-post';
      card.setAttribute('data-post-id', post.id);

      const imageUrl = URL.createObjectURL(post.imageBlob);
      const img = document.createElement('img');
      img.className = 'pet-post__image';
      img.alt = safeText(post.caption) || `${safeText(post.petName) || 'Pet'} photo`;
      img.loading = 'lazy';
      img.src = imageUrl;
      img.setAttribute('data-object-url', imageUrl);

      const body = document.createElement('div');
      body.className = 'pet-post__body';

      const title = document.createElement('div');
      title.className = 'pet-post__title';

      const name = document.createElement('h3');
      name.textContent = safeText(post.petName) || 'My happy companion';

      const pills = document.createElement('div');
      pills.className = 'pet-post__pills';

      const typePill = document.createElement('span');
      typePill.className = 'label';
      typePill.textContent = safeText(post.petType) || 'Pet';

      const datePill = document.createElement('span');
      datePill.className = 'label';
      datePill.textContent = humanDate(post.createdAt);

      pills.append(typePill, datePill);
      title.append(name, pills);

      const caption = document.createElement('p');
      caption.className = 'pet-post__caption';
      caption.textContent = safeText(post.caption) || '—';

      const actions = document.createElement('div');
      actions.className = 'pet-post__actions';

      const shareBtn = document.createElement('button');
      shareBtn.type = 'button';
      shareBtn.className = 'btn btn-outline';
      shareBtn.textContent = 'Share';
      shareBtn.addEventListener('click', async () => {
        const baseName = safeText(post.petName) || 'pet-photo';
        const fileName = `${baseName.replace(/\s+/g, '-').toLowerCase() || 'pet-photo'}.jpg`;
        const file = new File([post.imageBlob], fileName, { type: 'image/jpeg' });
        const shareTextParts = [];
        if (safeText(post.petName)) shareTextParts.push(post.petName);
        if (safeText(post.petType)) shareTextParts.push(`(${post.petType})`);
        const text = shareTextParts.join(' ') || 'Happy pet photo';

        try {
          if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
            await navigator.share({
              title: 'Happy Pet Photo',
              text: safeText(post.caption) ? `${text} — ${post.caption}` : text,
              files: [file]
            });
            return;
          }
        } catch (error) {
          console.warn('Share failed', error);
        }

        // Fallback: download
        const a = document.createElement('a');
        a.href = imageUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-outline';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', async () => {
        const ok = confirm('Delete this post?');
        if (!ok) return;
        await deletePost(post.id);
        await refresh();
      });

      actions.append(shareBtn, deleteBtn);

      body.append(title, caption, actions);
      card.append(img, body);
      els.localFeed.appendChild(card);
    });
  };

  const renderPublic = () => {
    if (!els.publicFeed) return;
    els.publicFeed.innerHTML = '';

    if (els.publicEmpty) {
      els.publicEmpty.hidden = state.publicPosts.length > 0;
      if (!els.publicEmpty.hidden) els.publicFeed.appendChild(els.publicEmpty);
    }

    state.publicPosts.forEach((post) => {
      const card = document.createElement('article');
      card.className = 'pet-post';
      card.setAttribute('data-public-post-id', post.id);

      const img = document.createElement('img');
      img.className = 'pet-post__image';
      img.alt = safeText(post.caption) || `${safeText(post.petName) || 'Pet'} photo`;
      img.loading = 'lazy';
      img.src = post.imageUrl;

      const body = document.createElement('div');
      body.className = 'pet-post__body';

      const title = document.createElement('div');
      title.className = 'pet-post__title';

      const name = document.createElement('h3');
      name.textContent = safeText(post.petName) || 'Happy companion';

      const pills = document.createElement('div');
      pills.className = 'pet-post__pills';

      const typePill = document.createElement('span');
      typePill.className = 'label';
      typePill.textContent = safeText(post.petType) || 'Pet';

      const datePill = document.createElement('span');
      datePill.className = 'label';
      datePill.textContent = humanDate(post.createdAt);

      pills.append(typePill, datePill);
      title.append(name, pills);

      const caption = document.createElement('p');
      caption.className = 'pet-post__caption';
      caption.textContent = safeText(post.caption) || '—';

      const actions = document.createElement('div');
      actions.className = 'pet-post__actions';

      const shareBtn = document.createElement('button');
      shareBtn.type = 'button';
      shareBtn.className = 'btn btn-outline';
      shareBtn.textContent = 'Share';
      shareBtn.addEventListener('click', async () => {
        const shareTextParts = [];
        if (safeText(post.petName)) shareTextParts.push(post.petName);
        if (safeText(post.petType)) shareTextParts.push(`(${post.petType})`);
        const text = shareTextParts.join(' ') || 'Happy pet photo';

        try {
          if (navigator.share) {
            await navigator.share({
              title: 'Happy Pet Photo',
              text: safeText(post.caption) ? `${text} — ${post.caption}` : text,
              url: post.imageUrl
            });
            return;
          }
        } catch (error) {
          console.warn('Share failed', error);
        }

        try {
          await navigator.clipboard.writeText(post.imageUrl);
          setStatus('success', 'Link copied to clipboard.');
        } catch {
          window.prompt('Copy link:', post.imageUrl);
        }
      });

      actions.append(shareBtn);
      body.append(title, caption, actions);
      card.append(img, body);
      els.publicFeed.appendChild(card);
    });

    if (els.publicLoadMore) {
      els.publicLoadMore.disabled = state.publicIsLoading || !state.publicHasMore;
      els.publicLoadMore.textContent = state.publicHasMore ? 'Load more' : 'No more posts';
    }
  };

  const render = () => {
    renderLocal();
    renderPublic();
  };

  const refresh = async () => {
    state.posts = await listPosts();
    renderLocal();
  };

  const setPublicStatus = (message) => {
    if (!els.publicStatus) return;
    els.publicStatus.textContent = message || '';
  };

  const fetchPublicPage = async ({ reset } = { reset: false }) => {
    if (state.publicIsLoading) return;
    state.publicIsLoading = true;
    setPublicStatus(reset ? 'Loading…' : 'Loading more…');
    renderPublic();

    try {
      if (reset) {
        state.publicCursor = null;
        state.publicHasMore = true;
        state.publicPosts = [];
      }
      const params = new URLSearchParams();
      params.set('limit', '20');
      params.set('sort', state.publicSort);
      if (state.publicFilter) params.set('q', state.publicFilter);
      if (state.publicCursor) params.set('cursor', state.publicCursor);

      const res = await fetch(apiUrl(`/api/posts?${params.toString()}`), { cache: 'no-store' });
      if (!res.ok) throw new Error(`Public feed request failed (${res.status}).`);
      const data = await res.json();
      const posts = Array.isArray(data.posts) ? data.posts : [];
      state.publicPosts = state.publicPosts.concat(posts);
      state.publicCursor = data.nextCursor || null;
      state.publicHasMore = Boolean(data.nextCursor);
      setPublicStatus('');
    } catch (error) {
      console.error(error);
      setPublicStatus(error?.message || 'Could not load public feed.');
    } finally {
      state.publicIsLoading = false;
      renderPublic();
    }
  };

  const sharePublic = async ({ petName, petType, caption, imageBlob }) => {
    const form = new FormData();
    form.set('petName', petName || '');
    form.set('petType', petType || 'Other');
    form.set('caption', caption || '');
    const file = new File([imageBlob], 'photo.jpg', { type: 'image/jpeg' });
    form.set('photo', file);

    const res = await fetch(apiUrl('/api/posts'), { method: 'POST', body: form });
    if (!res.ok) {
      let msg = `Public share failed (${res.status}).`;
      try {
        const data = await res.json();
        if (data?.error) msg = data.error;
      } catch {
        // ignore
      }
      throw new Error(msg);
    }
    return res.json();
  };

  const fetchDemoImageBlob = async () => {
    const candidates = [
      'assets/images/products/canine-longevity-blend.jpg',
      'assets/images/products/feline-metabolic-support.jpg',
      'assets/images/products/wild-flight-suet-alternative.jpg'
    ];
    for (const src of candidates) {
      try {
        const res = await fetch(src, { cache: 'no-cache' });
        if (!res.ok) continue;
        const blob = await res.blob();
        return blob;
      } catch {
        // keep trying
      }
    }
    throw new Error('Could not load demo image.');
  };

  const onFileChange = () => {
    const file = els.fileInput?.files?.[0];
    if (!file) {
      setPreview(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setStatus('error', 'Please choose an image file.');
      setPreview(null);
      return;
    }
    setStatus('', '');
    setPreview(file);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!els.form) return;

    const submitBtn = qs('[data-submit-post]', els.form);
    setStatus('', '');

    const file = state.selectedFile || els.fileInput?.files?.[0];
    if (!file) {
      setStatus('error', 'Please add a photo.');
      return;
    }

    toggleButtonLoading(submitBtn, true);
    try {
      const imageBlob = await resizeToJpegBlob(file, { maxDim: 1600, quality: 0.85 });
      const post = {
        id: uid(),
        petName: safeText(els.petName?.value) || '',
        petType: safeText(els.petType?.value) || 'Other',
        caption: safeText(els.caption?.value) || '',
        createdAt: Date.now(),
        imageBlob
      };
      await putPost(post);
      await refresh();

      const shouldSharePublic = Boolean(els.sharePublic?.checked);
      if (shouldSharePublic) {
        try {
          await sharePublic({
            petName: post.petName,
            petType: post.petType,
            caption: post.caption,
            imageBlob: post.imageBlob
          });
          // If user is looking at the public feed, refresh it.
          if (state.activeTab === 'public') {
            await fetchPublicPage({ reset: true });
          }
          setStatus('success', 'Posted locally and shared to the public feed.');
        } catch (error) {
          setStatus(
            'error',
            `Saved on your device, but could not share publicly: ${error?.message || 'Unknown error.'}`
          );
        }
      } else {
        setStatus('success', 'Posted! Your photo is saved on this device.');
      }

      els.form.reset();
      setPreview(null);
    } catch (error) {
      console.error(error);
      setStatus('error', error?.message || 'Could not save your post.');
    } finally {
      toggleButtonLoading(submitBtn, false);
    }
  };

  const init = async () => {
    if (!els.form || !('indexedDB' in window)) return;

    els.fileInput?.addEventListener('change', onFileChange);
    els.removePhoto?.addEventListener('click', () => setPreview(null));
    els.form.addEventListener('submit', onSubmit);

    els.tabs.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tab = btn.getAttribute('data-tab') || 'local';
        setActiveTab(tab);
        if (state.activeTab === 'public' && state.publicPosts.length === 0) {
          await fetchPublicPage({ reset: true });
        }
      });
    });

    els.search?.addEventListener('input', () => {
      state.filter = els.search.value;
      renderLocal();
    });

    els.sort?.addEventListener('change', () => {
      state.sort = els.sort.value;
      renderLocal();
    });

    els.publicSearch?.addEventListener('input', async () => {
      state.publicFilter = els.publicSearch.value.trim();
      await fetchPublicPage({ reset: true });
    });

    els.publicSort?.addEventListener('change', async () => {
      state.publicSort = els.publicSort.value;
      await fetchPublicPage({ reset: true });
    });

    els.publicLoadMore?.addEventListener('click', async () => {
      if (!state.publicHasMore) return;
      await fetchPublicPage({ reset: false });
    });

    els.demoPost?.addEventListener('click', async () => {
      setStatus('', '');
      const btn = els.demoPost;
      toggleButtonLoading(btn, true);
      try {
        const blob = await fetchDemoImageBlob();
        const post = {
          id: uid(),
          petName: 'Luna',
          petType: 'Dog',
          caption: 'Happy zoomies after a long walk.',
          createdAt: Date.now(),
          imageBlob: blob
        };
        await putPost(post);
        await refresh();
        setStatus('success', 'Demo post added locally.');
      } catch (error) {
        console.error(error);
        setStatus('error', error?.message || 'Could not add demo post.');
      } finally {
        toggleButtonLoading(btn, false);
      }
    });

    els.clearPosts?.addEventListener('click', async () => {
      const ok = confirm('Clear all your posts on this device?');
      if (!ok) return;
      await clearAllPosts();
      await refresh();
      setStatus('success', 'Cleared.');
    });

    state.sort = els.sort?.value || 'newest';
    state.publicSort = els.publicSort?.value || 'newest';
    setActiveTab('local');
    await refresh();
  };

  document.addEventListener('DOMContentLoaded', init);
})();

