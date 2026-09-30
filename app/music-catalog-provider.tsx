"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { trackKey, validMusicTrack, type MusicTrack } from "@/lib/music-types";

type Source = "original" | "netease";
type CatalogState = {
  query: string; provider: Source; submittedQuery: string;
  tracks: MusicTrack[]; pending: boolean; message: string; failed: boolean;
  searched: boolean; total: number; nextOffset: number | null;
};
type CatalogValue = CatalogState & {
  setQuery: (value: string) => void;
  chooseSource: (source: Source) => void;
  search: () => Promise<void>;
  loadMore: () => Promise<void>;
  retry: () => Promise<void>;
};
const initialState: CatalogState = { query: "", provider: "original", submittedQuery: "", tracks: [], pending: false, message: "", failed: false, searched: false, total: 0, nextOffset: null };
const CatalogContext = createContext<CatalogValue | null>(null);

export function useMusicCatalog() {
  const catalog = useContext(CatalogContext);
  if (!catalog) throw new Error("MusicCatalogProvider is missing");
  return catalog;
}

export function MusicCatalogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(state), controller = useRef<AbortController | null>(null), generation = useRef(0), alive = useRef(true);
  const submitted = useRef({ query: "", provider: "original" as Source });
  const attempt = useRef({ query: "", provider: "original" as Source, offset: 0 });
  stateRef.current = state;

  const request = useCallback(async (query: string, provider: Source, offset = 0) => {
    const term = query.trim();
    if (!term) return;
    controller.current?.abort();
    const abort = new AbortController(), token = ++generation.current;
    controller.current = abort;
    submitted.current = { query: term, provider };
    attempt.current = { query: term, provider, offset };
    setState(previous => ({ ...previous, provider, submittedQuery: term, pending: true, failed: false, ...(!offset ? { tracks: [], message: "", searched: false, total: 0, nextOffset: null } : {}) }));
    try {
      const params = new URLSearchParams({ q: term, provider, offset: String(offset) });
      const response = await fetch("/api/music/search?" + params, { signal: abort.signal, cache: "no-store" });
      const data = await response.json() as { error?: string; tracks?: unknown[]; notice?: string; total?: number; nextOffset?: number | null };
      if (!response.ok) throw new Error(data.error || "搜索暂时不可用。");
      if (!alive.current || abort.signal.aborted || token !== generation.current) return;
      const results = (data.tracks || []).filter(validMusicTrack);
      setState(previous => {
        const rows = offset ? [...previous.tracks, ...results] : results;
        return { ...previous, tracks: [...new Map(rows.map(song => [trackKey(song), song])).values()], message: data.notice || "", searched: true, total: data.total ?? results.length, nextOffset: data.nextOffset ?? null };
      });
    } catch (cause) {
      if (alive.current && !abort.signal.aborted && token === generation.current) setState(previous => ({ ...previous, failed: true, message: cause instanceof Error ? cause.message : "搜索暂时不可用。" }));
    } finally {
      if (alive.current && !abort.signal.aborted && token === generation.current) setState(previous => ({ ...previous, pending: false }));
    }
  }, []);

  const setQuery = useCallback((query: string) => setState(previous => ({ ...previous, query })), []);
  const search = useCallback(() => request(stateRef.current.query, stateRef.current.provider), [request]);
  const chooseSource = useCallback((provider: Source) => {
    if (provider === stateRef.current.provider) return;
    const query = stateRef.current.query;
    controller.current?.abort(); ++generation.current;
    setState(previous => ({ ...initialState, query: previous.query, provider }));
    if (query.trim()) void request(query, provider);
  }, [request]);
  const loadMore = useCallback(async () => {
    const current = stateRef.current;
    if (current.pending || current.nextOffset === null || current.query.trim() !== submitted.current.query || current.provider !== submitted.current.provider) return;
    await request(submitted.current.query, submitted.current.provider, current.nextOffset);
  }, [request]);
  const retry = useCallback(() => {
    const latest = attempt.current, current = stateRef.current;
    return current.query.trim() === latest.query && current.provider === latest.provider
      ? request(latest.query, latest.provider, latest.offset)
      : request(current.query, current.provider);
  }, [request]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; ++generation.current; controller.current?.abort(); };
  }, []);

  return <CatalogContext.Provider value={{ ...state, setQuery, search, chooseSource, loadMore, retry }}>{children}</CatalogContext.Provider>;
}
