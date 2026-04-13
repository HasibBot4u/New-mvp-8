async function fetchWithTimeout(url: string, ms: number, options?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function getWorkingBackend(): Promise<string> {
  const PRIMARY = import.meta.env.VITE_API_BASE_URL || 'https://nexusedu-backend-0bjq.onrender.com';
  const REPLIT  = import.meta.env.VITE_REPLIT_URL || '';
  const CACHE_KEY = 'nexusedu_working_backend';
  const TTL = 5 * 60 * 1000;
  
  // Check cache
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { url, ts } = JSON.parse(cached);
      if (Date.now() - ts < TTL) return url;
    }
  } catch { /* ignore */ }
  
  // Try primary
  try {
    const r = await fetchWithTimeout(`${PRIMARY}/api/health`, 8000);
    if (r.ok) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ url: PRIMARY, ts: Date.now() }));
      return PRIMARY;
    }
  } catch { /* ignore */ }
  
  // Try replit fallback
  if (REPLIT) {
    try {
      const r = await fetchWithTimeout(`${REPLIT}/api/health`, 12000);
      if (r.ok) {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ url: REPLIT, ts: Date.now() }));
        return REPLIT;
      }
    } catch { /* ignore */ }
  }
  
  return PRIMARY;  // Return primary even if down
}

export function clearBackendCache(): void {
  try { localStorage.removeItem('nexusedu_working_backend'); } catch { /* ignore */ }
}

let _lastRefresh = 0;
export async function refreshCatalog(): Promise<void> {
  if (Date.now() - _lastRefresh < 60000) return;
  _lastRefresh = Date.now();
  const backend = await getWorkingBackend();
  try { await fetchWithTimeout(`${backend}/api/refresh`, 15000); } catch { /* ignore */ }
}

export async function getStreamUrl(videoId: string): Promise<string> {
  const backend = await getWorkingBackend();
  return `${backend}/api/stream/${videoId}`;
}

export async function prefetchVideo(videoId: string): Promise<void> {
  const backend = await getWorkingBackend();
  try { await fetchWithTimeout(`${backend}/api/prefetch/${videoId}`, 10000); } catch { /* ignore */ }
}

export async function fetchBackendHealth(): Promise<Record<string, unknown>> {
  const backend = await getWorkingBackend();
  const r = await fetchWithTimeout(`${backend}/api/health`, 6000);
  return r.json();
}

export const api = {
  getWorkingBackend,
  clearBackendCache,
  getStreamUrl,
  prefetchVideo,
  refreshCatalog,
  fetchBackendHealth,
  getCatalogWithCache: async () => {
    const backend = await getWorkingBackend();
    const r = await fetchWithTimeout(`${backend}/api/catalog`, 20000);
    if (!r.ok) throw new Error('Failed to fetch catalog');
    return r.json();
  },
  warmup: async () => {
    const backend = await getWorkingBackend();
    try { await fetchWithTimeout(`${backend}/api/warmup`, 5000); } catch { /* ignore */ }
  }
};