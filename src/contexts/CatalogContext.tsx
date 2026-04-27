import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Subject, Cycle, Chapter, Video } from "@/types";
import { useAuth } from "@/contexts/AuthContext";

export interface CatalogChapter extends Chapter { videos: Video[]; }
export interface CatalogCycle extends Cycle { chapters: CatalogChapter[]; }
export interface CatalogSubject extends Subject { cycles: CatalogCycle[]; }
export interface Catalog { subjects: CatalogSubject[]; totalVideos: number; }

interface Ctx {
  catalog: Catalog | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const CatalogCtx = createContext<Ctx | undefined>(undefined);
const sb = supabase as any;

// Map raw DB rows (real columns) into the typed shape used by the app.
const mapSubject = (r: any): Subject => ({
  id: r.id, name: r.name, name_bn: r.name_bn, slug: r.slug,
  icon: r.icon ?? null, color: r.color ?? null,
  display_order: r.display_order ?? 0, is_active: r.is_active,
  created_at: r.created_at,
} as Subject);
const mapCycle = (r: any): Cycle => ({
  id: r.id, subject_id: r.subject_id, name: r.name, name_bn: r.name_bn,
  display_order: r.display_order ?? 0, is_active: r.is_active,
} as Cycle);
const mapChapter = (r: any): Chapter => ({
  id: r.id, cycle_id: r.cycle_id, name: r.name, name_bn: r.name_bn,
  description: r.description,
  requires_enrollment: !!r.requires_enrollment,
  display_order: r.display_order ?? 0, is_active: r.is_active,
} as Chapter);
const mapVideo = (r: any): Video => ({
  id: r.id, chapter_id: r.chapter_id, title: r.title, title_bn: r.title_bn,
  source_type: r.source_type,
  telegram_channel_id: r.telegram_channel_id,
  telegram_message_id: r.telegram_message_id ? Number(r.telegram_message_id) : undefined,
  youtube_video_id: r.youtube_video_id ?? null,
  drive_file_id: r.drive_file_id,
  duration: typeof r.duration === "string" ? r.duration : (r.duration ? String(r.duration) : undefined),
  thumbnail_url: r.thumbnail_url,
  display_order: r.display_order ?? 0, is_active: r.is_active,
  size_mb: r.size_mb ?? null,
} as Video);


export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      const [s, c, ch, v] = await Promise.all([
        sb.from("subjects").select("*").eq("is_active", true).order("display_order"),
        sb.from("cycles").select("*").eq("is_active", true).order("display_order"),
        sb.from("chapters").select("*").eq("is_active", true).order("display_order"),
        sb.from("videos").select("*").eq("is_active", true).order("display_order"),
      ]);
      if (s.error || c.error || ch.error || v.error) {
        throw s.error || c.error || ch.error || v.error;
      }
      const subjects = (s.data ?? []).map(mapSubject);
      const cycles = (c.data ?? []).map(mapCycle);
      const chapters = (ch.data ?? []).map(mapChapter);
      const videos = (v.data ?? []).map(mapVideo);

      const built: CatalogSubject[] = subjects.map((subj: Subject) => ({
        ...subj,
        cycles: cycles
          .filter((cy: Cycle) => cy.subject_id === subj.id)
          .map((cy: Cycle) => ({
            ...cy,
            chapters: chapters
              .filter((cp: Chapter) => cp.cycle_id === cy.id)
              .map((cp: Chapter) => ({
                ...cp,
                videos: videos.filter((vi: Video) => vi.chapter_id === cp.id),
              })),
          })),
      }));
      setCatalog({ subjects: built, totalVideos: videos.length });
    } catch (e: any) {
      setError(e?.message ?? "Failed to load catalog");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const { isLoading: authLoading, user } = useAuth();

  useEffect(() => { 
    if (!authLoading) {
      refresh(); 
    }
  }, [refresh, authLoading, user]);

  return <CatalogCtx.Provider value={{ catalog, isLoading, error, refresh }}>{children}</CatalogCtx.Provider>;
}

export function useCatalog() {
  const v = useContext(CatalogCtx);
  if (!v) throw new Error("useCatalog must be used inside <CatalogProvider>");
  return v;
}
