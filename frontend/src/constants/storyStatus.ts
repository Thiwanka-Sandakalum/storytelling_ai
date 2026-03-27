export type StoryStatus =
    | 'idle'
    | 'queued'
    | 'planning'
    | 'pending_approval'
    | 'writing'
    | 'completed'
    | 'failed'
    | string;

export type StoryStatusMeta = {
    label: string;
    badgeClass: string;
    dotClass: string;
    emphasisClass: string;
};

export const STORY_STATUS_META: Record<string, StoryStatusMeta> = {
    idle: {
        label: 'Idle',
        badgeClass: 'text-on-surface-variant border-outline-variant/30 bg-surface-container',
        dotClass: 'bg-outline-variant',
        emphasisClass: 'text-on-surface-variant',
    },
    queued: {
        label: 'Queued',
        badgeClass: 'text-on-surface-variant border-outline-variant/30 bg-surface-container',
        dotClass: 'bg-outline-variant animate-pulse',
        emphasisClass: 'text-on-surface-variant',
    },
    planning: {
        label: 'Planning',
        badgeClass: 'text-tertiary border-tertiary/30 bg-tertiary/10',
        dotClass: 'bg-tertiary animate-pulse',
        emphasisClass: 'text-tertiary',
    },
    pending_approval: {
        label: 'Pending Approval',
        badgeClass: 'text-primary border-primary/30 bg-primary/10',
        dotClass: 'bg-primary animate-pulse',
        emphasisClass: 'text-primary',
    },
    writing: {
        label: 'Writing',
        badgeClass: 'text-primary border-primary/30 bg-primary/10',
        dotClass: 'bg-primary animate-pulse',
        emphasisClass: 'text-primary',
    },
    completed: {
        label: 'Ready',
        badgeClass: 'text-secondary border-secondary/30 bg-secondary/10',
        dotClass: 'bg-secondary',
        emphasisClass: 'text-secondary',
    },
    failed: {
        label: 'Failed',
        badgeClass: 'text-error border-error/30 bg-error/10',
        dotClass: 'bg-error',
        emphasisClass: 'text-error',
    },
};

export const getStoryStatusMeta = (status: StoryStatus): StoryStatusMeta => {
    return STORY_STATUS_META[status] ?? STORY_STATUS_META.queued;
};
