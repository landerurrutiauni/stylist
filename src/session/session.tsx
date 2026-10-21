import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { DraftAnswers } from '../../shared/schema/answers.ts';
import { emptyDraft } from '../../shared/schema/draft.ts';
import type { AnalysisEnvelope } from '../../shared/schema/analysis.ts';
import { releasePhoto, type ProcessedPhoto } from '../images/process.ts';
import type { PhotoKind } from '../images/quality.ts';

export type PreviewView = 'front' | 'profile';

/** Previews are stored per cut and per photo: "lob:front", "lob:profile". */
export const previewKey = (styleId: string, view: PreviewView) => `${styleId}:${view}`;

const VIEW_OF_PHOTO: Record<PhotoKind, PreviewView> = { frontal: 'front', profile: 'profile' };

/** An AI-generated preview of one photo with one cut. */
export interface Preview {
  url: string;
  blob: Blob;
  model: string;
  createdAt: string;
}

/**
 * Everything the person gives FOLIA lives here, in memory only: nothing is
 * written to localStorage, sessionStorage, IndexedDB or cookies. Reloading
 * the page or choosing "Borrar sesión" removes it.
 */

export interface SessionState {
  photos: Record<PhotoKind, ProcessedPhoto | null>;
  consent: boolean;
  answers: DraftAnswers;
  /** The latest analysis, real or demo. */
  analysis: AnalysisEnvelope | null;
  /** Text the person added to steer a new round of recommendations. */
  refinement: string;
  favorites: string[];
  compare: string[];
  /** Real analysis with consent, or demo without sending anything. */
  mode: 'live' | 'demo';
  /** Set by the review screen; the analysis screen runs it once and clears it. */
  pendingRun: number | null;
  /** Hairstyle previews by catalogue id, generated on request. */
  previews: Record<string, Preview>;
  /** The separate consent for sending the frontal photo to the image service. */
  previewConsent: boolean;
}

const initialState = (): SessionState => ({
  photos: { frontal: null, profile: null },
  consent: false,
  answers: emptyDraft(),
  analysis: null,
  refinement: '',
  favorites: [],
  compare: [],
  mode: 'live',
  pendingRun: null,
  previews: {},
  previewConsent: false,
});

type Action =
  | { type: 'photo'; kind: PhotoKind; photo: ProcessedPhoto | null }
  | { type: 'consent'; value: boolean }
  | { type: 'answers'; patch: Partial<DraftAnswers> }
  | { type: 'analysis'; value: AnalysisEnvelope | null }
  | { type: 'refinement'; value: string }
  | { type: 'favorite'; id: string }
  | { type: 'compare'; id: string }
  | { type: 'compareSet'; ids: string[] }
  | { type: 'mode'; mode: 'live' | 'demo' }
  | { type: 'run' }
  | { type: 'runDone' }
  | { type: 'preview'; id: string; preview: Preview | null }
  | { type: 'previewConsent'; value: boolean }
  | { type: 'reset' };

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'photo':
      // Previews made from the replaced photo go with it.
      return {
        ...state,
        photos: { ...state.photos, [action.kind]: action.photo },
        previews: Object.fromEntries(Object.entries(state.previews).filter(([key]) => !key.endsWith(`:${VIEW_OF_PHOTO[action.kind]}`))),
      };
    case 'preview': {
      const previews = { ...state.previews };
      if (action.preview) previews[action.id] = action.preview;
      else delete previews[action.id];
      return { ...state, previews };
    }
    case 'previewConsent':
      return { ...state, previewConsent: action.value };
    case 'consent':
      return { ...state, consent: action.value };
    case 'answers':
      return { ...state, answers: { ...state.answers, ...action.patch } };
    case 'analysis':
      return {
        ...state,
        analysis: action.value,
        compare: [],
        favorites: action.value ? state.favorites.filter((id) => action.value!.output.recommendations.some((rec) => rec.styleId === id)) : [],
      };
    case 'refinement':
      return { ...state, refinement: action.value };
    case 'favorite':
      return {
        ...state,
        favorites: state.favorites.includes(action.id) ? state.favorites.filter((id) => id !== action.id) : [...state.favorites, action.id],
      };
    case 'compare': {
      if (state.compare.includes(action.id)) return { ...state, compare: state.compare.filter((id) => id !== action.id) };
      // Two at most: a third choice replaces the oldest.
      return { ...state, compare: [...state.compare, action.id].slice(-2) };
    }
    case 'compareSet':
      return { ...state, compare: action.ids.slice(0, 2) };
    case 'mode':
      return { ...state, mode: action.mode };
    case 'run':
      return { ...state, pendingRun: Date.now() };
    case 'runDone':
      return { ...state, pendingRun: null };
    case 'reset':
      return initialState();
  }
}

interface SessionApi {
  state: SessionState;
  setPhoto(kind: PhotoKind, photo: ProcessedPhoto | null): void;
  setConsent(value: boolean): void;
  updateAnswers(patch: Partial<DraftAnswers>): void;
  setAnalysis(value: AnalysisEnvelope | null): void;
  setRefinement(value: string): void;
  toggleFavorite(id: string): void;
  toggleCompare(id: string): void;
  setCompare(ids: string[]): void;
  setPreview(id: string, preview: Preview | null): void;
  setPreviewConsent(value: boolean): void;
  setMode(mode: 'live' | 'demo'): void;
  requestRun(): void;
  finishRun(): void;
  reset(): void;
}

const SessionContext = createContext<SessionApi | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const photosRef = useRef(state.photos);
  const previewsRef = useRef(state.previews);

  useEffect(() => {
    photosRef.current = state.photos;
    previewsRef.current = state.previews;
  }, [state.photos, state.previews]);

  const releasePreviews = useCallback((view?: PreviewView) => {
    Object.entries(previewsRef.current)
      .filter(([key]) => !view || key.endsWith(`:${view}`))
      .forEach(([, preview]) => URL.revokeObjectURL(preview.url));
  }, []);

  // Free every object URL when the page goes away.
  useEffect(() => {
    const release = () => {
      releasePhoto(photosRef.current.frontal);
      releasePhoto(photosRef.current.profile);
      releasePreviews();
    };
    window.addEventListener('pagehide', release);
    return () => window.removeEventListener('pagehide', release);
  }, [releasePreviews]);

  const setPhoto = useCallback(
    (kind: PhotoKind, photo: ProcessedPhoto | null) => {
      releasePhoto(photosRef.current[kind]);
      releasePreviews(VIEW_OF_PHOTO[kind]);
      dispatch({ type: 'photo', kind, photo });
    },
    [releasePreviews],
  );

  const setPreview = useCallback((id: string, preview: Preview | null) => {
    const old = previewsRef.current[id];
    if (old) URL.revokeObjectURL(old.url);
    dispatch({ type: 'preview', id, preview });
  }, []);

  const reset = useCallback(() => {
    releasePhoto(photosRef.current.frontal);
    releasePhoto(photosRef.current.profile);
    releasePreviews();
    dispatch({ type: 'reset' });
  }, [releasePreviews]);

  const api = useMemo<SessionApi>(
    () => ({
      state,
      setPhoto,
      setConsent: (value) => dispatch({ type: 'consent', value }),
      updateAnswers: (patch) => dispatch({ type: 'answers', patch }),
      setAnalysis: (value) => dispatch({ type: 'analysis', value }),
      setRefinement: (value) => dispatch({ type: 'refinement', value }),
      toggleFavorite: (id) => dispatch({ type: 'favorite', id }),
      toggleCompare: (id) => dispatch({ type: 'compare', id }),
      setCompare: (ids) => dispatch({ type: 'compareSet', ids }),
      setPreview,
      setPreviewConsent: (value) => dispatch({ type: 'previewConsent', value }),
      setMode: (mode) => dispatch({ type: 'mode', mode }),
      requestRun: () => dispatch({ type: 'run' }),
      finishRun: () => dispatch({ type: 'runDone' }),
      reset,
    }),
    [state, setPhoto, setPreview, reset],
  );

  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
