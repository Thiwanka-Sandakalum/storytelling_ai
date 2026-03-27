# Storytelling AI API

> A production-hardened, clean-architecture AI storytelling pipeline powered by **FastAPI**, **LangGraph**, and **Celery**.

The **Storytelling AI API** is an advanced backend system designed to generate long-form, high-quality narratives through a multi-stage agentic workflow. It uses **Parallel Generation** to write chapters simultaneously and supports a **Human-in-the-Loop** model where users can review and approve a story's structure before it is fully written.

---

## 📖 How it Works

The system follows a three-step process to ensure narrative consistency and high performance:

1.  **Planning (The Blueprint)**: When you submit a topic, a **Planner AI** first creates a detailed structural outline (chapters and sections).
2.  **Verification (The Review)**: You can review this outline. If it looks good, you "Approve" it.
3.  **Generation (The Construction)**: Once approved, the system starts multiple **Chapter Workers** at once. They write the prose for each chapter in parallel, drastically reducing generation time while maintaining a consistent "memory" of the story's overall arc.
4.  **Assembly (The Final Polish)**: A final **Assembler AI** stitches everything together, ensuring smooth transitions and a polished final script.

---

## 🏗️ Architecture

This project follows **Clean Architecture** principles to ensure decoupling and testability.

![alt text](doc/image-2.png)

---

## 🛠️ Tech Stack

| Category | Technologies |
|---|---|
| **Frameworks** | ![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi) ![LangChain](https://img.shields.io/badge/LangChain-1C3C3C?style=for-the-badge&logo=langchain) |
| **Logic & AI** | ![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white) ![Gemini](https://img.shields.io/badge/Google%20Gemini-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white) |
| **Data Layer** | ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white) ![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-D71F00?style=for-the-badge&logo=sqlalchemy&logoColor=white) |
| **Messaging** | ![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white) ![Celery](https://img.shields.io/badge/Celery-37814A?style=for-the-badge&logo=celery&logoColor=white) |
| **DevOps** | ![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white) ![MinIO](https://img.shields.io/badge/MinIO-C72E49?style=for-the-badge&logo=minio&logoColor=white) |
| **Testing** | ![Pytest](https://img.shields.io/badge/Pytest-0A9EDC?style=for-the-badge&logo=pytest&logoColor=white) |

---

## 🚀 Key Features

- **Parallel Generation**: Orchestrates multiple Gemini LLM workers per chapter for high-speed script generation.
- **Human-in-the-Loop**: Supports manual approval of story outlines before proceeding to full content generation.
- **Real-time Monitoring**: Streams execution progress to the frontend via Server-Sent Events (SSE).
- **Clean Architecture**: Decoupled Repository and Service layers for robust data management and business logic.
- **Full Persistence**: Tracks every story generation job, including intermediate states and error logs.

---

## 🏗️ Design Decisions & Patterns

### 1. Clean Architecture (Repository & Service)
To avoid the "God object" anti-pattern, we decoupled the system into three distinct layers:
- **Repository Pattern**: Encapsulates all SQLAlchemy logic. The rest of the app doesn't know about databases; it only knows about the `StoryRepository` interface.
- **Service Layer**: Centralizes orchestration logic. This layer makes decisions (like when to trigger a Celery task or when to update a status) and acts as the bridge between the API and data layers.

### 2. Asynchronous Orchestration (Celery + LangGraph)
Story generation is a long-running process (minutes, not seconds). We use **Celery** to move this work out of the web request lifecycle, preventing timeouts. **LangGraph** is used inside the Celery worker to manage the complex, stateful flow of the AI agents.

### 3. Parallel Chapter Generation (Fan-out)
Instead of generating one chapter after another, we use a **Fan-out/Fan-in** pattern. The system launches multiple AI workers in parallel (one per chapter). This reduces the total generation time by **60-70%** without sacrificing narrative quality.

### 4. Human-in-the-Loop (Stateful Pause)
By design, the pipeline can pause after the "Planning" phase. This allows a user to review the outline via the API and provide a manual "Approve" signal before the system consumes more LLM tokens for the full content generation.

---

## 📂 Project Structure

- `api/`: FastAPI routes, schemas (Pydantic), and Dependency Injection.
- `services/`: Domain services orchestrating business logic (Generation, Approval, Management).
- `repositories/`: Data access layer encapsulating all SQLAlchemy database operations.
- `agents/`: LangGraph nodes (AI Workers) for planning, content generation, and assembly.
- `graph/`: LangGraph state machine definition and orchestration logic.
- `tasks/`: Celery task wrappers and Redis event publishing for real-time updates.
- `storage/`: Infrastructure helpers for PostgreSQL (async) and S3/MinIO.
- `tests/`: Automated testing suite (Unit & Integration).

---

## 🛠️ Quick Start

### 1. Prerequisites
- Python 3.11+
- PostgreSQL
- Redis
- MinIO (or AWS S3)

### 2. Installation
```bash
git clone <repository-url>
cd storytelling_ai
cp .env.example .env  # Configure your API keys and DB URLs
pip install -r requirements.txt
```

### 3. Run the Application
```bash
# Start the API
uvicorn api.main:app --reload

# Start the Background Worker (separate terminal)
celery -A tasks.celery_app worker --loglevel=info
```

### 4. Run Tests
```bash
pytest tests/
```

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/stories/generate` | Submit a new story generation request. |
| `GET` | `/stories/{id}` | Get detailed status and outputs for a story. |
| `GET` | `/stories/{id}/stream` | SSE stream for real-time progress updates. |
| `POST` | `/stories/{id}/approve` | Approve a story outline to resume generation. |
| `GET` | `/stories/` | List all historical story jobs (paginated). |
| `DELETE` | `/stories/{id}` | Delete a story record and its associated storage assets. |

---

## 🧪 Development

### LangGraph Observability
Enable LangSmith for deep-dive tracing of agent decisions:
```env
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your_key
```
