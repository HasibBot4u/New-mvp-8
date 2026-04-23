/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { CatalogData, CatalogSubject, CatalogCycle, CatalogChapter, CatalogVideo } from '../types';
import { supabase } from '../lib/supabase';

interface CatalogContextType {
  catalog: CatalogData | null;
  isLoading: boolean;
  error: string | null;
  refreshCatalog: () => Promise<void>;
}

const CatalogContext = createContext<CatalogContextType | undefined>(undefined);

// Fallback to static 'v1' instead of Date.now() so caching works without env variable
const CACHE_KEY = `nexusedu_catalog_v${import.meta.env.VITE_BUILD_TIME || '1'}`;
const CACHE_TTL = 10 * 60 * 1000;

export const clearCatalogCache = () => {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
};

const loadCache = (): CatalogData | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
};

const saveCache = (data: CatalogData) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* ignore */ }
};

/**
 * Fetch catalog directly from Supabase.
 * This is the primary source — does NOT depend on Render backend being awake.
 */
async function fetchCatalogFromSupabase(signal?: AbortSignal): Promise<CatalogData> {
  const fetchTask = async () => {
    // Step 1: Fetch subjects
    const { data: subjects, error: subErr } = await supabase
      .from('subjects')
      .select('id, name, name_bn, slug, icon, color, thumbnail_color, description, display_order')
      .eq('is_active', true)
      .order('display_order')
      .abortSignal(signal as AbortSignal);
    if (subErr) throw new Error(subErr.message);
    if (!subjects || subjects.length === 0) {
      return { subjects: [], total_videos: 0 };
    }

    // Step 2: Fetch cycles for these subjects
    const subjectIds = subjects.map((s: any) => s.id);
    const { data: cycles, error: cycErr } = await supabase
      .from('cycles')
      .select('id, subject_id, name, name_bn, telegram_channel_id, display_order')
      .in('subject_id', subjectIds)
      .eq('is_active', true)
      .order('display_order')
      .abortSignal(signal as AbortSignal);
    if (cycErr) throw new Error(cycErr.message);

    const cycleIds = (cycles || []).map((c: any) => c.id);
    let chapters: any[] = [];
    let videos: any[] = [];

    if (cycleIds.length > 0) {
      // Step 3: Fetch chapters
      const { data: ch, error: chErr } = await supabase
        .from('chapters')
        .select('id, cycle_id, name, name_bn, requires_enrollment, display_order')
        .in('cycle_id', cycleIds)
        .eq('is_active', true)
        .order('display_order')
        .abortSignal(signal as AbortSignal);
      if (chErr) throw new Error(chErr.message);
      chapters = ch || [];

      const chapterIds = chapters.map((c: any) => c.id);
      if (chapterIds.length > 0) {
        // Step 4: Fetch videos
        const { data: vids, error: vidErr } = await supabase
          .from('videos')
          .select('id, chapter_id, title, title_bn, source_type, telegram_channel_id, telegram_message_id, youtube_video_id, drive_file_id, duration, size_mb, display_order')
          .in('chapter_id', chapterIds)
          .eq('is_active', true)
          .order('display_order')
          .abortSignal(signal as AbortSignal);
        if (vidErr) throw new Error(vidErr.message);
        videos = vids || [];
      }
    }

    // Step 5: Build nested catalog structure
    const videosByChapter: Record<string, CatalogVideo[]> = {};
    for (const v of videos) {
      if (!videosByChapter[v.chapter_id]) videosByChapter[v.chapter_id] = [];
      videosByChapter[v.chapter_id].push(v as CatalogVideo);
    }

    const chaptersByCycle: Record<string, CatalogChapter[]> = {};
    for (const ch of chapters) {
      if (!chaptersByCycle[ch.cycle_id]) chaptersByCycle[ch.cycle_id] = [];
      chaptersByCycle[ch.cycle_id].push({
        ...ch,
        videos: videosByChapter[ch.id] || [],
      } as CatalogChapter);
    }

    const cyclesBySubject: Record<string, CatalogCycle[]> = {};
    for (const cy of (cycles || [])) {
      if (!cyclesBySubject[cy.subject_id]) cyclesBySubject[cy.subject_id] = [];
      cyclesBySubject[cy.subject_id].push({
        ...cy,
        chapters: chaptersByCycle[cy.id] || [],
      } as CatalogCycle);
    }

    const builtSubjects: CatalogSubject[] = subjects.map((s: any) => ({
      ...s,
      cycles: cyclesBySubject[s.id] || [],
    }));

    const totalVideos = videos.length;

    return { subjects: builtSubjects, total_videos: totalVideos };
  };

  const timeoutPromise = new Promise<CatalogData>((_, reject) => 
    setTimeout(() => reject(new Error('Catalog fetch timeout')), 12000)
  );

  return Promise.race([fetchTask(), timeoutPromise]);
}

export const CatalogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [catalog, setCatalog] = useState<CatalogData | null>(() => loadCache());
  const [isLoading, setIsLoading] = useState(!loadCache()); // skip loading if cache hit
  const [error, setError] = useState<string | null>(null);

  const ctrlRef = useRef<AbortController | null>(null);

  const fetchCatalog = useCallback(async (force = false) => {
    if (ctrlRef.current) {
      ctrlRef.current.abort();
    }
    ctrlRef.current = new AbortController();
    const signal = ctrlRef.current.signal;

    if (!force) {
      const cached = loadCache();
      if (cached) {
        setCatalog(cached);
        setIsLoading(false);
        // Refresh in background silently
        fetchCatalogFromSupabase(signal)
          .then(fresh => { setCatalog(fresh); saveCache(fresh); setError(null); })
          .catch(() => { /* silent background refresh failure is ok */ });
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchCatalogFromSupabase(signal);
      setCatalog(data);
      saveCache(data);
      setError(null);
    } catch (err: any) {
      console.error('[Catalog] fetch failed:', err.message);
      const cached = loadCache();
      if (cached) {
        setCatalog(cached);
        setError(null); // don't show error if we have cached data
      } else {
        setError('ডেটা লোড করতে সমস্যা হয়েছে। পেজ রিলোড করুন।');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const refreshCatalog = useCallback(async () => {
    clearCatalogCache();
    await fetchCatalog(true);
  }, [fetchCatalog]);

  return (
    <CatalogContext.Provider value={{ catalog, isLoading, error, refreshCatalog }}>
      {children}
    </CatalogContext.Provider>
  );
};

export const useCatalog = () => {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used within CatalogProvider');
  return ctx;
};
