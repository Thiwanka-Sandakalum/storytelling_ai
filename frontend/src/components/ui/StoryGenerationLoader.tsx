import { createPortal } from 'react-dom';

interface StoryGenerationLoaderProps {
    status: string | null;
    topic?: string;
}

export const StoryGenerationLoader = ({ status, topic }: StoryGenerationLoaderProps) => {
    if (!status) return null;

    const statusMessages: Record<string, string> = {
        queued: 'Activating Neural Engine...',
        planning: 'Crafting narrative blueprint...',
        processing: 'Initializing story pipeline...',
        generating: 'Weaving your tale into existence...',
        assembling: 'Assembling the final manuscript...',
        cover_generating: 'Painting the cover art...',
        awaiting_approval: 'Waiting for your approval...',
        completed: 'Story ignited successfully!',
    };

    const message = statusMessages[status] || 'Generating your story...';

    return createPortal(
        <div className="fixed inset-0 bg-gradient-to-br from-[#0e0c20] via-[#1a1633] to-[#0e0c20] flex items-center justify-center z-[9999] overflow-hidden">
            {/* Animated Background Grid */}
            <div className="absolute inset-0 opacity-30">
                <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_24%,rgba(199,153,255,.1)_25%,rgba(199,153,255,.1)_26%,transparent_27%,transparent_74%,rgba(199,153,255,.1)_75%,rgba(199,153,255,.1)_76%,transparent_77%,transparent)] bg-[length:60px_60px]" />
            </div>

            {/* Animated Orbs */}
            <div className="absolute top-20 left-10 w-32 h-32 bg-primary/20 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-20 right-10 w-40 h-40 bg-secondary/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0.5s' }} />

            {/* Center Content */}
            <div className="relative z-10 flex flex-col items-center justify-center gap-8 text-center px-8">
                {/* Animated Text */}
                <div className="space-y-4">
                    <h1 className="font-headline italic text-5xl md:text-6xl text-transparent bg-gradient-to-r from-primary via-secondary to-primary-container bg-clip-text animate-pulse">
                        The Forge
                    </h1>
                    <p className="font-headline italic text-2xl md:text-3xl text-on-background">
                        {message}
                    </p>
                    {topic && (
                        <p className="font-body text-on-surface-variant text-lg max-w-2xl">
                            "{topic}"
                        </p>
                    )}
                </div>

                {/* Animated Progress Indicator */}
                <div className="relative w-64 h-1 bg-surface-container-high rounded-full overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary to-transparent animate-[slide_2s_infinite]"
                        style={{
                            animation: 'slide 2s infinite'
                        }}
                    />
                    <style>{`
            @keyframes slide {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
          `}</style>
                </div>

                {/* Particle Effect */}
                <div className="relative w-32 h-32">
                    {[...Array(8)].map((_, i) => (
                        <div
                            key={i}
                            className="absolute w-1 h-1 bg-primary rounded-full"
                            style={{
                                left: '50%',
                                top: '50%',
                                animation: `orbit 3s linear infinite`,
                                animationDelay: `${i * 0.375}s`,
                                transformOrigin: `0 0`,
                            }}
                        />
                    ))}
                    <style>{`
            @keyframes orbit {
              0% {
                transform: rotate(0deg) translateX(64px) scale(1);
                opacity: 1;
              }
              100% {
                transform: rotate(360deg) translateX(64px) scale(0.2);
                opacity: 0;
              }
            }
          `}</style>
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-2 mt-4">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                        {status.toUpperCase()}
                    </span>
                </div>
            </div>
        </div>,
        document.body
    );
};
