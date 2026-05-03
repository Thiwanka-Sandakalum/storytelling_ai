import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import { useTTSContext } from '../context/TTSContext';
import { toggleFavorite } from '../store/slices/favoritesSlice';
import { api } from '../services/api';

export const NowPlayingBar = () => {
    const dispatch = useDispatch();
    const { currentId, session } = useSelector((state: RootState) => state.story);
    const favoriteIds = useSelector((state: RootState) => state.favorites.ids);
    const {
        isPlaying,
        isConnected,
        isBuffering,
        hasStarted,
        isMicRecording,
        volume,
        play,
        stop,
        setVolume,
        startMicQuestion,
        stopMicQuestion,
    } = useTTSContext();

    if (!currentId) return null;

    const isFavorite = favoriteIds.includes(currentId);

    const storyTitle =
        session?.segmentData?.length
            ? (session.segmentData[0]?.title ?? 'Your Story')
            : 'Your Story';
    const coverUrl = api.getCoverUrl(currentId);

    const statusLabel = isBuffering
        ? 'Buffering…'
        : isPlaying
            ? 'Now narrating'
            : isConnected
                ? 'Ready to play'
                : 'Connecting…';

    const canInteract = isConnected || hasStarted;

    const handlePlayPause = () => {
        if (hasStarted) stop();
        else if (isConnected) play();
    };

    const handleMicToggle = () => {
        if (isMicRecording) stopMicQuestion();
        else startMicQuestion();
    };

    return (
        <div
            className="
                fixed bottom-0 left-0 md:left-64 right-0 z-40
                h-[88px] flex items-center px-5 md:px-8 gap-5
                bg-[#0a0818]/90 backdrop-blur-3xl
                border-t border-white/[0.04]
                shadow-[0_-12px_60px_rgba(0,0,0,0.6),0_-1px_0_rgba(199,153,255,0.07)]
            "
        >
            {/* ── LEFT: Cover Art + Track Info ─────────────────────────────── */}
            <div className="flex items-center gap-3.5 w-[260px] min-w-0">
                {/* Cover art tile */}
                <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-white/[0.06] shadow-lg">
                    {/* Base gradient */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,_rgba(199,153,255,0.55)_0%,_transparent_55%),radial-gradient(circle_at_75%_75%,_rgba(74,248,227,0.35)_0%,_transparent_55%),linear-gradient(160deg,#1a1438_0%,#0f0d24_100%)]" />
                    <img
                        src={coverUrl}
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 w-full h-full object-cover opacity-70"
                        onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                    />

                    {/* Buffering ring */}
                    {isBuffering && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                        </div>
                    )}

                    {/* Equalizer bars when playing */}
                    {isPlaying && !isBuffering && (
                        <div className="absolute inset-0 flex items-end justify-center gap-[3px] pb-2">
                            {[300, 100, 200, 0, 150].map((delay, i) => (
                                <span
                                    key={i}
                                    className="w-[3px] rounded-full bg-primary"
                                    style={{
                                        height: `${10 + ((i * 7) % 14)}px`,
                                        animation: `eq-bar 0.75s ease-in-out ${delay}ms infinite alternate`,
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {/* Idle music note */}
                    {!isPlaying && !isBuffering && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span
                                className="material-symbols-outlined text-primary/50 text-[22px]"
                                style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                                music_note
                            </span>
                        </div>
                    )}
                </div>

                <style>{`
                    @keyframes eq-bar {
                        from { transform: scaleY(0.35); }
                        to   { transform: scaleY(1);    }
                    }
                `}</style>

                {/* Track info */}
                <div className="min-w-0 flex-1">
                    <p className="font-headline italic text-sm text-on-background leading-snug truncate">
                        {storyTitle}
                    </p>
                    <p className={`font-label text-[10px] uppercase tracking-[0.15em] mt-0.5 truncate transition-colors ${isPlaying ? 'text-secondary' : isConnected ? 'text-primary/70' : 'text-on-surface-variant/40'
                        }`}>
                        {statusLabel}
                    </p>
                </div>

                {/* Favourite toggle */}
                <button
                    onClick={() => dispatch(toggleFavorite(currentId))}
                    title={isFavorite ? 'Remove from favourites' : 'Save to favourites'}
                    className={`shrink-0 p-1.5 rounded-full transition-all ${isFavorite
                        ? 'text-primary bg-primary/10'
                        : 'text-on-surface-variant/30 hover:text-primary hover:bg-primary/10'
                        }`}
                >
                    <span
                        className="material-symbols-outlined text-[18px]"
                        style={{ fontVariationSettings: `'FILL' ${isFavorite ? 1 : 0}` }}
                    >
                        favorite
                    </span>
                </button>
            </div>

            {/* ── CENTER: Transport Controls ────────────────────────────────── */}
            <div className="flex-1 flex items-center justify-center gap-3">
                {/* Mic / Q&A */}
                <button
                    onClick={handleMicToggle}
                    disabled={!hasStarted}
                    title={isMicRecording ? 'Stop asking' : 'Ask a question'}
                    className={`
                        w-9 h-9 rounded-full flex items-center justify-center transition-all
                        ${isMicRecording
                            ? 'bg-secondary/15 text-secondary border border-secondary/30 shadow-[0_0_12px_rgba(74,248,227,0.2)] animate-pulse'
                            : 'text-on-surface-variant/40 hover:text-on-surface hover:bg-white/5'
                        }
                        disabled:opacity-20 disabled:cursor-not-allowed
                    `}
                >
                    <span
                        className="material-symbols-outlined text-[19px]"
                        style={{ fontVariationSettings: `'FILL' ${isMicRecording ? 1 : 0}` }}
                    >
                        mic
                    </span>
                </button>

                {/* Replay */}
                <button
                    onClick={stop}
                    disabled={!hasStarted}
                    title="Restart"
                    className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant/40 hover:text-on-surface hover:bg-white/5 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                >
                    <span className="material-symbols-outlined text-[19px]">replay</span>
                </button>

                {/* Main Play / Stop — 48px */}
                <button
                    onClick={handlePlayPause}
                    disabled={!canInteract}
                    title={hasStarted ? 'Stop narration' : 'Play narration'}
                    className={`
                        w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200
                        ${canInteract
                            ? 'bg-primary text-background shadow-[0_0_24px_rgba(199,153,255,0.5)] hover:shadow-[0_0_32px_rgba(199,153,255,0.65)] hover:scale-105 active:scale-95'
                            : 'bg-surface-container-high text-on-surface-variant/30 cursor-not-allowed'
                        }
                    `}
                >
                    <span
                        className="material-symbols-outlined text-[24px]"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                        {!canInteract ? 'hourglass_empty' : hasStarted ? 'stop' : 'play_arrow'}
                    </span>
                </button>

                {/* Skip forward placeholder — visual balance */}
                <button
                    disabled
                    title="Skip (not available)"
                    className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant/20 cursor-not-allowed"
                >
                    <span className="material-symbols-outlined text-[19px]">skip_next</span>
                </button>

                {/* Spacer to balance mic button */}
                <div className="w-9" />
            </div>

            {/* ── RIGHT: Volume + Status dot ───────────────────────────────── */}
            <div className="flex items-center gap-3 w-[260px] justify-end">
                {/* Volume control */}
                <div className="hidden md:flex items-center gap-2">
                    <button
                        onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
                        className="p-1 text-on-surface-variant/40 hover:text-on-surface transition-colors"
                        title={volume === 0 ? 'Unmute' : 'Mute'}
                    >
                        <span className="material-symbols-outlined text-[18px]">
                            {volume === 0 ? 'volume_off' : volume < 0.4 ? 'volume_down' : 'volume_up'}
                        </span>
                    </button>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="
                            w-24 h-1 appearance-none rounded-full outline-none cursor-pointer
                            [&::-webkit-slider-thumb]:appearance-none
                            [&::-webkit-slider-thumb]:w-3
                            [&::-webkit-slider-thumb]:h-3
                            [&::-webkit-slider-thumb]:rounded-full
                            [&::-webkit-slider-thumb]:bg-on-background
                            [&::-webkit-slider-thumb]:transition-transform
                            [&::-webkit-slider-thumb]:hover:scale-125
                        "
                        style={{
                            background: `linear-gradient(to right, rgba(199,153,255,0.75) ${volume * 100}%, rgba(255,255,255,0.08) ${volume * 100}%)`,
                        }}
                    />
                </div>

                {/* Live status dot */}
                <div
                    title={isPlaying ? 'Narrating' : isConnected ? 'Connected' : 'Offline'}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${isPlaying
                        ? 'bg-secondary shadow-[0_0_6px_rgba(74,248,227,0.6)] animate-pulse'
                        : isConnected
                            ? 'bg-primary/70 animate-pulse'
                            : 'bg-outline-variant/40'
                        }`}
                />
            </div>
        </div>
    );
};
