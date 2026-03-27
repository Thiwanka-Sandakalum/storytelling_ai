# Frontend Integration Guide

This document outlines how to integrate a frontend (Web or Mobile) with the Storytelling AI backend suite.

---

## 🏗️ Integration Flow (Six Steps)

A typical user journey involves coordinating across both the **Main API (:8000)** and the **Interactive Narrator (:8001)**.

### 1. Initiate Generation
Submit a topic and get a `story_id`.
- **Endpoint**: `POST :8000/stories/generate`
- **Output**: `{"id": "uuid", "status": "processing", ...}`

### 2. Monitor Progress (SSE)
Subscribe to real-time events to update the UI (e.g., progress bars, status labels).
- **Endpoint**: `GET :8000/stories/{id}/events` (Server-Sent Events)
- **Key Events**:
    - `pipeline.state_changed`: Current node being executed (Planner, Generator, etc.).
    - `pipeline.completed`: Signal to trigger the next phase.

### 3. Review & Edit Outline (Optional)
Once the `Planner` finishes, the story status becomes `pending_approval`. Fetch the `outline_json`.
- **Edit**: `PATCH :8000/stories/{id}/outline`
- **Approve**: `POST :8000/stories/{id}/approve` (This resumes the generation).

### 4. Create Narration Session
Once status is `completed`, "pre-warm" the TTS session.
- **Endpoint**: `POST :8000/stories/{id}/listen`
- **Response**: `{"session_id": "uuid", "user_id": "user-xxx", "segment_data": [...]}`
- **Optimization**: Use the `segment_data` to pre-render the story text for "Karaoke" style highlighting.

### 5. Connect to Live Stream (WebSocket)
Open a bi-directional stream for real-time audio and sync events.
- **URL**: `ws://:8001/ws/{user_id}/{session_id}`
- **Message**: Send `{ "type": "start_narration" }` to begin.

### 6. Synchronize UI
Handle incoming messages:
- **Binary (Audio)**: Stream to an `AudioContext` or buffer.
- **JSON (Sync)**: Look for `{"type": "segment_start", "index": N}` to highlight the corresponding paragraph in your UI.

---

## 🛡️ Fallback & Resilience

### WebSocket Disconnection
If the WebSocket drops during narration:
1.  **Reconnect**: Attempt a reconnection using the same `session_id`.
2.  **State Recovery**: The backend maintains the session state. You can send `{"type": "resume_narration", "index": N}` (if supported) or restart.
3.  **UI Feedback**: Show a "Reconnecting..." overlay to maintain a premium feel.

### API Rate Limits (Gemini)
The backend implements retries, but if it fails:
- The SSE stream will emit a `pipeline.failed` event with a detail message.
- **UI Fallback**: Offer the user a "Try Again" button which calls `/approve` (if it was an outline approval) or a new generation.

---

## ⚡ Optimized Performance

### PCM16 Audio Handling
The audio is streamed as raw **PCM16 (16kHz, mono)** for maximum speed.
- **Web API**: Use `AudioWorklet` or `ScriptProcessorNode` to feed the incoming bytes into the browser's audio buffer without glitches.

### Pre-rendered Text
Don't wait for narration to show text. Once the story is `completed`, fetch the full script and render it. The WebSocket events should only drive the *highlighting* and *playback*, not the data fetching.

### Static Asset Caching
The final story text should be cached locally once fetched. The `script_url` provided by the API points directly to S3/MinIO for high-speed static delivery.

---

## 📋 Environment Checklist
Ensure your frontend has access to:
- `STORY_API_URL` (e.g., `http://localhost:8000`)
- `STORY_TTS_URL` (e.g., `ws://localhost:8001`)
- `STORAGE_BASE_URL` (e.g., `http://localhost:9000/storytelling-audio`)
