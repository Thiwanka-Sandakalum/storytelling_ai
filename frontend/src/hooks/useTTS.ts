import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { setSession, addNotification } from '../store/slices/storySlice';
import { api } from '../services/api';

const TTS_WS_URL = import.meta.env.VITE_TTS_WS_URL;
const TTS_SERVICE_URL = import.meta.env.VITE_TTS_SERVICE_URL;
const API_URL = import.meta.env.VITE_API_URL;
const SAMPLE_RATE = 24000;
const MIC_SAMPLE_RATE = 16000;
const INITIAL_BUFFER_DELAY = 0.6; // 600ms look-ahead — LLM audio streams have high jitter
const PCM_FLUSH_MS = 25;
const PCM_TARGET_BATCH_BYTES = 9600; // ~100 ms @ 24kHz, PCM16 mono
const WS_CONNECT_TIMEOUT_MS = 8000;

const toWsBaseUrl = (rawUrl: string): string => {
     const parsed = new URL(rawUrl);
     if (parsed.protocol === 'http:') parsed.protocol = 'ws:';
     if (parsed.protocol === 'https:') parsed.protocol = 'wss:';
     return parsed.origin;
};

const resolveTtsWsBase = (): string => {
     if (TTS_WS_URL) {
          return toWsBaseUrl(TTS_WS_URL);
     }

     if (TTS_SERVICE_URL) {
          return toWsBaseUrl(TTS_SERVICE_URL);
     }

     if (API_URL) {
          const parsed = new URL(API_URL);
          const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
          const hostname = parsed.hostname;
          return `${wsProtocol}//${hostname}:8001`;
     }

     const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
     return `${wsProtocol}//localhost:8001`;
};

const downsampleBuffer = (buffer: Float32Array, inputRate: number, outputRate: number): Float32Array => {
     if (outputRate >= inputRate) return buffer;

     const ratio = inputRate / outputRate;
     const outputLength = Math.round(buffer.length / ratio);
     const result = new Float32Array(outputLength);

     let offsetResult = 0;
     let offsetBuffer = 0;
     while (offsetResult < result.length) {
          const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
          let accum = 0;
          let count = 0;

          for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
               accum += buffer[i];
               count++;
          }

          result[offsetResult] = count > 0 ? accum / count : 0;
          offsetResult++;
          offsetBuffer = nextOffsetBuffer;
     }

     return result;
};

const floatToInt16 = (input: Float32Array): Int16Array => {
     const output = new Int16Array(input.length);
     for (let i = 0; i < input.length; i++) {
          const sample = Math.max(-1, Math.min(1, input[i]));
          output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
     }
     return output;
};

export const useTTS = (storyId: string | null) => {
     const dispatch = useDispatch();
     const [activeIndex, setActiveIndex] = useState(-1);
     const [isPlaying, setIsPlaying] = useState(false);
     const [isConnected, setIsConnected] = useState(false);
     const [hasStarted, setHasStarted] = useState(false);
     const [isBuffering, setIsBuffering] = useState(false);
     const [volume, setVolumeState] = useState(0.8);
     const [isMicRecording, setIsMicRecording] = useState(false);
     const [reconnectTrigger, setReconnectTrigger] = useState(0);

     const audioContextRef = useRef<AudioContext | null>(null);
     const gainNodeRef = useRef<GainNode | null>(null);
     const wsRef = useRef<WebSocket | null>(null);

     const startTimeRef = useRef(0);
     const isFirstChunkRef = useRef(true);
     const startedRef = useRef(false);

     const pendingPcmChunksRef = useRef<Uint8Array[]>([]);
     const pendingPcmBytesRef = useRef(0);
     const flushTimerRef = useRef<number | null>(null);

     const micStreamRef = useRef<MediaStream | null>(null);
     const micContextRef = useRef<AudioContext | null>(null);
     const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
     const micProcessorRef = useRef<ScriptProcessorNode | null>(null);
     const wsConnectTimerRef = useRef<number | null>(null);

     useEffect(() => {
          if (!storyId) return;

          const initTTS = async () => {
               try {
                    // 1. Session Context
                    const data = await api.getListenSession(storyId);
                    const session = {
                         sessionId: data.session_id,
                         userId: data.user_id,
                         // segment_count tells us how many audio segments to expect;
                         // prose text comes from draft_script in StoryStatusResponse, not here.
                         segmentCount: data.segment_count,
                    };
                    dispatch(setSession(session));

                    // 2. Audio Engine
                    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
                         sampleRate: SAMPLE_RATE,
                    });
                    gainNodeRef.current = audioContextRef.current.createGain();
                    gainNodeRef.current.gain.value = volume;
                    gainNodeRef.current.connect(audioContextRef.current.destination);

                    // 3. Narrative Stream
                    const wsBase = resolveTtsWsBase();
                    const ws = new WebSocket(`${wsBase}/ws/${session.userId}/${session.sessionId}`);
                    wsRef.current = ws;

                    if (wsConnectTimerRef.current !== null) {
                         window.clearTimeout(wsConnectTimerRef.current);
                    }
                    wsConnectTimerRef.current = window.setTimeout(() => {
                         if (ws.readyState === WebSocket.CONNECTING) {
                              ws.close();
                              dispatch(addNotification({
                                   type: 'error',
                                   message: 'Narrator connection timed out. Check VITE_TTS_WS_URL or TTS service availability.',
                              }));
                         }
                    }, WS_CONNECT_TIMEOUT_MS);

                    ws.onopen = () => {
                         console.log('TTS WebSocket Connected');
                         if (wsConnectTimerRef.current !== null) {
                              window.clearTimeout(wsConnectTimerRef.current);
                              wsConnectTimerRef.current = null;
                         }
                         setIsConnected(true);
                    };

                    ws.onerror = () => {
                         if (wsConnectTimerRef.current !== null) {
                              window.clearTimeout(wsConnectTimerRef.current);
                              wsConnectTimerRef.current = null;
                         }
                         setIsConnected(false);
                         dispatch(addNotification({
                              type: 'error',
                              message: 'Narrator WebSocket failed to connect. Verify TTS URL and service health.',
                         }));
                    };

                    // Audio arrives as raw binary frames — no JSON parsing or
                    // base64 decoding on the hot path. Metadata comes as text.
                    ws.binaryType = 'arraybuffer';

                    ws.onmessage = async (event) => {
                         // ── Binary frame: raw PCM16 audio bytes ───────────────
                         if (event.data instanceof ArrayBuffer) {
                              setIsBuffering(false); // first audio data received
                              enqueuePcmChunk(event.data);
                              return;
                         }

                         // ── Text frame: control / metadata JSON ───────────────
                         try {
                              const data = JSON.parse(event.data as string);

                              if (data.type === 'segment_start') {
                                   setActiveIndex(data.index);
                              } else if (data.type === 'turn_complete') {
                                   // Model finished its turn — optional: show UI indicator
                              } else if (data.type === 'transcription') {
                                   // Optional: show live transcript overlay
                              } else if (data.type === 'error') {
                                   console.error('TTS stream error:', data.code, data.message);
                                   dispatch(addNotification({
                                        type: 'error',
                                        message: data.message || 'Narration error occurred.',
                                   }));
                                   if (data.code === 'deadline_expired') {
                                        // Session timed out — playback ends naturally;
                                        // the WS will close and isPlaying will be set false.
                                        ws.close();
                                   }
                              }
                         } catch (e) {
                              // Non-JSON text frames — silently ignore
                         }
                    };

                    ws.onclose = () => {
                         console.log('TTS WebSocket Closed');
                         if (wsConnectTimerRef.current !== null) {
                              window.clearTimeout(wsConnectTimerRef.current);
                              wsConnectTimerRef.current = null;
                         }
                         stopMicQuestionInternal();
                         startedRef.current = false;
                         setHasStarted(false);
                         setIsConnected(false);
                         setIsPlaying(false);
                         setIsBuffering(false);
                    };
               } catch (err) {
                    console.error('Narrator Initialization Error:', err);
                    dispatch(addNotification({
                         type: 'error',
                         message: 'The Narrator Studio is currently unreachable.'
                    }));
               }
          };

          initTTS();

          return () => {
               stopMicQuestionInternal();
               wsRef.current?.close();
               flushPendingPcm();
               if (flushTimerRef.current !== null) {
                    window.clearTimeout(flushTimerRef.current);
                    flushTimerRef.current = null;
               }
               if (wsConnectTimerRef.current !== null) {
                    window.clearTimeout(wsConnectTimerRef.current);
                    wsConnectTimerRef.current = null;
               }
               if (audioContextRef.current?.state !== 'closed') {
                    audioContextRef.current?.close();
               }
          };
     }, [storyId, reconnectTrigger, dispatch]);

     const play = () => {
          const ws = wsRef.current;
          if (!ws || ws.readyState !== WebSocket.OPEN || startedRef.current) return;

          isFirstChunkRef.current = true;
          startedRef.current = true;
          setHasStarted(true);
          setIsPlaying(true);
          setIsBuffering(true);
          ws.send(JSON.stringify({ type: 'start_narration' }));
     };

     const stop = () => {
          stopMicQuestionInternal();
          wsRef.current?.close();
          startedRef.current = false;
          setHasStarted(false);
          setIsPlaying(false);
          setIsBuffering(false);
          setIsConnected(false);
          pendingPcmChunksRef.current = [];
          pendingPcmBytesRef.current = 0;
          if (flushTimerRef.current !== null) {
               window.clearTimeout(flushTimerRef.current);
               flushTimerRef.current = null;
          }
          // Close AudioContext to immediately kill all scheduled audio nodes.
          // Any in-flight schedulePlayback calls will see null and bail out safely.
          if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
               audioContextRef.current.close();
          }
          audioContextRef.current = null;
          gainNodeRef.current = null;
          // Re-run initTTS so connection is restored and play button shows
          setReconnectTrigger(t => t + 1);
     };

     const setVolume = (nextVolume: number) => {
          const clamped = Math.max(0, Math.min(1, nextVolume));
          setVolumeState(clamped);
          if (gainNodeRef.current) {
               gainNodeRef.current.gain.value = clamped;
          }
     };

     const stopMicQuestionInternal = () => {
          micProcessorRef.current?.disconnect();
          micSourceRef.current?.disconnect();

          if (micContextRef.current && micContextRef.current.state !== 'closed') {
               micContextRef.current.close().catch(() => undefined);
          }

          if (micStreamRef.current) {
               for (const track of micStreamRef.current.getTracks()) {
                    track.stop();
               }
          }

          micProcessorRef.current = null;
          micSourceRef.current = null;
          micContextRef.current = null;
          micStreamRef.current = null;
          setIsMicRecording(false);
     };

     const startMicQuestion = async () => {
          const ws = wsRef.current;
          if (!ws || ws.readyState !== WebSocket.OPEN || isMicRecording) return;

          try {
               const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
               const micContext = new (window.AudioContext || (window as any).webkitAudioContext)({
                    sampleRate: MIC_SAMPLE_RATE,
               });
               const source = micContext.createMediaStreamSource(stream);
               const processor = micContext.createScriptProcessor(4096, 1, 1);

               processor.onaudioprocess = (event: AudioProcessingEvent) => {
                    const socket = wsRef.current;
                    if (!socket || socket.readyState !== WebSocket.OPEN) return;

                    const input = event.inputBuffer.getChannelData(0);
                    const mono =
                         micContext.sampleRate === MIC_SAMPLE_RATE
                              ? input
                              : downsampleBuffer(input, micContext.sampleRate, MIC_SAMPLE_RATE);
                    const pcm16 = floatToInt16(mono);
                    socket.send(pcm16.buffer);
               };

               source.connect(processor);
               processor.connect(micContext.destination);

               micStreamRef.current = stream;
               micContextRef.current = micContext;
               micSourceRef.current = source;
               micProcessorRef.current = processor;
               setIsMicRecording(true);
          } catch (error) {
               dispatch(addNotification({
                    type: 'error',
                    message: 'Microphone access failed. Please allow microphone permissions.',
               }));
          }
     };

     const stopMicQuestion = () => {
          stopMicQuestionInternal();
     };

     const enqueuePcmChunk = (arrayBuffer: ArrayBuffer) => {
          const chunk = new Uint8Array(arrayBuffer);
          if (!chunk.byteLength) return;

          pendingPcmChunksRef.current.push(chunk);
          pendingPcmBytesRef.current += chunk.byteLength;

          if (pendingPcmBytesRef.current >= PCM_TARGET_BATCH_BYTES) {
               flushPendingPcm();
               return;
          }

          if (flushTimerRef.current === null) {
               flushTimerRef.current = window.setTimeout(() => {
                    flushTimerRef.current = null;
                    flushPendingPcm();
               }, PCM_FLUSH_MS);
          }
     };

     const flushPendingPcm = () => {
          const totalBytes = pendingPcmBytesRef.current;
          if (!totalBytes) return;

          const merged = new Uint8Array(totalBytes);
          let offset = 0;
          for (const chunk of pendingPcmChunksRef.current) {
               merged.set(chunk, offset);
               offset += chunk.byteLength;
          }

          pendingPcmChunksRef.current = [];
          pendingPcmBytesRef.current = 0;

          schedulePlayback(merged.buffer).catch(console.error);
     };

     const schedulePlayback = async (arrayBuffer: ArrayBuffer) => {
          if (!audioContextRef.current) return;

          // Resume if suspended (browser autoplay policy) — must be awaited
          // before scheduling any source nodes or chunks are silently dropped.
          if (audioContextRef.current.state === 'suspended') {
               await audioContextRef.current.resume();
          }

          const int16Array = new Int16Array(arrayBuffer);
          const float32Array = new Float32Array(int16Array.length);
          for (let i = 0; i < int16Array.length; i++) {
               float32Array[i] = int16Array[i] / 32768;
          }

          const audioBuffer = audioContextRef.current.createBuffer(1, float32Array.length, SAMPLE_RATE);
          audioBuffer.getChannelData(0).set(float32Array);

          const source = audioContextRef.current.createBufferSource();
          source.buffer = audioBuffer;
          if (gainNodeRef.current) {
               source.connect(gainNodeRef.current);
          } else {
               source.connect(audioContextRef.current.destination);
          }

          const currentTime = audioContextRef.current.currentTime;

          if (isFirstChunkRef.current) {
               // Add initial delay to the very first chunk to establish a jitter buffer
               startTimeRef.current = currentTime + INITIAL_BUFFER_DELAY;
               isFirstChunkRef.current = false;
          } else {
               // If we've run out of buffered audio (underrun), reset the clock.
               // Use 500ms — enough for a full LLM inference cycle to complete.
               if (startTimeRef.current < currentTime) {
                    console.warn('Audio underrun detected, recalibrating jitter buffer...');
                    startTimeRef.current = currentTime + 0.5;
               }
          }

          source.start(startTimeRef.current);
          startTimeRef.current += audioBuffer.duration;
     };

     return {
          activeIndex,
          isPlaying,
          isConnected,
          hasStarted,
          isBuffering,
          volume,
          isMicRecording,
          play,
          stop,
          setVolume,
          startMicQuestion,
          stopMicQuestion,
     };
};
