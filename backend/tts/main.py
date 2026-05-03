"""FastAPI application for interactive storyteller service."""
import asyncio
import base64
import json
import logging
import os
import uuid
import warnings
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.genai import types, errors

from dependencies import get_session_service, get_runner, get_app_name
from models import CreateSessionRequest, CreateSessionResponse
from parser import parse_text, to_narration_instruction, to_segment_data

logger = logging.getLogger("tts.api")
log_level_name = os.getenv("TTS_LOG_LEVEL", "INFO").upper()
log_level = getattr(logging, log_level_name, logging.INFO)
logging.basicConfig(level=log_level)

# Third-party live-audio DEBUG logs are extremely expensive because they format
# large binary payloads for every chunk. Keep them at WARNING by default.
logging.getLogger("websockets").setLevel(logging.WARNING)
logging.getLogger("websockets.client").setLevel(logging.WARNING)
logging.getLogger("google_adk").setLevel(logging.INFO)
logging.getLogger("google.genai").setLevel(logging.INFO)

# ADK currently emits a non-fatal Pydantic warning for response_modalities
# serialization in live audio mode. Suppress only this known warning.
warnings.filterwarnings(
    "ignore",
    message=r"PydanticSerializationUnexpectedValue\(Expected `enum`.*field_name='response_modalities'",
    category=UserWarning,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle handler."""
    logger.info("Starting Interactive Storyteller Service")
    yield
    logger.info("Shutting down Interactive Storyteller Service")


app = FastAPI(title="Interactive Storyteller", lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# REST: Session Management


@app.post("/api/sessions", response_model=CreateSessionResponse)
async def create_session(
    req: CreateSessionRequest,
    session_service=Depends(get_session_service),
    app_name=Depends(get_app_name),
):
    """Create a new storyteller session using script text passed from main-api."""
    story_text = req.script_text
    if not story_text:
        raise HTTPException(
            status_code=400,
            detail=f"No script text provided for story {req.story_id}",
        )

    segments = parse_text(story_text)
    if not segments:
        raise HTTPException(status_code=400, detail="Failed to parse story content")

    user_id = req.user_id or f"user-{uuid.uuid4().hex[:8]}"
    session_id = str(uuid.uuid4())

    # Persist narration script in session state
    await session_service.create_session(
        app_name=app_name,
        user_id=user_id,
        session_id=session_id,
        state={
            "segments": to_segment_data(segments),
            "narration_instruction": to_narration_instruction(segments),
            "voice": req.voice,
        },
    )

    logger.info(
        "tts.session.created",
        extra={"story_id": req.story_id, "session_id": session_id},
    )

    return CreateSessionResponse(
        session_id=session_id,
        user_id=user_id,
        segment_data=to_segment_data(segments),  # client uses this for karaote sync
        segment_count=len(segments),
    )


# WebSocket: Real-time BIDI Stream


@app.websocket("/ws/{user_id}/{session_id}")
async def ws_endpoint(
    websocket: WebSocket,
    user_id: str,
    session_id: str,
    session_service=Depends(get_session_service),
    runner=Depends(get_runner),
    app_name=Depends(get_app_name),
):
    """WebSocket endpoint for bidirectional storytelling session."""
    await websocket.accept()

    # ── Phase 2: Session initialization ──────────────────────────────────────
    session = await session_service.get_session(
        app_name=app_name, user_id=user_id, session_id=session_id
    )
    if not session:
        await websocket.close(
            code=4004,
            reason="Session not found. Call POST /api/sessions first.",
        )
        return

    voice_name = session.state.get("voice", "Puck")

    run_config = RunConfig(
        streaming_mode=StreamingMode.BIDI,
        # audio: Gemini Live outputs PCM16 at 24 kHz by default.
        # The client AudioContext is also configured at 24 000 Hz (SAMPLE_RATE).
        response_modalities=[types.Modality.AUDIO],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=voice_name,
                )
            )
        ),
        session_resumption=types.SessionResumptionConfig(),
    )
    live_request_queue = LiveRequestQueue()
    narration_requested = False
    audio_chunk_count = 0
    no_audio_retry_sent = False

    # ── Phase 3: Concurrent upstream / downstream ─────────────────────────────

    async def upstream():
        """Client messages → LiveRequestQueue."""
        nonlocal narration_requested, audio_chunk_count, no_audio_retry_sent
        try:
            while True:
                msg = await websocket.receive()

                if msg.get("type") == "websocket.disconnect":
                    logger.info(
                        "Client disconnected: user_id=%s, session_id=%s",
                        user_id,
                        session_id,
                    )
                    break

                if "bytes" in msg:
                    # Raw PCM16 audio from mic (16kHz, mono)
                    live_request_queue.send_realtime(
                        types.Blob(
                            mime_type="audio/pcm;rate=16000",
                            data=msg["bytes"],
                        )
                    )

                elif "text" in msg:
                    data = json.loads(msg["text"])
                    kind = data.get("type")

                    if kind == "start_narration":
                        narration_requested = True
                        audio_chunk_count = 0
                        no_audio_retry_sent = False
                        logger.info(
                            "tts.start_narration.received user_id=%s session_id=%s",
                            user_id,
                            session_id,
                        )
                        live_request_queue.send_content(
                            types.Content(
                                role="user",
                                parts=[
                                    types.Part(
                                        text="start"
                                    )
                                ]
                            )
                        )
                    elif kind == "text":
                        live_request_queue.send_content(
                            types.Content(
                                parts=[types.Part(text=data["text"])]
                            )
                        )
                    elif kind == "image":
                        live_request_queue.send_realtime(
                            types.Blob(
                                mime_type=data.get("mimeType", "image/jpeg"),
                                data=base64.b64decode(data["data"]),
                            )
                        )
        except WebSocketDisconnect:
            logger.info("Client disconnected: user_id=%s, session_id=%s", user_id, session_id)
        except Exception as e:
            logger.error("Upstream error: %s", e)
            try:
                await websocket.send_json({"type": "error", "message": f"Internal upstream error: {str(e)}"})
            except: pass

    async def downstream():
        """run_live() events → client.

        Audio chunks are sent as raw binary WebSocket frames (PCM16 bytes).
        This avoids base64 encoding + JSON serialization on the hot path,
        cutting per-chunk overhead from ~3 KB JSON down to ~1.5 KB binary.

        Metadata / control messages (segment_start, turn_complete, transcription,
        error) are sent as thin JSON text frames.

        runner.run_live() yields google.adk.events.event.Event objects:
          event.content              — Content(parts=[...]) with inline_data (audio)
          event.partial              — True while streaming
          event.turn_complete        — True when the model's turn finishes
          event.output_transcription — OutputTranscription with .text
          event.error_code           — non-None on model error
        """
        nonlocal narration_requested, audio_chunk_count, no_audio_retry_sent
        segment_index = 0
        turn_was_complete = True  # treat session start as "after a completed turn"
        event_count = 0
        try:
            async for event in runner.run_live(
                user_id=user_id,
                session_id=session_id,
                live_request_queue=live_request_queue,
                run_config=run_config,
            ):
                event_count += 1
                if event.error_code:
                    logger.error(
                        "Model error %s: %s",
                        event.error_code,
                        event.error_message,
                    )
                    continue

                if event_count % 250 == 0:
                    logger.debug(
                        "api.downstream_event count=%s partial=%s turn_complete=%s has_content=%s",
                        event_count,
                        event.partial,
                        event.turn_complete,
                        bool(event.content),
                    )

                # ── Audio: raw binary frame (no JSON / base64 overhead) ───────
                # Sending bytes directly is ~2x faster per chunk and eliminates
                # the JSON parse + atob() cost on the client hot path.
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if getattr(part, "thought", False):
                            continue  # skip Gemini internal reasoning tokens
                        inline = getattr(part, "inline_data", None)
                        if inline and inline.data:
                            audio_chunk_count += 1
                            if audio_chunk_count == 1:
                                logger.info(
                                    "tts.audio.first_chunk_emitted user_id=%s session_id=%s",
                                    user_id,
                                    session_id,
                                )
                            await websocket.send_bytes(inline.data)

                # ── Segment sync ──────────────────────────────────────────────
                # Fire segment_start whenever real audio begins after a completed turn.
                if event.content and event.content.parts and turn_was_complete:
                    has_audio = any(
                        not getattr(p, "thought", False)
                        and getattr(p, "inline_data", None)
                        for p in event.content.parts
                    )
                    if has_audio:
                        segment_index += 1
                        turn_was_complete = False
                        await websocket.send_json({
                            "type": "segment_start",
                            "index": segment_index,
                        })

                if event.turn_complete:
                    if narration_requested and audio_chunk_count == 0 and not no_audio_retry_sent:
                        # Retry once with a stronger directive if the model finished
                        # without emitting audio bytes.
                        no_audio_retry_sent = True
                        logger.warning(
                            "tts.audio.empty_turn_retry user_id=%s session_id=%s",
                            user_id,
                            session_id,
                        )
                        live_request_queue.send_content(
                            types.Content(
                                role="user",
                                parts=[
                                    types.Part(
                                        text="begin narration now and respond with spoken audio only"
                                    )
                                ],
                            )
                        )
                    turn_was_complete = True
                    await websocket.send_json({"type": "turn_complete"})

        except errors.APIError as e:
            logger.error("Gemini API Error: %s", e)
            error_str = str(e)
            if "1011" in error_str or "Deadline expired" in error_str:
                # Gemini Live session hit its maximum duration limit.
                # Client should close and offer the user a "Listen again" prompt.
                code = "deadline_expired"
                message = "The narration session timed out. Please click Listen again to restart."
            elif "1006" in error_str:
                code = "connection_closed"
                message = "Connection was interrupted. Please try again."
            else:
                code = "api_error"
                message = str(e)
            try:
                await websocket.send_json({"type": "error", "code": code, "message": message})
            except: pass
        except Exception as e:
            logger.error("Downstream error: %s", e)
            try:
                await websocket.send_json({
                    "type": "error",
                    "code": "downstream_error",
                    "message": "A downstream error occurred. Please reconnect.",
                })
            except: pass

    upstream_task = asyncio.create_task(upstream())
    downstream_task = asyncio.create_task(downstream())
    try:
        done, pending = await asyncio.wait(
            {upstream_task, downstream_task},
            return_when=asyncio.FIRST_COMPLETED,
        )

        for task in done:
            exc = task.exception()
            if exc:
                logger.error("WebSocket task failed: %s", exc)

        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
    finally:
        # ── Phase 4: Terminate ───────────────────────────────────────────────
        try:
            live_request_queue.close()
        except: pass
        logger.info("Session cleanup: user_id=%s, session_id=%s", user_id, session_id)
        # Ensure socket is closed if it wasn't already
        try:
            await websocket.close()
        except: pass


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}

