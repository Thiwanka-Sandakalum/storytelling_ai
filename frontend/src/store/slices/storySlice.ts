import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface StorySection {
     title: string;
     description: string;
     content?: string;
}

export interface Outline {
     hook: string;
     sections: StorySection[];
     climax: string;
     closing: string;
}

export interface Notification {
     id: string;
     message: string;
     type: 'info' | 'error' | 'success';
}

export interface StoryState {
     currentId: string | null;
     status: 'idle' | 'planning' | 'writing' | 'completed' | 'failed' | 'pending_approval';
     outline: Outline | null;
     events: any[];
     session: {
          sessionId: string | null;
          userId: string | null;
          segmentData: any[];
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
          },
          setStatus: (state, action: PayloadAction<StoryState['status']>) => {
               state.status = action.payload;
          },
          setOutline: (state, action: PayloadAction<Outline>) => {
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
