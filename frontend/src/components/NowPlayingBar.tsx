import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import { useTTSContext } from '../context/TTSContext';
import { toggleFavorite } from '../store/slices/favoritesSlice';

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

    // Only render when a story is loaded
    if (!currentId) return null;

    const isFavorite = favoriteIds.includes(currentId);

    const storyTitle =
        session?.segmentData?.length
            ? (session.segmentData[0]?.title ?? 'Your Story')
            : 'Your Story';

    const handlePlayPause = () => {
        if (hasStarted) {
            stop();
        } else if (isConnected) {
            play();
        }
    };

    const handleMicToggle = () => {
        if (isMicRecording) stopMicQuestion();
        else startMicQuestion();
    };

    return (
        <div
            className="
                    fixed bottom-0 left-0 md:left-64 right-0 z-40
                    h-[72px] flex items-center px-4 md:px-6 gap-4
                    bg-[#0d0b1e]/80 backdrop-blur-2xl
                    border-t border-[#48455c]/20
                    shadow-[0_-8px_40px_rgba(0,0,0,0.5)]
               "
        >
            {/* ── LEFT: Artwork + Track Info ── */}
            <div className="flex items-center gap-3 w-[220px] min-w-0">
                {/* Mini artwork */}
                <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-outline-variant/20">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,_rgba(199,153,255,0.5)_0%,_transparent_50%),radial-gradient(circle_at_75%_75%,_rgba(74,248,227,0.3)_0%,_transparent_50%),linear-gradient(160deg,#151131_0%,#0f0d24_100%)]" />
                    {/* Buffering spinner */}
                    {isBuffering && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        </div>
                    )}
                    {/* Animated equalizer bars — only after audio actually arrives */}
                    {isPlaying && !isBuffering && (
                        <div className="absolute inset-0 flex items-center justify-center gap-[3px]">
                            {[0, 100, 200, 100].map((delay, i) => (
                                <span
                                    key={i}
                                    className="w-[3px] bg-primary rounded-full animate-[soundbar_0.8s_ease-in-out_infinite_alternate]"
                                    style={{
                                        animationDelay: `${delay}ms`,
                                        height: `${12 + (i % 2 === 0 ? 8 : 0)}px`,
                                    }}
                                />
                            ))}
                        </div>
                    )}
                    {!isPlaying && !isBuffering && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span
                                className="material-symbols-outlined text-primary/60 text-[18px]"
                                style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                                auto_fix_high
                            </span>
                        </div>
                    )}
                </div>

                {/* Track info */}
                <div className="min-w-0">
                    <p className="font-headline italic text-sm text-on-background leading-none truncate">
                        {storyTitle}
                    </p>
                    <p className="font-label text-[10px] uppercase tracking-[0.15em] text-on-surface-variant mt-1 truncate">
                        {isBuffering
                            ? 'Buffering...'
                            : isPlaying
                                ? 'Now narrating'
                                : isConnected
                                    ? 'Ready'
                                    : !currentId
                                        ? ''
                                        : 'Connecting...'}
                    </p>
                </div>

                {/* Favourite toggle */}
                <button
                    onClick={() => dispatch(toggleFavorite(currentId))}
                    title={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
                    className={`ml-1 p-1 transition-colors shrink-0 ${isFavorite ? 'text-primary' : 'text-on-surface-variant/40 hover:text-primary'
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

            {/* ── CENTER: Transport Controls ── */}
            <div className="flex-1 flex items-center justify-center gap-4">
                {/* Mic / Q&A */}
                <button
                    onClick={handleMicToggle}
                    disabled={!hasStarted}
                    title={isMicRecording ? 'Stop asking' : 'Ask a question'}
                    className={`
                              p-2 rounded-full transition-all
                              ${isMicRecording
                            ? 'bg-secondary/20 text-secondary border border-secondary/40 animate-pulse'
                            : 'text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-high'
                        }
                              disabled:opacity-30 disabled:cursor-not-allowed
                         `}
                >
                    <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: `'FILL' ${isMicRecording ? 1 : 0}` }}>
                        mic
                    </span>
                </button>

                {/* Main Play / Stop */}
                <button
                    onClick={handlePlayPause}
                    disabled={!isConnected && !hasStarted}
                    title={hasStarted ? 'Stop' : 'Play narration'}
                    className={`
                              w-11 h-11 rounded-full flex items-center justify-center transition-all
                              ${isConnected || hasStarted
                            ? 'bg-primary text-background hover:scale-105 shadow-[0_0_20px_rgba(199,153,255,0.4)]'
                            : 'bg-surface-container-high text-on-surface-variant/40 cursor-not-allowed'
                        }
                         `}
                >
                    {!isConnected && !hasStarted ? (
                        <span className="w-4 h-4 border-2 border-on-surface-variant/30 border-t-primary rounded-full animate-spin" />
                    ) : (
                        <span
                            className="material-symbols-outlined text-[22px]"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                            {hasStarted ? 'stop' : 'play_arrow'}
                        </span>
                    )}
                </button>

                {/* Replay / restart */}
                <button
                    onClick={stop}
                    disabled={!hasStarted}
                    title="Restart"
                    className="p-2 rounded-full text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-high transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <span className="material-symbols-outlined text-[20px]">replay</span>
                </button>
            </div>

            {/* ── RIGHT: Volume + Go-to-Studio ── */}
            <div className="flex items-center gap-3 w-[220px] justify-end">
                {/* Volume */}
                <div className="hidden md:flex items-center gap-2">
                    <button
                        onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
                        className="p-1 text-on-surface-variant/50 hover:text-on-surface transition-colors"
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
                                   bg-outline-variant/30
                                   [&::-webkit-slider-thumb]:appearance-none
                                   [&::-webkit-slider-thumb]:w-3
                                   [&::-webkit-slider-thumb]:h-3
                                   [&::-webkit-slider-thumb]:rounded-full
                                   [&::-webkit-slider-thumb]:bg-on-background
                              "
                        style={{
                            background: `linear-gradient(to right, rgba(199,153,255,0.7) ${volume * 100}%, rgba(255,255,255,0.1) ${volume * 100}%)`,
                        }}
                    />
                </div>

                {/* Status dot */}
                <div
                    title={isPlaying ? 'Narrating' : isConnected ? 'Connected' : 'Offline'}
                    className={`w-2 h-2 rounded-full transition-colors ${isPlaying
                        ? 'bg-secondary animate-pulse'
                        : isConnected
                            ? 'bg-primary animate-pulse'
                            : 'bg-outline-variant'
                        }`}
                />
            </div>
        </div>
    );
};
