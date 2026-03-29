# Storytelling AI 🎭

> **An AI-powered storytelling platform that generates high-quality long-form narratives and delivers them as expressive real-time audio experiences.**

Storytelling AI combines cutting-edge language models with a sophisticated backend architecture to create immersive, interactive storytelling experiences. The system is designed for scalability, real-time performance, and human-in-the-loop control.

---

## 🎯 Project Overview

**Storytelling AI** is a distributed microservices platform that transforms topics into complete stories with realistic, expressive narration. The system employs a multi-stage AI workflow that:

1. **Plans** a narrative structure with detailed outlines
2. **Generates** story chapters in parallel for maximum speed
3. **Assembles** a polished final script
4. **Narrates** the story with expressive, real-time audio synthesis

The entire journey—from topic submission to completed narration—integrates seamlessly across backend services, distributed workers, and a modern React frontend.

---

## 🏗️ System Architecture

### High-Level Overview

![Storytelling AI System Architecture Diagram showing Frontend, Cloud Run with microservices, and cloud infrastructure](doc/arc-diagram.png)


## 🖼️ UI Preview

Experience the Storytelling AI interface:

| The Library | The Studio | The Narrator |
|---|---|---|
| ![Story Library Dashboard](doc/screenshots/library.png) | ![Generation Studio](doc/screenshots/studio.png) | ![Audio Playback Player](doc/screenshots/playing.png) |
| Browse and manage your story collection | Generate and edit new stories | Listen with expressive narration |

---

### Core Microservices

#### 1. **Main Storytelling API** (`/backend/main`)
The orchestration hub for story generation.

**Responsibilities:**
- Accept story generation requests from the frontend
- Manage human-in-the-loop approval flows
- Dispatch long-running tasks to Celery workers
- Stream real-time SSE progress updates to the frontend
- Persist story metadata to PostgreSQL

**Key Components:**
- `api/`: FastAPI routes and Pydantic schemas
- `services/`: Business logic orchestration
- `repositories/`: Database abstraction layer
- `agents/`: LangGraph AI workflow nodes
- `graph/`: State machine definition
- `storage/`: PostgreSQL and MinIO clients

#### 2. **Interactive Narrator** (`/backend/tts`)
A specialized service for real-time, expressive audio narration.

**Responsibilities:**
- Manage narration sessions with bi-directional WebSocket communication
- Stream PCM16 audio from Gemini Multimodal Live model
- Sync playback with story segments for UI highlighting
- Handle session lifecycle (create, reconnect, cleanup)

**Key Components:**
- `main.py`: FastAPI WebSocket routes
- `agent.py`: Gemini Live integration
- `models.py`: WebSocket message schemas
- `parser.py`: Audio stream processing

---

## 🎬 Story Generation Pipeline

The LangGraph-powered state machine orchestrates a sophisticated multi-stage workflow:

```
Start
  │
  ├─→ [Planner Agent]
  │   └─→ Generates narrative outline (chapters, sections)
  │
  ├─→ [Human Review Gate] ⏸️
  │   └─→ User can edit outline via `PATCH /stories/{id}/outline`
  │       Then approve via `POST /stories/{id}/approve`
  │
  ├─→ [Chapter Generator Fan-out] ⚡ (Parallel)
  │   ├─→ Worker 1: Generate Chapter 1
  │   ├─→ Worker 2: Generate Chapter 2
  │   └─→ Worker N: Generate Chapter N
  │
  ├─→ [Script Assembler]
  │   └─→ Stitch chapters into cohesive narrative
  │
  ├─→ [Saver Node]
  │   └─→ Upload final script to S3/MinIO
  │       Update story status to "completed"
  │
End (Status: completed)
```

### Agent Roles

| Agent | Role | Output |
|-------|------|--------|
| **Planner** | Creates high-level narrative structure | `outline_json` (chapters, sections) |
| **Chapter Generator** | Writes prose for individual chapters (parallelized) | `chapters_content` (per-chapter prose) |
| **Script Assembler** | Stitches chapters and smooths transitions | `draft_script` (final polished text) |
| **Saver** | Persists output to cloud storage and database | `script_path` (S3 URL) |

### Key Features

- **Parallel Chapter Generation**: Reduces generation time by 60-70% vs. sequential
- **Human-in-the-Loop**: Pause after planning phase for outline review and edits
- **Deterministic State**: Full auditability of each transformation step
- **Resume Capability**: Can retry or resume from checkpoints if errors occur

---

## 🛠️ Tech Stack

### Backend

![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=flat-square&logo=fastapi&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Google%20Gemini-8E75B2?style=flat-square&logo=googlegemini&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-1C3C3C?style=flat-square&logo=langchain&logoColor=white)
![Celery](https://img.shields.io/badge/Celery-37814A?style=flat-square&logo=celery&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-D71F00?style=flat-square&logo=sqlalchemy&logoColor=white)
![MinIO](https://img.shields.io/badge/MinIO-C72E49?style=flat-square&logo=minio&logoColor=white)
![Pytest](https://img.shields.io/badge/Pytest-0A9EDC?style=flat-square&logo=pytest&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)

### Frontend

![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Redux](https://img.shields.io/badge/Redux-764ABC?style=flat-square&logo=redux&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Clerk](https://img.shields.io/badge/Clerk-6C47FF?style=flat-square&logo=clerk&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFA400?style=flat-square&logo=firebase&logoColor=white)
![Framer Motion](https://img.shields.io/badge/Framer%20Motion-0055FF?style=flat-square&logo=framer&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)

### Infrastructure

![Google Cloud Run](https://img.shields.io/badge/Google%20Cloud%20Run-4285F4?style=flat-square&logo=googlecloud&logoColor=white)
![Cloud SQL](https://img.shields.io/badge/Cloud%20SQL-4285F4?style=flat-square&logo=googlecloud&logoColor=white)
![Cloud Storage](https://img.shields.io/badge/Cloud%20Storage-4285F4?style=flat-square&logo=googlecloud&logoColor=white)
![Upstash Redis](https://img.shields.io/badge/Upstash%20Redis-00AA42?style=flat-square&logo=redis&logoColor=white)
![Gemini Live API](https://img.shields.io/badge/Gemini%20Live%20API-8E75B2?style=flat-square&logo=GoogleChromeWebStore&logoColor=white)

---

## 🚀 Key Features

### 1. **Parallel Story Generation**
   - Multiple chapters generated simultaneously using Celery workers
   - Maintains narrative consistency through shared context
   - 60-70% faster generation compared to sequential processing

### 2. **Human-in-the-Loop Design**
   - Pause after outline generation for manual review
   - Edit and approve outlines via API before full generation
   - Cost control by potentially abandoning low-quality outlines early

### 3. **Real-Time Progress Monitoring**
   - Server-Sent Events (SSE) stream real-time status updates
   - Track current AI agent execution phase
   - Percentage completion and detailed event logs

### 4. **Expressive Real-Time Narration**
   - Gemini Multimodal Live for natural-sounding narration
   - Bi-directional WebSocket streaming for low-latency audio
   - Segment synchronization for interactive "karaoke" highlighting

### 5. **Clean Architecture**
   - Clear separation of concerns (API, Service, Repository layers)
   - Repository pattern for database abstraction
   - Easy to test and maintain
   - Decoupled microservices

### 6. **Production-Ready Infrastructure**
   - Docker containerization for all services
   - Cloud-native design (Google Cloud Run, Cloud SQL, Cloud Storage)
   - Automatic scaling and cost optimization
   - Managed Redis and PostgreSQL

---

## 🎯 Architecture Decision Records (ADRs)

### ADR 1: LangGraph for Stateful AI Workflows
Chosen because of built-in checkpointing, state persistence, and support for cyclic flows. Enables the "Human-in-the-Loop" pattern.

### ADR 2: Repository Pattern
Decouples business logic from database operations. Makes testing trivial and ensures consistency across API and background workers.

### ADR 3: Parallel Chapter Generation (Fan-out)
Dramatically improves performance without sacrificing narrative consistency by providing each worker with the full story outline context.

### ADR 4: S3-Based Script Exchange
Decouples the Main API from the TTS service. Scripts are fetched by the Narrator at its own pace, enabling independent scaling.

### ADR 5: Gemini Multimodal Live for Narration
Provides human-like expressiveness, low latency, and future-proofs the system for interactive narrator-user conversations.

---

## 📊 Data Flow Examples

### Example 1: Story Generation Request

```
Frontend → POST /stories/generate
         ↓
         Main API validates input
         ↓
         Creates Story record (status: "processing")
         ↓
         Dispatches Celery task
         ↓
         Returns { story_id, status }
         ↓
Frontend ← Response + Starts SSE listener
```

### Example 2: Real-Time Audio Narration

```
Frontend → POST /stories/{id}/listen
         ↓
         Fetches script from S3
         ↓
         Creates session with Gemini Live
         ↓
Frontend ← session_id + segment_data
         ↓
Frontend → WebSocket connect to ws://narrator:8001/ws/...
         ↓
         Narrator streams PCM16 audio
         ↓
         Sends segment sync events
         ↓
Frontend ← Audio + Sync events (highlight UI)
```

---

## 🏃‍♂️ Operational Workflows

### Adding a New Story Feature

1. **Update LangGraph Pipeline** (`agents/` and `graph/`)
2. **Update Story State** (`state/schema.py`)
3. **Update Repository** (`repositories/story_repo.py`)
4. **Update Service** (`services/story_service.py`)
5. **Add API Route** (`api/main.py`)
6. **Add Database Migration** (`alembic/versions/`)
7. **Test** with Pytest
8. **Update Frontend** components as needed
9. **Update docs** (`doc/` files)


---

## 📚 Additional Resources

- [System Architecture](doc/architecture.md) - Detailed technical architecture
- [Agent Flow](doc/agent_flow.md) - LangGraph pipeline deep-dive
- [Architecture Decisions](doc/decisions.md) - ADRs and rationale
- [Frontend Integration](doc/frontend_integration.md) - Frontend developer guide
- [Backend README](backend/main/README.md) - Backend-specific documentation
- [Frontend README](frontend/README.md) - Frontend-specific documentation

---
**Last Updated**: March 29, 2026  
**Status**: Active Development 🚀
