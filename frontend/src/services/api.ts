const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const api = {
     generateStory: async (topic: string, tone: string, audience: string, voiceId?: string, length?: string) => {
          const response = await fetch(`${BASE_URL}/stories/generate`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                    topic,
                    tone,
                    audience,
                    voice_id: voiceId,
                    length: length || 'medium',
               }),
          });
          if (!response.ok) throw new Error('Failed to generate story');
          return response.json();
     },

     approveOutline: async (storyId: string) => {
          const response = await fetch(`${BASE_URL}/stories/${storyId}/approve`, {
               method: 'POST',
          });
          if (!response.ok) throw new Error('Failed to approve outline');
          return response.json();
     },

     getListenSession: async (storyId: string) => {
          const response = await fetch(`${BASE_URL}/stories/${storyId}/listen`, {
               method: 'POST',
          });
          if (!response.ok) throw new Error('Failed to initiate narration');
          return response.json();
     },

     getStoryStatus: async (storyId: string) => {
          const response = await fetch(`${BASE_URL}/stories/${storyId}`, {
               method: 'GET',
          });
          if (!response.ok) throw new Error('Failed to get story status');
          return response.json() as Promise<{ story_id: string; topic: string; status: string; created_at: string; outline?: any }>;
     },

     patchOutline: async (storyId: string, outline: any) => {
          const response = await fetch(`${BASE_URL}/stories/${storyId}/outline`, {
               method: 'PATCH',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(outline),
          });
          if (!response.ok) throw new Error('Failed to update outline');
          return response.json();
     },

     listStories: async (limit = 50, offset = 0) => {
          const response = await fetch(`${BASE_URL}/stories/?limit=${limit}&offset=${offset}`);
          if (!response.ok) throw new Error('Failed to list stories');
          return response.json() as Promise<{ stories: { story_id: string; topic: string; status: string; created_at: string }[]; total: number }>;
     },

     deleteStory: async (storyId: string) => {
          const response = await fetch(`${BASE_URL}/stories/${storyId}`, { method: 'DELETE' });
          if (!response.ok && response.status !== 204) throw new Error('Failed to delete story');
     },
};
