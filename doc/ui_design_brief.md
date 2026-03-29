# UI/UX Design Brief: Storytelling AI

> **Goal**: Create an immersive, high-end "Magic Tale" experience where users transcend simple text and enter a living narration studio.

---

## 🎨 Creative Vision & Aesthetic
- **Theme**: "Ethereal & Cinematic"
- **Style**: Dark Mode, Glassmorphism, Radiant Gradients (Deep Purples, Cosmic Blues, Neon Accents).
- **Typography**: A mix of a sleek Sans-Serif (e.g., Inter) for UI and a sophisticated Serif (e.g., Playfair Display) for the Story Prose.
- **Micro-interactions**: Use "pulsing" or "glowing" animations to represent the AI thinking and high-performance chapter worker fan-out.

---

## 🏗️ Core Components & Views

### 1. The Forge (Creation Dashboard)
The "start" of the journey.
- **Inputs**: A prominent text area for the "Story Seed" (topic).
- **Controls**: Premium selectors for **Tone** (Inspirational, Gothic, Noir, Whimsical) and **Audience**.
- **The Trigger**: A high-impact "Ignite Tale" or "Animate" button that initiates the backend pipeline.

### 2. The Blueprint (Outline Discovery)
The "Human-in-the-Loop" phase.
- **Progress Tracker**: A sleek, real-time list or graph that shows the AI Architect (Planner) building the chapters. Use a terminal-like "log" or a glowing node network for progress.
- **Outline Editor**: Once the planner finishes, chapters should appear as editable cards.
- **Approval Action**: A transition to the "Full Generation" phase with a satisfaction signal.

### 3. The Narrator Studio (The Main Event)
The climax of the experience.
- **The Voice**: A central visual element representing the narrator (e.g., an organic, fluid waveform or a minimalist AI avatar).
- **Dynamic Prose**: The story text should be large and beautiful. 
- **Voice-Text Sync**: As the WebSocket streams audio, words or paragraphs should **highlight in real-time** (Karaoke style) with smooth opacity transitions.
- **Controls**: Pause/Resume and a "Talk Back" mic toggle for future interactivity.

---

## 📡 Essential Technical Hooks (For the Designer)
- **SSE Events**: The UI needs areas to display `pipeline.state_changed` (e.g., "AI is drafting Chapter 3...").
- **WebSocket State**: Visual indicators for "Connecting," "Streaming," and "Narrator Finished."
- **Fan-out Visualization**: When multiple workers start, show multiple "pulses" or worker chips operating simultaneously to highlight the speed of the backend.

---

## 🌟 Desired "WOW" Factors
- **Ambient Glow**: Background should subtly shift colors based on the story's tone (e.g., warmer for 'Inspirational', colder for 'Noir').
- **Particle Effects**: Small particles that move when the audio is playing, syncing with the waveform.
- **Seamless Life-cycle**: No hard page reloads. Transitions from Planning to Writing to Listening should be one fluid, animated flow.
