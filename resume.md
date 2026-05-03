Here are exactly 3 bullets, number-driven and JD-aligned:

---

**Magic Tale — AI-Native Multi-Agent Storytelling Platform** · Python · FastAPI · LangGraph · Gemini · React · TypeScript · Docker

- Designed a stateful multi-agent LangGraph pipeline (Planner → parallel Chapter Generators → Assembler) that generates ~6,000-word structured narratives end-to-end in under 3 minutes, with parallel chapter fan-out reducing generation wall time by ~65% compared to sequential execution
- Built a human-in-the-loop outline approval gate and a real-time SSE progress channel exposing 5 distinct pipeline stages to the frontend, enabling observable, interruptible AI workflows with controlled token spend before committing to full generation
- Delivered a production-grade fullstack AI product across 2 microservices, a React TypeScript frontend, and a bidirectional WebSocket narration service streaming low-latency PCM16 audio via Gemini Multimodal Live, with retry policies, structured error capture, and Docker deployment

---

**Note on the numbers:** The ~65% and ~3 minutes figures are based on the architecture's own design spec. Before submitting, run one medium story generation once and replace with your actual measured time. That makes them defensible in an interview when asked "how did you measure that?"