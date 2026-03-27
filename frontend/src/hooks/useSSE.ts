import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { type RootState } from '../store';
import { addEvent, setStatus, setOutline, addNotification } from '../store/slices/storySlice';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const useSSE = (storyId: string | null) => {
     const dispatch = useDispatch();
     const status = useSelector((state: RootState) => state.story.status);
     const statusRef = useRef(status);

     // Keep ref in sync for the onerror handler to use without triggering effect re-runs
     useEffect(() => {
          statusRef.current = status;
     }, [status]);

     useEffect(() => {
          if (!storyId) return;

          const eventSource = new EventSource(`${BASE_URL}/stories/${storyId}/events`);

          eventSource.onmessage = (event) => {
               try {
                    const data = JSON.parse(event.data);

                    // Log movement in the ArchitectLog
                    if (data.message || data.status) {
                         dispatch(addEvent({
                              timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                              message: data.message || `STATUS_UPDATE: ${data.status.toUpperCase()}`,
                         }));
                    }

                    // Map backend statuses to frontend Redux states
                    if (data.status === 'completed' || data.status === 'writing' || data.status === 'failed') {
                         dispatch(setStatus(data.status));
                    }

                    if (data.outline) {
                         dispatch(setOutline(data.outline));
                    }

                    if (data.status === 'planning_complete') {
                         dispatch(setStatus('pending_approval'));
                    }
               } catch (err) {
                    console.error('SSE Message Parse Error:', err);
               }
          };

          eventSource.onerror = (err) => {
               // Ignore closure errors if we are already in a terminal state
               if (statusRef.current !== 'completed' && statusRef.current !== 'failed') {
                    console.error('SSE Connection Error:', err);
                    dispatch(addNotification({
                         type: 'error',
                         message: 'Lost connection to the Story Architect. Attempting to reconnect...'
                    }));
               }
          };

          return () => eventSource.close();
     }, [storyId, dispatch]); // status removed from deps to prevent closure/reopen loops
};
