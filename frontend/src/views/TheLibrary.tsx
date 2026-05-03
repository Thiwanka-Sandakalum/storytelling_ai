import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassPanel } from '../components/ui/GlassPanel';
import { AsyncStatePanel } from '../components/ui/AsyncStatePanel';
import { StoryStatusBadge } from '../components/ui/StoryStatusBadge';
import { api } from '../services/api';
import type { StorySummary } from '../services/api';

const TheLibrary = () => {
    const navigate = useNavigate();
    const [stories, setStories] = useState<StorySummary[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<StorySummary | null>(null);

    const fetchStories = useCallback(async (isManualRefresh = false) => {
        setLoadError(null);
        if (isManualRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        try {
            const data = await api.listStories(50, 0);
            setStories(data.stories);
            setTotal(data.total);
        } catch (err) {
            console.error('Failed to load library:', err);
            setLoadError('Unable to load your stories right now. Please try again.');
        } finally {
            if (isManualRefresh) {
                setRefreshing(false);
            } else {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        fetchStories();
    }, [fetchStories]);

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        const storyId = pendingDelete.story_id;
        setDeletingId(storyId);
        try {
            await api.deleteStory(storyId);
            setStories((prev) => prev.filter((s) => s.story_id !== storyId));
            setTotal((t) => t - 1);
        } catch (err) {
            console.error('Delete failed:', err);
        } finally {
            setDeletingId(null);
            setPendingDelete(null);
        }
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
        <div className="h-[calc(100vh-5rem)] flex flex-col px-8 py-6 overflow-hidden">
            {/* Header */}
            <header className="mb-6 shrink-0">
                <p className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary mb-2 flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-secondary animate-pulse" />
                    {total} {total === 1 ? 'Story' : 'Stories'} Archived
                </p>
                <div className="flex items-end justify-between">
                    <div>
                        <h1 className="font-headline italic text-4xl md:text-5xl text-on-background text-glow">The Library</h1>
                        <p className="text-on-surface-variant font-body text-sm mt-1 max-w-xl">
                            Your generated stories. Click any ready tale to enter the Narrator Studio.
                        </p>
                    </div>
                    <button
                        onClick={() => fetchStories(true)}
                        disabled={loading || refreshing}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-outline-variant/20 text-on-surface-variant hover:text-on-surface hover:border-outline-variant/40 transition-all font-label text-[10px] uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span className={`material-symbols-outlined text-[16px] ${refreshing ? 'animate-spin' : ''}`} style={refreshing ? { animationDuration: '1s' } : undefined}>
                            refresh
                        </span>
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {loading ? (
                    <AsyncStatePanel
                        state="loading"
                        title="Preparing Library"
                        message="Loading your stories..."
                    />
                ) : loadError ? (
                    <AsyncStatePanel
                        state="error"
                        title="Library Unavailable"
                        message={loadError}
                        actionLabel="Try Again"
                        onAction={() => fetchStories(true)}
                    />
                ) : stories.length === 0 ? (
                    <AsyncStatePanel
                        state="empty"
                        title="No stories yet"
                        message="Head to The Forge and ignite your first tale."
                        actionLabel="Go to Forge"
                        onAction={() => navigate('/')}
                    />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-6">
                        {stories.map((story) => {
                            const isReady = story.status === 'completed';
                            const isReviewable = story.status === 'awaiting_approval';
                            const isClickable = isReady || isReviewable;
                            const isDeleting = deletingId === story.story_id;

                            const handleClick = () => {
                                if (isReady) navigate(`/studio/${story.story_id}`);
                                else if (isReviewable) navigate(`/story/${story.story_id}`);
                            };

                            return (
                                <div
                                    key={story.story_id}
                                    className={`group transition-all duration-300 rounded-3xl ${isClickable ? 'cursor-pointer' : ''}
                                        } ${isDeleting ? 'opacity-40 pointer-events-none' : ''}`}
                                    onClick={isClickable ? handleClick : undefined}
                                >
                                    <GlassPanel
                                        className={`p-4 flex flex-col gap-4 border border-outline-variant/10 ${isClickable
                                            ? 'group-hover:border-primary/30 group-hover:shadow-[0_0_30px_rgba(199,153,255,0.1)]'
                                            : 'opacity-80'
                                            }`}
                                    >
                                        {/* Cover thumbnail */}
                                        <div className="relative aspect-[3/2] rounded-2xl overflow-hidden border border-outline-variant/10">
                                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,_rgba(199,153,255,0.35)_0%,_transparent_55%),radial-gradient(circle_at_75%_75%,_rgba(74,248,227,0.2)_0%,_transparent_50%),linear-gradient(160deg,#161132_0%,#0e0b24_100%)]" />
                                            {isReady ? (
                                                <img
                                                    src={api.getCoverUrl(story.story_id)}
                                                    alt={`Cover for ${story.topic}`}
                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                    onError={(e) => {
                                                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            ) : null}
                                            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0818]/45 via-transparent to-transparent" />
                                        </div>

                                        {/* Top row */}
                                        <div className="flex items-start justify-between gap-3">
                                            <StoryStatusBadge status={story.status} />
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPendingDelete(story);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/10 transition-all shrink-0"
                                                title="Delete story"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">delete</span>
                                            </button>
                                        </div>

                                        {/* Topic */}
                                        <p className="font-headline italic text-on-background text-base leading-snug line-clamp-3 min-h-[4.5rem]">
                                            "{story.topic}"
                                        </p>

                                        {/* Footer */}
                                        <div className="flex items-center justify-between mt-auto pt-3 border-t border-outline-variant/10">
                                            <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/50">
                                                {formatDate(story.created_at)}
                                            </span>
                                            {isReady && (
                                                <span className="flex items-center gap-1 font-label text-[10px] uppercase tracking-widest text-primary group-hover:gap-2 transition-all">
                                                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                                                        play_circle
                                                    </span>
                                                    Listen
                                                </span>
                                            )}
                                            {isReviewable && (
                                                <span className="flex items-center gap-1 font-label text-[10px] uppercase tracking-widest text-primary group-hover:gap-2 transition-all">
                                                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                                                        rate_review
                                                    </span>
                                                    Review
                                                </span>
                                            )}
                                        </div>
                                    </GlassPanel>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {pendingDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
                    <GlassPanel className="w-full max-w-md p-6 border border-outline-variant/20">
                        <h3 className="font-headline italic text-2xl text-on-background mb-2">Delete Story</h3>
                        <p className="font-body text-sm text-on-surface-variant leading-relaxed mb-6">
                            Delete this story permanently?
                        </p>
                        <p className="font-headline italic text-on-background line-clamp-2 mb-6">
                            "{pendingDelete.topic}"
                        </p>
                        <div className="flex items-center justify-end gap-3">
                            <button
                                onClick={() => setPendingDelete(null)}
                                disabled={deletingId === pendingDelete.story_id}
                                className="px-4 py-2 rounded-lg border border-outline-variant/20 text-on-surface-variant hover:text-on-surface hover:border-outline-variant/40 transition-all font-label text-[10px] uppercase tracking-widest disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={deletingId === pendingDelete.story_id}
                                className="px-4 py-2 rounded-lg border border-error/30 bg-error/10 text-error hover:bg-error/20 transition-all font-label text-[10px] uppercase tracking-widest disabled:opacity-50"
                            >
                                {deletingId === pendingDelete.story_id ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </GlassPanel>
                </div>
            )}
        </div>
    );
};

export default TheLibrary;
