import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import { setStoryId, setStatus } from '../store/slices/storySlice';
import { toggleFavorite } from '../store/slices/favoritesSlice';
import { GlassPanel } from '../components/ui/GlassPanel';
import { ProseCanvas } from '../components/ui/ProseCanvas';
import { SiriOrb } from '../components/ui/SiriOrb';
import { useTTSContext } from '../context/TTSContext';
import { api } from '../services/api';

interface StoryDetails {
     story_id: string;
     topic: string;
     status: string;
     created_at: string;
     outline?: {
          hook?: string;
          sections?: { title: string; description: string }[];
          climax?: string;
          closing?: string;
     };
}

const NarratorStudio = () => {
     const { id } = useParams<{ id: string }>();
     const dispatch = useDispatch();
     const { session } = useSelector((state: RootState) => state.story);
     const favoriteIds = useSelector((state: RootState) => state.favorites.ids);
     const isFavorite = id ? favoriteIds.includes(id) : false;
     const [storyDetails, setStoryDetails] = useState<StoryDetails | null>(null);

     // Sync URL param → Redux so TTSContext initialises the correct session
     useEffect(() => {
          if (id) {
               dispatch(setStoryId(id));
               dispatch(setStatus('completed'));
               api.getStoryStatus(id).then(setStoryDetails).catch(console.error);
          }
     }, [id, dispatch]);
     const {
          activeIndex,
          isPlaying,
          isConnected,
          isBuffering,
          hasStarted,
          isMicRecording,
          play,
          stop,
          startMicQuestion,
          stopMicQuestion,
     } = useTTSContext();

     const paragraphs: string[] = (session?.segmentData ?? []).map(
          (seg: { text: string }) => seg.text
     );
     const storySnippet = paragraphs[0]?.slice(0, 180) || 'Your narrative will appear here once playback begins.';

     const statusLabel = isMicRecording
          ? 'Listening to your question...'
          : isBuffering
               ? 'Buffering audio...'
               : hasStarted
                    ? 'Narrating your story'
                    : isConnected
                         ? 'Ready — press play'
                         : 'Connecting to Narrator...';

     return (
          <div className="relative flex flex-col h-[calc(100vh-5rem)] overflow-hidden">
               {/* Atmospheric background */}
               <div className="absolute inset-0 pointer-events-none -z-10 overflow-hidden">
                    <div className="absolute top-[-15%] left-[-10%] w-[60%] h-[60%] bg-primary/5 rounded-full blur-[160px]" />
                    <div className="absolute bottom-[-10%] right-[-5%] w-[45%] h-[45%] bg-secondary/5 rounded-full blur-[130px]" />
                    <div className="absolute top-[40%] right-[15%] w-[25%] h-[25%] bg-primary/3 rounded-full blur-[90px]" />
               </div>

               {/* Status bar */}
               <div className="flex items-center justify-between px-10 pt-7 pb-0 shrink-0">
                    <div className="flex items-center gap-2">
                         <div className={`w-2 h-2 rounded-full transition-colors ${isPlaying ? 'bg-secondary animate-pulse' :
                              isConnected ? 'bg-primary animate-pulse' : 'bg-outline-variant'
                              }`} />
                         <span className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">
                              {statusLabel}
                         </span>
                    </div>
                    <span className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/30">
                         Narrator Studio
                    </span>
               </div>

               {/* Story Canvas Player Card */}
               <div className="px-6 md:px-10 pt-4 shrink-0">
                    <GlassPanel className="p-4 md:p-6 bg-surface-container-low/70 border border-outline-variant/20">
                         <div className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr] gap-5 md:gap-8 items-center">

                              {/* ── LEFT: Story Details ── */}
                              <div className="space-y-3 md:space-y-4">
                                   <p className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                                        Story Canvas
                                   </p>

                                   {/* Title / topic */}
                                   <h2 className="font-headline italic text-2xl md:text-3xl text-on-background leading-tight line-clamp-3">
                                        {storyDetails?.topic ?? 'Loading story…'}
                                   </h2>

                                   {/* Meta row */}
                                   {storyDetails && (
                                        <div className="flex items-center gap-4 flex-wrap">
                                             <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/60">
                                                  {new Date(storyDetails.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                             </span>
                                             <span className={`font-label text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${storyDetails.status === 'completed'
                                                  ? 'text-secondary border-secondary/30 bg-secondary/10'
                                                  : 'text-primary border-primary/30 bg-primary/10'
                                                  }`}>
                                                  {storyDetails.status}
                                             </span>
                                        </div>
                                   )}

                                   {/* Hook / first snippet */}
                                   <p className="font-body text-sm text-on-surface-variant leading-relaxed line-clamp-3">
                                        {storyDetails?.outline?.hook ?? storySnippet}
                                   </p>

                                   {/* Section count + favourite */}
                                   <div className="flex items-center gap-3">
                                        {storyDetails?.outline?.sections?.length ? (
                                             <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/50">
                                                  {storyDetails.outline.sections.length} chapter{storyDetails.outline.sections.length !== 1 ? 's' : ''}
                                             </p>
                                        ) : null}
                                        {id && (
                                             <button
                                                  onClick={() => dispatch(toggleFavorite(id))}
                                                  title={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
                                                  className={`flex items-center gap-1 font-label text-[10px] uppercase tracking-widest transition-colors ${isFavorite ? 'text-primary' : 'text-on-surface-variant/40 hover:text-primary'
                                                       }`}
                                             >
                                                  <span
                                                       className="material-symbols-outlined text-[16px]"
                                                       style={{ fontVariationSettings: `'FILL' ${isFavorite ? 1 : 0}` }}
                                                  >
                                                       favorite
                                                  </span>
                                                  {isFavorite ? 'Saved' : 'Save'}
                                             </button>
                                        )}
                                   </div>
                              </div>

                              {/* ── RIGHT: Siri Orb with embedded controls ── */}
                              <div className="flex items-center justify-center w-full justify-self-center">
                                   <SiriOrb
                                        isActive={hasStarted && isPlaying && !isBuffering}
                                        isMicActive={isMicRecording}
                                        isConnecting={!isConnected && !hasStarted}
                                        isBuffering={isBuffering}
                                        hasStarted={hasStarted}
                                        canPlay={isConnected && !hasStarted}
                                        onPlay={play}
                                        onStop={stop}
                                        onMicToggle={isMicRecording ? stopMicQuestion : startMicQuestion}
                                   />
                              </div>

                         </div>
                    </GlassPanel>
               </div>

               {/* === PROSE ZONE — only when text available === */}
               {paragraphs.length > 0 && (
                    <div className="flex-1 min-h-0 relative mb-6">
                         {/* Fade gradient at top */}
                         <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none" />
                         <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent z-10 pointer-events-none" />
                         <div className="h-full overflow-y-auto px-12 pt-2 pb-4 scroll-smooth
                              [&::-webkit-scrollbar]:w-1
                              [&::-webkit-scrollbar-thumb]:bg-primary/20
                              [&::-webkit-scrollbar-thumb]:rounded-full
                              [&::-webkit-scrollbar-track]:transparent">
                              <ProseCanvas paragraphs={paragraphs} activeIndex={activeIndex} />
                         </div>
                    </div>
               )}
          </div>
     );
};

export default NarratorStudio;
