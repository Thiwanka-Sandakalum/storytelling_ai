type AsyncStatePanelProps = {
    state: 'loading' | 'empty' | 'error' | 'initializing';
    title: string;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
};

export const AsyncStatePanel = ({
    state,
    title,
    message,
    actionLabel,
    onAction,
}: AsyncStatePanelProps) => {
    const icon = state === 'empty' ? 'auto_stories' : state === 'error' ? 'error' : 'autorenew';
    const iconWrapperClass =
        state === 'error'
            ? 'bg-error/10 text-error'
            : 'bg-surface-container text-on-surface-variant';
    const iconClass = state === 'loading' || state === 'initializing' ? 'animate-spin' : '';

    return (
        <div className="flex flex-col items-center justify-center h-64 gap-5 text-center px-6">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center ${iconWrapperClass}`}>
                <span
                    className={`material-symbols-outlined text-4xl ${iconClass}`}
                    style={state === 'loading' || state === 'initializing' ? { animationDuration: '2s' } : { fontVariationSettings: "'FILL' 0" }}
                >
                    {icon}
                </span>
            </div>

            <div>
                <p className="font-headline italic text-xl text-on-background mb-1">{title}</p>
                <p className="font-body text-sm text-on-surface-variant">{message}</p>
            </div>

            {actionLabel && onAction && (
                <button
                    onClick={onAction}
                    className="px-4 py-2 rounded-lg border border-outline-variant/20 text-on-surface-variant hover:text-on-surface hover:border-outline-variant/40 transition-all font-label text-[10px] uppercase tracking-widest"
                >
                    {actionLabel}
                </button>
            )}
        </div>
    );
};
