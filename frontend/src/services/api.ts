// ─── Canonical API types — mirrors backend api/schemas.py exactly ─────────────

export type StoryTone = 'inspirational' | 'dark' | 'educational' | 'funny';
export type StoryLength = 'short' | 'medium' | 'long';
export type VoiceId = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Aoede';

/** POST /stories/generate — request body */
export interface StoryRequest {
     topic: string;               // min 3, max 500 chars
     tone: StoryTone;
     audience: string;            // default "general audience"
     length: StoryLength;
     require_approval: boolean;   // pause pipeline for human outline review
     user_prefs: Record<string, unknown>;
     voice_id: VoiceId;
}

/** POST /stories/generate — response (202 Accepted) */
export interface StoryResponse {
     story_id: string;
     status: string;              // always "queued" on creation
}

/** Individual story section from outline or assembled script */
export interface StorySectionOut {
     title: string;
     description: string;
     index: number | null;
     chapter_index: number | null;
     chapter_title: string | null;
     content: string | null;
}

/** A chapter grouping sections inside the story outline */
export interface StoryChapterOut {
     title: string;
     description: string;
     chapter_index: number | null;
     sections: StorySectionOut[];
}

/**
 * Full story outline — mirrors StoryOutlineOut from backend.
 * This is what PATCH /stories/{id}/outline expects in its request body.
 */
export interface StoryOutlineOut {
     hook: string;
     chapters: StoryChapterOut[];
     sections: StorySectionOut[];  // flat list for O(1) worker dispatch
     climax: string;
     closing: string;
     target_words: number;
     target_minutes: number;
}

/** GET /stories/{id} — full story status and outputs */
export interface StoryStatusResponse {
     story_id: string;
     topic: string;
     tone: string;
     audience: string;
     length: string;
     status: string;
     outline: StoryOutlineOut | null;
     draft_script: string | null;
     cover_image: string | null;   // base64-encoded PNG — use /cover endpoint for rendering
     error: string | null;
     created_at: string;
     updated_at: string;
}

/** GET /stories/ — paginated story list */
export interface StorySummary {
     story_id: string;
     topic: string;
     status: string;
     created_at: string;
}

export interface StoryListResponse {
     stories: StorySummary[];
     total: number;
}

/** GET /stories/{id}/cover/exists */
export interface CoverExistsResponse {
     story_id: string;
     has_cover: boolean;
     cover_url: string | null;     // relative path e.g. /stories/{id}/cover
}

/** POST /stories/{id}/listen */
export interface ListenResponse {
     session_id: string;
     user_id: string;
     segment_count: number;
}

/** GET /health */
export interface HealthResponse {
     status: string;
     environment: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Extract a human-readable message from a failed response.
 * FastAPI error bodies have the shape { detail: string }.
 */
async function parseApiError(response: Response, fallback: string): Promise<never> {
     let detail = fallback;
     try {
          const body = await response.json();
          if (typeof body?.detail === 'string') detail = body.detail;
     } catch {
          // body is not JSON — use fallback
     }
     throw new Error(detail);
}

// ─── API client ───────────────────────────────────────────────────────────────

export const api = {
     /**
      * POST /stories/generate
      * Kick off async generation. Returns immediately with story_id and "queued" status.
      * Caller should redirect to story detail page and subscribe to SSE for progress.
      */
     generateStory: async (
          topic: string,
          tone: string,
          audience: string,
          voiceId: VoiceId = 'Puck',
          length: StoryLength = 'medium',
          requireApproval = false,
          userPrefs: Record<string, unknown> = {},
     ): Promise<StoryResponse> => {
          const body: StoryRequest = {
               topic,
               tone: tone as StoryTone,
               audience,
               length,
               voice_id: voiceId,
               require_approval: requireApproval,
               user_prefs: userPrefs,
          };
          const response = await fetch(`${BASE_URL}/stories/generate`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(body),
          });
          if (!response.ok) await parseApiError(response, 'Failed to generate story');
          return response.json() as Promise<StoryResponse>;
     },

     /**
      * GET /stories/{id}
      * Fetch current story status and all outputs. Call once on mount;
      * use the SSE stream for live updates rather than polling this endpoint.
      */
     getStoryStatus: async (storyId: string): Promise<StoryStatusResponse> => {
          const response = await fetch(`${BASE_URL}/stories/${storyId}`);
          if (!response.ok) await parseApiError(response, 'Story not found');
          return response.json() as Promise<StoryStatusResponse>;
     },

     /**
      * PATCH /stories/{id}/outline
      * Replace the full outline before generation begins (HITL flow).
      * Must send a complete StoryOutlineOut object — no partial patches.
      */
     patchOutline: async (storyId: string, outline: StoryOutlineOut): Promise<StoryStatusResponse> => {
          const response = await fetch(`${BASE_URL}/stories/${storyId}/outline`, {
               method: 'PATCH',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(outline),
          });
          if (!response.ok) await parseApiError(response, 'Failed to update outline');
          return response.json() as Promise<StoryStatusResponse>;
     },

     /**
      * POST /stories/{id}/approve
      * Resume a paused pipeline after human outline review.
      * Backend uses the current DB outline (possibly edited via patchOutline).
      * Returns 409 if checkpoint is no longer available after a server restart.
      */
     approveOutline: async (storyId: string): Promise<StoryStatusResponse> => {
          const response = await fetch(`${BASE_URL}/stories/${storyId}/approve`, {
               method: 'POST',
          });
          if (!response.ok) await parseApiError(response, 'Failed to approve outline');
          return response.json() as Promise<StoryStatusResponse>;
     },

     /**
      * GET /stories/{id}/cover/exists
      * Lightweight check — no image bytes transferred.
      * Always call this before fetching the binary cover endpoint.
      */
     coverExists: async (storyId: string): Promise<CoverExistsResponse> => {
          const response = await fetch(`${BASE_URL}/stories/${storyId}/cover/exists`);
          if (!response.ok) await parseApiError(response, 'Failed to check cover availability');
          return response.json() as Promise<CoverExistsResponse>;
     },

     /**
      * Returns the URL for the binary PNG cover endpoint.
      * Use as <img src={api.getCoverUrl(id)} /> — do NOT load via fetch into state.
      */
     getCoverUrl: (storyId: string): string => `${BASE_URL}/stories/${storyId}/cover`,

     /**
      * POST /stories/{id}/listen
      * Bridge call to TTS service. Returns session credentials for WebSocket handoff.
      * Requires a completed draft_script — will error if story is not yet complete.
      */
     getListenSession: async (storyId: string): Promise<ListenResponse> => {
          const response = await fetch(`${BASE_URL}/stories/${storyId}/listen`, {
               method: 'POST',
          });
          if (!response.ok) await parseApiError(response, 'Failed to initiate narration');
          return response.json() as Promise<ListenResponse>;
     },

     /**
      * GET /stories/
      * Paginated story history, newest first.
      */
     listStories: async (limit = 50, offset = 0): Promise<StoryListResponse> => {
          const response = await fetch(`${BASE_URL}/stories/?limit=${limit}&offset=${offset}`);
          if (!response.ok) await parseApiError(response, 'Failed to list stories');
          return response.json() as Promise<StoryListResponse>;
     },

     /**
      * DELETE /stories/{id}
      * Permanently removes story row and any associated media.
      */
     deleteStory: async (storyId: string): Promise<void> => {
          const response = await fetch(`${BASE_URL}/stories/${storyId}`, { method: 'DELETE' });
          if (!response.ok && response.status !== 204) {
               await parseApiError(response, 'Failed to delete story');
          }
     },

     /**
      * GET /health
      * Liveness check. Use to verify backend reachability on app load.
      */
     health: async (): Promise<HealthResponse> => {
          const response = await fetch(`${BASE_URL}/health`);
          if (!response.ok) await parseApiError(response, 'Backend unreachable');
          return response.json() as Promise<HealthResponse>;
     },
};
