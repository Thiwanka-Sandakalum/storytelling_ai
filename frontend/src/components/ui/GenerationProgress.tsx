interface Phase {
    key: string;
    label: string;
    subtext: string;
}

const PHASES: Phase[] = [
    { key: 'queued', label: 'Initialising', subtext: 'Activating the Neural Engine…' },
    { key: 'processing', label: 'Initialising', subtext: 'Activating the Neural Engine…' },
    { key: 'planning', label: 'Planning', subtext: 'Crafting your narrative blueprint…' },
    { key: 'generating', label: 'Writing', subtext: 'Weaving chapters into existence…' },
    { key: 'assembling', label: 'Assembling', subtext: 'Binding the manuscript together…' },
    { key: 'cover_generating', label: 'Painting Cover', subtext: 'Generating your cover artwork…' },
];

// Canonical ordered steps shown in the UI (deduped display phases)
const STEPS = [
    { key: 'queued', label: 'Initialising', subtext: 'Activating the Neural Engine…' },
    { key: 'planning', label: 'Planning', subtext: 'Crafting your narrative blueprint…' },
    { key: 'generating', label: 'Writing', subtext: 'Weaving chapters into existence…' },
    { key: 'assembling', label: 'Assembling', subtext: 'Binding the manuscript together…' },
    { key: 'cover_generating', label: 'Painting Cover', subtext: 'Generating your cover artwork…' },
];

const STATUS_TO_STEP: Record<string, number> = {
    queued: 0,
    processing: 0,
    planning: 1,
    generating: 2,
    assembling: 3,
    cover_generating: 4,
};

interface GenerationProgressProps {
    status: string;
}

export const GenerationProgress = ({ status }: GenerationProgressProps) => {
    const activeStep = STATUS_TO_STEP[status] ?? 0;
    const activePhase = PHASES.find((p) => p.key === status) ?? PHASES[0];

    return (
        <div className="relative w-full min-h-[calc(100vh-14rem)] flex flex-col items-center justify-center overflow-hidden px-6 py-12">
            {/* Background glow blobs */}
            <div className="absolute inset-0 pointer-events-none -z-10">
                <div className="absolute top-[10%] left-[20%] w-[40%] h-[40%] bg-primary/8 rounded-full blur-[120px]" />
                <div className="absolute bottom-[5%] right-[15%] w-[35%] h-[35%] bg-secondary/6 rounded-full blur-[100px]" />
            </div>

            {/* Animated phase label — center focal point */}
            <div className="text-center mb-14 space-y-3 max-w-xl">
                <p className="font-label text-[10px] uppercase tracking-[0.3em] text-secondary flex items-center justify-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                    The Architect
                </p>
                <h2
                    className="font-headline italic text-4xl md:text-5xl text-transparent bg-clip-text animate-pulse"
                    style={{
                        backgroundImage: 'linear-gradient(90deg, #c799ff, #4af8e3, #c799ff)',
                        backgroundSize: '200% 100%',
                        animation: 'grad-shift 4s linear infinite, pulse 2s ease-in-out infinite',
                    }}
                >
                    {activePhase.label}
                </h2>
                <p className="font-body text-sm text-on-surface-variant">{activePhase.subtext}</p>
                <style>{`
                    @keyframes grad-shift {
                        0%   { background-position: 0% 50%;   }
                        50%  { background-position: 100% 50%; }
                        100% { background-position: 0% 50%;   }
                    }
                `}</style>
            </div>

            {/* Phase step list */}
            <div className="relative flex flex-col gap-0 w-full max-w-sm">
                {/* Connecting line */}
                <div className="absolute left-[19px] top-5 bottom-5 w-px bg-outline-variant/20" />

                {STEPS.map((step, i) => {
                    const isDone = i < activeStep;
                    const isActive = i === activeStep;
                    const isPending = i > activeStep;

                    return (
                        <div key={step.key} className="relative flex items-start gap-4 py-4 pl-1">
                            {/* Step indicator */}
                            <div className="relative z-10 shrink-0 mt-0.5">
                                {isDone ? (
                                    <div className="w-10 h-10 rounded-full bg-secondary/15 border border-secondary/30 flex items-center justify-center">
                                        <span
                                            className="material-symbols-outlined text-secondary text-[18px]"
                                            style={{ fontVariationSettings: "'FILL' 1" }}
                                        >
                                            check_circle
                                        </span>
                                    </div>
                                ) : isActive ? (
                                    <div className="relative w-10 h-10">
                                        {/* Pulsing outer ring */}
                                        <div className="absolute inset-0 rounded-full border border-primary/40 animate-ping opacity-60" />
                                        <div className="absolute inset-0 rounded-full border border-primary/20 animate-ping opacity-40" style={{ animationDelay: '0.3s' }} />
                                        {/* Inner filled dot */}
                                        <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-secondary/20 border border-primary/50 flex items-center justify-center shadow-[0_0_20px_rgba(199,153,255,0.35)]">
                                            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-10 h-10 rounded-full border border-outline-variant/20 bg-surface-container flex items-center justify-center">
                                        <span className="w-2 h-2 rounded-full bg-outline-variant/40" />
                                    </div>
                                )}
                            </div>

                            {/* Labels */}
                            <div className={`pt-2 transition-all duration-500 ${isActive ? 'opacity-100' : isDone ? 'opacity-50' : 'opacity-30'}`}>
                                <p className={`font-label text-sm uppercase tracking-widest leading-none ${isActive ? 'text-on-background' : isDone ? 'text-secondary' : 'text-on-surface-variant'}`}>
                                    {step.label}
                                </p>
                                {isActive && (
                                    <p className="font-body text-[11px] text-on-surface-variant/70 mt-1 leading-snug">
                                        {step.subtext}
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Progress bar at bottom */}
            <div className="mt-10 w-full max-w-sm">
                <div className="relative h-0.5 bg-outline-variant/20 rounded-full overflow-hidden">
                    <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${((activeStep + 1) / STEPS.length) * 100}%` }}
                    />
                    {/* Shimmer */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[slide_2s_infinite]" style={{ animation: 'slide 2s linear infinite' }} />
                    <style>{`
                        @keyframes slide {
                            0%   { transform: translateX(-100%); }
                            100% { transform: translateX(400%);  }
                        }
                    `}</style>
                </div>
                <div className="flex justify-between mt-2">
                    <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant/40">
                        Step {activeStep + 1} of {STEPS.length}
                    </span>
                    <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant/40">
                        {Math.round(((activeStep + 1) / STEPS.length) * 100)}%
                    </span>
                </div>
            </div>
        </div>
    );
};
