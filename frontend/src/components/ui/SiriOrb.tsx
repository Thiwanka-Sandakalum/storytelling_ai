interface SiriOrbProps {
    isActive: boolean;       // narration is playing & audio received
    isMicActive: boolean;    // mic is recording
    isConnecting: boolean;   // waiting for WS connection
    isBuffering?: boolean;   // started but no audio yet
    hasStarted?: boolean;    // narration command sent
    canPlay?: boolean;       // connected and not yet started
    onPlay?: () => void;
    onStop?: () => void;
    onMicToggle?: () => void;
}

export const SiriOrb = ({
    isActive,
    isMicActive,
    isConnecting,
    isBuffering = false,
    hasStarted = false,
    canPlay = false,
    onPlay,
    onStop,
    onMicToggle,
}: SiriOrbProps) => {
    const orbColor = isMicActive
        ? 'from-secondary via-secondary/60 to-primary/40'
        : isActive
            ? 'from-primary via-primary/70 to-secondary/30'
            : isBuffering
                ? 'from-primary/40 via-surface-container to-surface-container-low'
                : 'from-surface-container-high via-surface-container to-surface-container-low';

    const glowColor = isMicActive
        ? 'shadow-[0_0_80px_40px_rgba(74,248,227,0.18)]'
        : isActive
            ? 'shadow-[0_0_80px_40px_rgba(199,153,255,0.18)]'
            : 'shadow-[0_0_40px_20px_rgba(199,153,255,0.06)]';

    const ringColor = isMicActive ? 'border-secondary/30' : 'border-primary/30';
    const ring2Color = isMicActive ? 'border-secondary/20' : 'border-primary/20';
    const ring3Color = isMicActive ? 'border-secondary/10' : 'border-primary/10';

    return (
        <div className="relative flex flex-col items-center select-none" style={{ width: 320 }}>
            <style>{`
        @keyframes siri-ring {
          0%   { transform: scale(1);   opacity: 0.7; }
          70%  { transform: scale(1.7); opacity: 0;   }
          100% { transform: scale(1.7); opacity: 0;   }
        }
        @keyframes siri-float {
          0%, 100% { transform: translateY(0px);  }
          50%       { transform: translateY(-8px); }
        }
        @keyframes siri-wave {
          0%, 100% { transform: scaleY(0.4); }
          50%       { transform: scaleY(1.0); }
        }
        @keyframes siri-spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .siri-ring-1 { animation: siri-ring 2.4s ease-out infinite; }
        .siri-ring-2 { animation: siri-ring 2.4s ease-out infinite 0.8s; }
        .siri-ring-3 { animation: siri-ring 2.4s ease-out infinite 1.6s; }
        .siri-float  { animation: siri-float 3s ease-in-out infinite; }
        .siri-wave-bar { animation: siri-wave 1.2s ease-in-out infinite; }
        .siri-spin  { animation: siri-spin-slow 12s linear infinite; }
      `}</style>

            {/* Orb area */}
            <div className="relative flex items-center justify-center" style={{ width: 320, height: 320 }}>
                {/* Outermost rings — ping outward */}
                {(isActive || isMicActive) && (
                    <>
                        <div className={`absolute rounded-full border ${ring3Color} siri-ring-1`} style={{ width: 255, height: 255 }} />
                        <div className={`absolute rounded-full border ${ring2Color} siri-ring-2`} style={{ width: 255, height: 255 }} />
                        <div className={`absolute rounded-full border ${ringColor}  siri-ring-3`} style={{ width: 255, height: 255 }} />
                    </>
                )}

                {/* Slow-spinning arc decoration */}
                {(isActive || isMicActive || isBuffering) && (
                    <div
                        className={`absolute rounded-full border-t-2 border-r-2 ${isMicActive ? 'border-secondary/40' : 'border-primary/40'
                            } siri-spin`}
                        style={{ width: 230, height: 230 }}
                    />
                )}

                {/* Static outer ring */}
                <div
                    className={`absolute rounded-full border ${isActive || isMicActive ? ringColor : 'border-outline-variant/10'
                        }`}
                    style={{ width: 206, height: 206 }}
                />

                {/* Floating orb */}
                <div
                    className={`absolute rounded-full bg-gradient-to-br ${orbColor} ${glowColor} ${isActive || isMicActive ? 'siri-float' : ''
                        }`}
                    style={{ width: 160, height: 160 }}
                >
                    <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/10 to-transparent" />
                    <div
                        className="absolute inset-0 rounded-full opacity-30"
                        style={{ background: 'radial-gradient(ellipse at 35% 30%, rgba(255,255,255,0.18) 0%, transparent 60%)' }}
                    />
                </div>

                {/* ── CENTER CONTROL ── */}
                <div className="absolute flex items-center justify-center z-10">
                    {isMicActive ? (
                        <button
                            onClick={onMicToggle}
                            className="flex items-center justify-center w-16 h-16 rounded-full hover:bg-secondary/10 transition-all"
                        >
                            <span className="material-symbols-outlined text-secondary text-4xl animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>
                                mic
                            </span>
                        </button>
                    ) : isConnecting ? (
                        <span className="material-symbols-outlined text-on-surface-variant text-3xl animate-spin" style={{ animationDuration: '2s' }}>
                            autorenew
                        </span>
                    ) : isBuffering ? (
                        <span className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin block" />
                    ) : hasStarted && isActive ? (
                        <button
                            onClick={onStop}
                            className="flex items-center justify-center w-16 h-16 rounded-full hover:bg-primary/10 transition-all"
                        >
                            <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                                stop
                            </span>
                        </button>
                    ) : canPlay ? (
                        <button
                            onClick={onPlay}
                            className="flex items-center justify-center w-16 h-16 rounded-full hover:bg-primary/10 transition-all"
                        >
                            <span className="material-symbols-outlined text-on-surface-variant/60 text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                                play_arrow
                            </span>
                        </button>
                    ) : (
                        <span className="material-symbols-outlined text-on-surface-variant/40 text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                            auto_awesome
                        </span>
                    )}
                </div>

                {/* Wave bars — visible when active */}
                {(isActive || isMicActive) && (
                    <div className="absolute flex items-end justify-center gap-1" style={{ bottom: -4 }}>
                        {[0.4, 0.7, 1.0, 0.85, 0.6, 1.0, 0.75, 0.5, 0.9, 0.65, 0.45].map((h, i) => (
                            <div
                                key={i}
                                className={`w-1 rounded-full siri-wave-bar ${isMicActive ? 'bg-secondary' : i % 2 === 0 ? 'bg-primary' : 'bg-secondary'
                                    }`}
                                style={{ height: `${12 + h * 20}px`, animationDelay: `${i * 0.1}s` }}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* ── BOTTOM CONTROLS — slide in once narration starts ── */}
            <div className={`flex items-center justify-center gap-4 mt-6 transition-all duration-300 ${hasStarted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
                }`}>
                {/* Stop */}
                <button
                    onClick={onStop}
                    title="Stop narration"
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-outline-variant/25 bg-surface-container-high/60 backdrop-blur-sm text-on-surface-variant hover:text-error hover:border-error/40 hover:bg-error/5 transition-all font-label text-[10px] uppercase tracking-[0.2em]"
                >
                    <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>stop</span>
                    Stop
                </button>

                {/* Mic */}
                <button
                    onClick={onMicToggle}
                    title={isMicActive ? 'Stop question' : 'Ask a question'}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full border backdrop-blur-sm font-label text-[10px] uppercase tracking-[0.2em] transition-all ${isMicActive
                            ? 'border-secondary/40 bg-secondary/10 text-secondary animate-pulse'
                            : 'border-outline-variant/25 bg-surface-container-high/60 text-on-surface-variant hover:text-secondary hover:border-secondary/40 hover:bg-secondary/5'
                        }`}
                >
                    <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: `'FILL' ${isMicActive ? 1 : 0}` }}>
                        mic
                    </span>
                    {isMicActive ? 'Listening…' : 'Ask'}
                </button>
            </div>
        </div>
    );
};
