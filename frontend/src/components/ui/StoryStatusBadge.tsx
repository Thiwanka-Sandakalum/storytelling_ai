import { getStoryStatusMeta } from '../../constants/storyStatus';

type StoryStatusBadgeProps = {
    status: string;
};

export const StoryStatusBadge = ({ status }: StoryStatusBadgeProps) => {
    const meta = getStoryStatusMeta(status);

    return (
        <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest shrink-0 ${meta.badgeClass}`}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
            {meta.label}
        </div>
    );
};
