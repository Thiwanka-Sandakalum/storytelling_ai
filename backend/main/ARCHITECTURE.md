# Architecture — AI Storytelling Backend

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Directory Layout](#3-directory-layout)
4. [Pipeline Topology](#4-pipeline-topology)
5. [Node Reference](#5-node-reference)
6. [State Schema](#6-state-schema)
7. [Human-in-the-Loop (HITL)](#7-human-in-the-loop-hitl)
8. [Parallel Execution](#8-parallel-execution)
9. [API Layer](#9-api-layer)
10. [Data Flow](#10-data-flow)
11. [Storage](#11-storage)
12. [Authentication Modes](#12-authentication-modes)
13. [Error Handling](#13-error-handling)
14. [Configuration Reference](#14-configuration-reference)

---

## 1. System Overview

The AI Storytelling Backend is an async Python service that accepts a story topic and preferences, orchestrates a multi-agent LangGraph pipeline to plan, write, assemble, and illustrate the story, and exposes results over a REST API with live Server-Sent Events (SSE) progress streaming.

```
Client
  │
  │  POST /stories/generate
  ▼
FastAPI (api/main.py)
  │  creates Story row (status=queued)
  │  fires background task
  ▼
pipeline_runner.py          ← LangGraph runner (AsyncSqliteSaver checkpointer)
  │
  ▼
LangGraph StateGraph (graph/pipeline.py)
  ├── plan_story             (Gemini LLM — structured output)
  ├── await_approval         (optional HITL interrupt)
  ├── generate_chapter ×N   (parallel fan-out, Gemini LLM)  ──┐
  ├── assemble_story         (fan-in, deterministic merge)     │ concurrent
  └── generate_cover         (Imagen API — image gen)         ──┘
  │
  ▼
PostgreSQL                   (story rows, outline JSON, draft script, cover image)
  │
  ▼
Client polls GET /stories/{id}  or streams GET /stories/{id}/events
```

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| API framework | FastAPI 0.115+ with Uvicorn |
| Pipeline orchestration | LangGraph (`StateGraph`, `Send`, `interrupt`) |
| LLM — text | `langchain-google-genai` → `ChatGoogleGenerativeAI` (Gemini) |
| LLM — image | `google-genai` SDK → Imagen |
| Database ORM | SQLAlchemy 2 (async) + asyncpg driver |
| Database | PostgreSQL |
| Checkpoints | `AsyncSqliteSaver` (LangGraph) → SQLite file |
| Planner cache | `SqliteCache` (LangGraph) → separate SQLite file |
| Migrations | Alembic |
| Settings | `pydantic-settings` (`.env` + env vars) |
| Containerisation | Docker (single-stage `Dockerfile`) |

---

## 3. Directory Layout

```
.
├── api/
│   ├── main.py          # FastAPI app, route handlers, SSE
│   ├── schemas.py       # Pydantic request/response models
│   └── dependencies.py  # FastAPI Depends factories
├── agents/
│   ├── planner.py       # plan_story node — Gemini structured output
│   ├── generator.py     # generate_chapter node — parallel workers
│   ├── assembler.py     # assemble_story node — deterministic merge
│   ├── cover_artist.py  # generate_cover node — Imagen cover image
│   └── saver.py         # (saver helper)
├── graph/
│   └── pipeline.py      # StateGraph definition, edges, cache/retry policies
├── state/
│   └── schema.py        # StoryState, StoryOutline, LENGTH_CONFIG
├── services/
│   └── story_service.py # Business logic, orchestrates DB + pipeline
├── repositories/
│   └── story_repo.py    # Async DB queries
├── storage/
│   ├── db.py            # SQLAlchemy engine, Story ORM model
│   └── media.py         # S3/MinIO helpers
├── pipeline_runner.py   # Streams pipeline events, updates DB
├── background.py        # FastAPI BackgroundTask entry point
├── config.py            # Pydantic Settings (all env vars)
└── alembic/             # DB migration scripts
```

---

## 4. Pipeline Topology

```
START
  │
  ▼
┌─────────────┐   cached + retry×3
│  plan_story │────────────────────────────────────────────────┐
└─────────────┘                                                 │
  │                                                             │
  ▼                                                             │
┌────────────────┐                                              │
│ await_approval │  (interrupt if require_approval=true)        │
└────────────────┘                                              │
  │                            │                               │
  │ (conditional fan-out)      │ (direct edge)                 │
  ▼                            ▼                               │
┌──────────────────┐   ┌───────────────┐                       │
│ generate_chapter │   │ generate_cover│  (no retry)           │
│   ×N parallel    │   └───────────────┘                       │
│   retry×3        │           │                               │
└──────────────────┘           ▼                               │
  │                           END  ◄──────────────────────────-┘
  ▼
┌───────────────┐
│ assemble_story│
└───────────────┘
  │
  ▼
 END
```

Two independent branches run **concurrently** after `await_approval`:
- **Text branch**: `assign_workers` fans out one `generate_chapter` worker per chapter → `assemble_story` → END
- **Cover branch**: `generate_cover` → END

LangGraph merges both branches; the pipeline completes when both are done.

---

## 5. Node Reference

### `plan_story` (`agents/planner.py`)
- Calls Gemini with a structured-output schema (`PlannerOutput`) to produce a story outline: hook, chapters (with sections), climax, and closing.
- Applies **`CachePolicy`** keyed on topic/tone/audience/length/user_prefs (excluding `voice`, `require_approval`) with configurable TTL — identical requests reuse the cached plan.
- Applies **`RetryPolicy(max_attempts=3)`** for transient Gemini errors.
- Post-processes the raw LLM output to assign global section indexes, flatten sections into a list, and compute word/minute targets from `LENGTH_CONFIG`.

### `await_approval` (`graph/pipeline.py`)
- If `user_prefs.require_approval` is `False` (default), acts as a passthrough (returns `{}`).
- If `True`, calls `interrupt({"outline": state["outline"]})`, pausing the graph and surfacing the outline to the API caller.
- On resume, accepts an optional edited outline via `Command(resume=outline_dict)`.
- See [Section 7](#7-human-in-the-loop-hitl) for the full HITL flow.

### `generate_chapter` (`agents/generator.py`)
- One worker is dispatched per chapter via the `Send` API (fan-out).
- Each worker receives its `ChapterWorkerState`: the chapter object, tone, audience, and `target_words`.
- Calls Gemini for each section in the chapter sequentially, generating prose content.
- Returns `{"sections_done": [...]}`. The `operator.add` reducer on `StoryState.sections_done` safely merges concurrent workers' results.
- **`RetryPolicy(max_attempts=3)`** applied.

### `assemble_story` (`agents/assembler.py`)
- Fan-in node: waits until all `generate_chapter` workers complete (LangGraph implicit barrier).
- Sorts `sections_done` by `index`, concatenates content, and builds the `draft_script`.
- Deterministic — no LLM call.

### `generate_cover` (`agents/cover_artist.py`)
- Calls the Imagen API (`imagen-4.0-generate-001` by default) to generate a book cover illustration.
- Builds a prompt from story topic, tone, and audience.
- Returns `{"cover_image": "<base64-encoded PNG>"}`.
- **No `RetryPolicy`** — billing/plan errors are caught inside the node and return `{"cover_image": None}` rather than crashing the pipeline (graceful degradation).
- Transient network errors propagate normally.
- Auth: uses Vertex AI client (`vertexai=True, project, location`) or Developer API client (`api_key`) based on `settings.use_vertex_ai`.

---

## 6. State Schema

All state flows through `StoryState` (defined in `state/schema.py`).

### `StoryState` Fields

| Field | Type | Set by | Description |
|---|---|---|---|
| `story_id` | `str` | Service | UUID for the story |
| `topic` | `str` | Request | Story subject |
| `tone` | `Literal[...]` | Request | `inspirational`, `dark`, `educational`, `funny` |
| `audience` | `str` | Request | Target audience description |
| `length` | `Literal[...]` | Request | `short`, `medium`, `long` |
| `user_prefs` | `dict` | Request | Per-user preferences (e.g. `require_approval`, `voice`) |
| `outline` | `StoryOutline \| None` | `plan_story` | Full story plan with chapters and sections |
| `sections_done` | `list[dict]` | `generate_chapter` | Accumulated section outputs (reducer: `operator.add`) |
| `draft_script` | `str \| None` | `assemble_story` | Full assembled story text |
| `script_path` | `str \| None` | Saver | S3/MinIO object key |
| `cover_image` | `str \| None` | `generate_cover` | Base64-encoded PNG cover image |
| `retry_count` | `int` | Internal | Error retry counter |
| `error` | `str \| None` | Internal | Last error message |

### `LENGTH_CONFIG` — Story Sizing

| Length | Chapters | Sections/ch | Words/section | ~Duration |
|---|---|---|---|---|
| `short` | 2 | 4 | 175 | ~10 min |
| `medium` | 4 | 6 | 250 | ~46 min |
| `long` | 6 | 8 | 300 | ~90 min |

Narration pace: 130 words/minute (industry standard).

---

## 7. Human-in-the-Loop (HITL)

The HITL flow uses LangGraph's `interrupt` / `Command(resume=...)` mechanism.

```
POST /stories/generate  { require_approval: true }
        │
        ▼
  plan_story runs → outline produced
        │
        ▼
  await_approval calls interrupt()
  ← graph pauses, checkpoint saved to SQLite
        │
        ▼
  GET /stories/{id}  → status="awaiting_approval", outline returned
        │
  (human reviews / edits outline)
        │
        ▼
  POST /stories/{id}/approve  { outline: {...} }   ← (or omit to keep original)
        │
        ▼
  pipeline_runner resumes graph with Command(resume=outline_dict)
        │
        ▼
  await_approval returns edited outline (or original)
        │
        ▼
  generate_chapter + generate_cover run (parallel)
```

**LangGraph HITL constraints observed:**
- `interrupt()` is never wrapped in `try/except`.
- All code before `interrupt()` in `await_approval` is read-only (safe to re-run on resume).
- Resume payload must be JSON-serializable.

---

## 8. Parallel Execution

```
await_approval ──┬── assign_workers ──► generate_chapter ×N ──► assemble_story ──► END
                 │                           (fan-out / fan-in)
                 └──► generate_cover ──────────────────────────────────────────────► END
```

- **Chapter fan-out**: `assign_workers` returns a `list[Send]`, one per chapter. LangGraph dispatches all workers concurrently. The `operator.add` reducer on `sections_done` is the merge mechanism.
- **Cover parallelism**: `generate_cover` is wired with a direct edge from `await_approval`, so it starts at the same time as the chapter workers and runs independently.
- Both branches must complete before the graph fully terminates.

---

## 9. API Layer

All routes are defined in `api/main.py`. Base URL: `http://host:port`.

| Method | Path | Status | Description |
|---|---|---|---|
| `GET` | `/health` | 200 | Liveness check |
| `POST` | `/stories/generate` | 202 | Submit a new story generation job |
| `GET` | `/stories/{id}` | 200 | Fetch status, outline, script, cover_image |
| `GET` | `/stories/{id}/events` | 200 | SSE stream of live progress events |
| `GET` | `/stories/{id}/cover` | 200 | Binary PNG cover image |
| `PATCH` | `/stories/{id}/outline` | 200 | Update story outline (pre-generation) |
| `POST` | `/stories/{id}/approve` | 200 | Resume a paused HITL pipeline |
| `POST` | `/stories/{id}/listen` | 200 | Initialize TTS listening session |
| `GET` | `/stories` | 200 | List all stories (summary) |

### SSE Events (`GET /stories/{id}/events`)

The endpoint streams `text/event-stream` events until the story reaches a terminal state or a 30-minute timeout. Each event carries a JSON payload:

```json
{ "story_id": "...", "status": "chapter_generating", "node": "generate_chapter", ... }
```

`StoryEventBroker` is an in-process singleton that `pipeline_runner` publishes to; the SSE handler subscribes per story ID.

---

## 10. Data Flow

```
1. POST /stories/generate
   │  StoryService.create_story()
   │  → INSERT story row (status=queued)
   │  → fire BackgroundTask(run_pipeline, story_id)
   └──────────────────────────────────────────────────┐
                                                       │
2. BackgroundTask (background.py)                      │
   │  pipeline_runner._stream_pipeline()               │
   │  → graph.astream(initial_state, config)           │
   │                                                   │
3. LangGraph pipeline executes (see §4)                │
   │  Each node completion emits a stream event        │
   │                                                   │
4. pipeline_runner processes each event:               │
   │  → UPDATE story SET status=<node_status>          │
   │  → publish to StoryEventBroker                    │
   │  → if node==generate_cover: store cover_image     │
   │  → if node==assemble_story: store draft_script    │
   │                                                   │
5. Client polls or streams:                            │
   │  GET /stories/{id}         → current DB state     │
   │  GET /stories/{id}/events  → live SSE updates     │
   │                                                   │
6. Terminal state: status=completed | failed           │
   └──────────────────────────────────────────────────-┘
```

---

## 11. Storage

### PostgreSQL — `stories` Table

| Column | Type | Description |
|---|---|---|
| `id` | UUID / TEXT | Primary key (story_id) |
| `topic` | TEXT | Story topic |
| `tone` | TEXT | Tone enum value |
| `audience` | TEXT | Audience string |
| `length` | TEXT | Length enum value |
| `status` | TEXT | Pipeline status |
| `outline_json` | JSONB / TEXT | Serialized `StoryOutline` |
| `draft_script` | TEXT | Full assembled story text |
| `script_path` | TEXT | S3/MinIO object key |
| `cover_image` | TEXT | Base64-encoded PNG cover (nullable) |
| `error` | TEXT | Last error message (nullable) |
| `created_at` | TIMESTAMP | Row creation time |
| `updated_at` | TIMESTAMP | Last update time |

Migrations are managed via **Alembic** (`alembic/versions/`).

### SQLite — Checkpoints

File: `settings.checkpoint_sqlite_path` (default: `.langgraph-checkpoints.sqlite`)

Used by `AsyncSqliteSaver` to persist LangGraph thread state between API restarts and across HITL interrupts. Required for `interrupt` / `Command(resume=...)` to work.

### SQLite — Planner Cache

File: `settings.graph_cache_sqlite_path` (default: `.langgraph-cache.sqlite`)

Used by LangGraph's `CachePolicy` on the `plan_story` node. Identical planning requests within the TTL window skip the Gemini call entirely.

### S3 / MinIO

Story scripts can optionally be saved to object storage. `storage/media.py` provides the bucket management helpers. Configured via `s3_*` settings.

---

## 12. Authentication Modes

The service supports two mutually exclusive Google AI authentication modes, controlled by `USE_VERTEX_AI`.

### Mode A — Gemini Developer API (default)

```
USE_VERTEX_AI=false
GEMINI_API_KEY=<your-api-key>
```

- LLM agents (`planner`, `generator`): `ChatGoogleGenerativeAI(model=..., google_api_key=...)`
- Imagen client: `genai.Client(api_key=...)`

### Mode B — Vertex AI

```
USE_VERTEX_AI=true
VERTEX_PROJECT_ID=<gcp-project>
VERTEX_LOCATION=us-central1
```

- LLM agents: `ChatGoogleGenerativeAI(model=..., vertexai=True, project=..., location=...)`
- Imagen client: `genai.Client(vertexai=True, project=..., location=...)`

> **Important**: In Vertex AI mode, `api_key` is **not** passed to `genai.Client`. `project/location` and `api_key` are mutually exclusive in the `google-genai` SDK and will raise a `ValueError` if both are supplied.

`config.Settings.llm_kwargs` is a property that returns the correct keyword dict for `ChatGoogleGenerativeAI` based on the active mode.

---

## 13. Error Handling

| Scenario | Handling |
|---|---|
| Transient Gemini error (5xx, timeout) | `RetryPolicy(max_attempts=3)` on `plan_story` and `generate_chapter` |
| Imagen billing / plan error (400/403 + billing phrase) | Caught inside `generate_cover`; returns `{"cover_image": None}` — pipeline continues without cover |
| Imagen transient error | Propagates normally (no retry policy — caller can retry the whole story) |
| Missing outline (empty chapters) | `assign_workers` returns `[]`; graph routes to END gracefully |
| Unhandled exception in pipeline | `pipeline_runner` catches, sets `story.status = "failed"`, stores `error` message |
| FastAPI unhandled exception | Global `exception_handler` returns 500 with generic message; full stack trace logged |

---

## 14. Configuration Reference

All settings are loaded from `.env` or environment variables by `pydantic-settings`.

| Variable | Default | Description |
|---|---|---|
| `APP_ENV` | `development` | `development` \| `production` |
| `APP_LOG_LEVEL` | `INFO` | Python logging level |
| `CORS_ALLOW_ORIGINS` | `["http://localhost:3000"]` | Allowed CORS origins (JSON array) |
| `DATABASE_URL` | `postgresql+asyncpg://...` | Async PostgreSQL connection string |
| `CHECKPOINT_SQLITE_PATH` | `.langgraph-checkpoints.sqlite` | LangGraph checkpoint store |
| `GRAPH_CACHE_SQLITE_PATH` | `.langgraph-cache.sqlite` | LangGraph node cache store |
| `PLANNER_CACHE_TTL_SECONDS` | `3600` | Planner cache TTL in seconds |
| `USE_VERTEX_AI` | `false` | Enable Vertex AI mode |
| `VERTEX_PROJECT_ID` | `""` | GCP project ID (Vertex mode) |
| `VERTEX_LOCATION` | `us-central1` | Vertex AI region |
| `VERTEX_AI_API` | `""` | Optional Vertex Express API key |
| `GEMINI_API_KEY` | `""` | Gemini Developer API key (non-Vertex mode) |
| `GEMINI_MODEL` | `gemini-2.5-flash-lite` | LLM model for planner and generator |
| `IMAGEN_MODEL` | `imagen-4.0-generate-001` | Imagen model for cover generation |
| `GEMINI_TTS_MODEL` | `gemini-2.5-flash-preview-tts` | TTS model |
| `S3_BUCKET_NAME` | — | Object storage bucket name |
| `S3_ENDPOINT_URL` | — | MinIO / S3-compatible endpoint |
| `S3_ACCESS_KEY` | — | Storage access key |
| `S3_SECRET_KEY` | — | Storage secret key |
