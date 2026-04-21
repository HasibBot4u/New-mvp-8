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
  const envUrl = import.meta.env.VITE_API_BASE_URL || 'https://nexusedu-backend-0bjq.onrender.com';
  const PRIMARY = envUrl.replace(/\/$/, '');
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
    const r = await fetchWithTimeout(`${PRIMARY}/api/health`, 45000);
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

export const getStreamUrl = (video: any): string => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://nexusedu-backend-0bjq.onrender.com';
  const workerUrl = 'https://nexusedu-proxy.mdhosainp414.workers.dev';
  
  if (video.source_type === 'telegram') {
    // Use backend MTProto streamer (bypasses 20MB limit)
    let url = `${baseUrl}/api/stream/${video.id}`;
    if (video.channel_id && video.message_id) {
       url += `?c=${video.channel_id}&m=${video.message_id}`;
    }
    return url;
  } else if (video.source_type === 'drive') {
    // Use Cloudflare Worker for Drive
    return `${workerUrl}/drive/${video.drive_file_id}`;
  } else if (video.source_type === 'youtube') {
    return `https://www.youtube.com/embed/${video.youtube_video_id}?autoplay=1&controls=0&modestbranding=1&rel=0&disablekb=1`;
  }
  return '';
};

export async function prefetchVideo(videoId: string): Promise<void> {
  const backend = await getWorkingBackend();
  try { await fetchWithTimeout(`${backend}/api/prefetch/${videoId}`, 10000); } catch { /* ignore */ }
}

export async function fetchBackendHealth(): Promise<Record<string, unknown>> {
  const backend = await getWorkingBackend();
  const r = await fetchWithTimeout(`${backend}/api/health`, 30000); // Wait longer for backend
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
    const r = await fetchWithTimeout(`${backend}/api/catalog`, 40000);
    if (!r.ok) throw new Error('Failed to fetch catalog');
    return r.json();
  },
  warmup: async () => {
    const backend = await getWorkingBackend();
    try { await fetchWithTimeout(`${backend}/api/warmup`, 5000); } catch { /* ignore */ }
  }
};