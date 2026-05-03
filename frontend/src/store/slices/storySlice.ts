import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// ─── Domain types — kept in sync with backend api/schemas.py ──────────────────

export interface StorySection {
     title: string;
     description: string;
     index: number | null;
     chapter_index: number | null;
     chapter_title: string | null;
     content: string | null;
}

export interface StoryChapter {
     title: string;
     description: string;
     chapter_index: number | null;
     sections: StorySection[];
}

/**
 * Full outline as returned by backend StoryOutlineOut.
 * This is also the shape expected by PATCH /stories/{id}/outline.
 */
export interface Outline {
     hook: string;
     chapters: StoryChapter[];
     sections: StorySection[];
     climax: string;
     closing: string;
     target_words: number;
     target_minutes: number;
}

export interface Notification {
     id: string;
     message: string;
     type: 'info' | 'error' | 'success';
}

/** All statuses the backend pipeline can emit via SSE or GET /stories/{id}. */
export type BackendStatus =
     | 'idle'
     | 'queued'
     | 'processing'
     | 'planning'
     | 'generating'
     | 'assembling'
     | 'cover_generating'
     | 'awaiting_approval'
     | 'completed'
     | 'failed';

export interface StoryState {
     currentId: string | null;
     status: BackendStatus;
     outline: Outline | null;
     events: any[];
     session: {
          sessionId: string | null;
          userId: string | null;
          segmentCount: number;
     } | null;
     notifications: Notification[];
}

const initialState: StoryState = {
     currentId: null,
     status: 'idle',
     outline: null,
     events: [],
     session: null,
     notifications: [],
};

export const storySlice = createSlice({
     name: 'story',
     initialState,
     reducers: {
          setStoryId: (state, action: PayloadAction<string>) => {
               state.currentId = action.payload;
               state.events = [];
               state.outline = null;
          },
          setStatus: (state, action: PayloadAction<BackendStatus>) => {
               state.status = action.payload;
          },
          setOutline: (state, action: PayloadAction<Outline | null>) => {
               state.outline = action.payload;
          },
          addEvent: (state, action: PayloadAction<any>) => {
               state.events.push(action.payload);
          },
          setSession: (state, action: PayloadAction<StoryState['session']>) => {
               state.session = action.payload;
          },
          addNotification: (state, action: PayloadAction<Omit<Notification, 'id'>>) => {
               state.notifications.push({
                    ...action.payload,
                    id: Math.random().toString(36).substring(7),
               });
          },
          removeNotification: (state, action: PayloadAction<string>) => {
               state.notifications = state.notifications.filter(n => n.id !== action.payload);
          },
          resetStory: () => {
               return initialState;
          },
     },
});

export const {
     setStoryId,
     setStatus,
     setOutline,
     addEvent,
     setSession,
     addNotification,
     removeNotification,
     resetStory
} = storySlice.actions;
export default storySlice.reducer;
