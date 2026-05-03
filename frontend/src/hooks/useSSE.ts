import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { type RootState } from '../store';
import { addEvent, setStatus, setOutline, addNotification } from '../store/slices/storySlice';
import type { BackendStatus } from '../store/slices/storySlice';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const CANONICAL_BACKEND_STATUSES: BackendStatus[] = [
     'idle',
     'queued',
     'processing',
     'planning',
     'generating',
     'assembling',
     'cover_generating',
     'awaiting_approval',
     'completed',
     'failed',
];

const isBackendStatus = (value: unknown): value is BackendStatus =>
     typeof value === 'string' && CANONICAL_BACKEND_STATUSES.includes(value as BackendStatus);

/**
 * Subscribe to GET /stories/{id}/events SSE stream.
 *
 * Lifecycle rules (matching backend pipeline_runner.py):
 *  - Stream opens whenever storyId is non-null and status is not terminal.
 *  - Stream closes (and EventSource is cleaned up) when the backend emits
 *    status "completed", "failed", or "awaiting_approval".
 *  - A single status re-fetch is attempted on transient connection errors.
 */
/**
 * @param storyId     Story to subscribe to. Pass null to disconnect.
 * @param reconnectKey Increment this value to force the stream to reopen
 *                     (e.g. after user approves the outline and generation
 *                     resumes). Defaults to 0.
 */
export const useSSE = (storyId: string | null, reconnectKey = 0) => {
     const dispatch = useDispatch();
     const status = useSelector((state: RootState) => state.story.status);
     const statusRef = useRef(status);

     useEffect(() => {
          statusRef.current = status;
     }, [status]);

     useEffect(() => {
          if (!storyId) return;

          // Statuses that permanently end generation — never reopen after these.
          const permanentTerminals: BackendStatus[] = ['completed', 'failed'];
          if (permanentTerminals.includes(statusRef.current)) return;

          // All statuses that cause the backend to close the SSE stream.
          const streamCloseStatuses: BackendStatus[] = ['completed', 'failed', 'awaiting_approval'];

          const eventSource = new EventSource(`${BASE_URL}/stories/${storyId}/events`);

          eventSource.onmessage = (event) => {
               try {
                    const data = JSON.parse(event.data);

                    // Append to architect log
                    if (data.message || data.status) {
                         dispatch(addEvent({
                              timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                              message: data.message || `STATUS: ${String(data.status).toUpperCase()}`,
                         }));
                    }

                    // Sync outline into Redux whenever the backend sends it
                    if (data.outline) {
                         dispatch(setOutline(data.outline));
                    }

                    // Map backend status to Redux state
                    if (isBackendStatus(data.status)) {
                         dispatch(setStatus(data.status));
                    }

                    // Close stream on any terminal status (backend also closes,
                    // but explicit close avoids a spurious error event).
                    if (isBackendStatus(data.status) && streamCloseStatuses.includes(data.status)) {
                         eventSource.close();
                    }
               } catch (err) {
                    console.error('SSE parse error:', err);
               }
          };

          eventSource.onerror = () => {
               // Suppress noise when already in a terminal state (stream closed normally)
               if (streamCloseStatuses.includes(statusRef.current)) return;
               console.error('SSE connection error for story', storyId);
               dispatch(addNotification({
                    type: 'error',
                    message: 'Lost connection to the Story Architect. Attempting to reconnect…',
               }));
          };

          return () => eventSource.close();
     }, [storyId, dispatch, reconnectKey]);
};
