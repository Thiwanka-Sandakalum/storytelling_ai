# Architecture Decision Records (ADR)

This document records the key architectural decisions made during the development of the Storytelling AI backend.

---

## ADR 1: Use of LangGraph for Stateful AI Workflows

### Context
Story generation is a multi-step process (Planning -> Review -> Generate -> Assemble). We need a way to manage state across these steps and handle "wait states" for user approval.

### Decision
Use **LangGraph** to define the story generation pipeline.

### Rationale
-   **State Persistence**: Built-in support for persisting the story's state across node executions.
-   **Cyclic nature**: Easily allows for re-planning or looping if the output doesn't meet quality standards.
-   **Checkpointing**: Enables the "Human-in-the-Loop" pattern where the pipeline can be paused for manual outline approval.

---

## ADR 2: Implementation of the Repository Pattern

### Context
Initially, the API and Celery workers were tightly coupled to SQLAlchemy model logic, leading to duplication and fragile maintenance.

### Decision
Implement a central `StoryRepository` in `/backend/main/repositories`.

### Rationale
-   **Separation of Concerns**: The business logic (Service layer) doesn't need to know *how* data is stored, only *what* is stored.
-   **Testability**: Makes it trivial to swap the real database for an in-memory mock during unit testing.
-   **Consistency**: Ensures that the background worker and the web API use the exact same data access logic.

---

## ADR 3: Parallel Chapter Generation (Fan-out)

### Context
Generating long stories (10+ minutes) can take several minutes if done sequentially, leading to poor user experience.

### Decision
Parallelize the chapter generation phase using Celery workers.

### Rationale
-   **Performance**: Reduces total generation time from `N * Chapter_Time` to approximately `Chapter_Time`.
-   **Scalability**: Allows the system to handle larger stories by simply adding more worker processes.
-   **Consistency**: By providing the full global outline to every chapter worker, we maintain narrative consistency even while generating in parallel.

---

## ADR 4: S3-Based Script Exchange

### Context
The Main API and the TTS service need to share the final STORY SCRIPT. Passing large text payloads through REST calls or Redis is inefficient.

### Decision
Use **MinIO/S3** as the source of truth for generated scripts.

### Rationale
-   **Decoupling**: The TTS service can fetch the script at its own pace using a `story_id`, without the Main API needing to maintain an active connection.
-   **Persistence**: Naturally provides a permanent record of the story script for future listeners.
-   **Performance**: Faster and more reliable than passing megabytes of text through multiple HTTP hops.

---

## ADR 5: Gemini Multimodal Live for Narration

### Context
Standard Text-to-Speech (TTS) can sound monotonous or robotic for long-form storytelling.

### Decision
Use the **Gemini Multimodal Live** (Native Audio) model for the Interactive Narrator.

### Rationale
-   **Expressiveness**: Gemini's native audio output provides human-like prosody, dramatic pauses, and character-driven emphasis.
-   **Low Latency**: The BIDI (Bi-Directional) streaming model allows for near-instant responses and real-time synchronization.
-   **Interactivity**: Future-proofs the system for real-time user-narrator conversation.
