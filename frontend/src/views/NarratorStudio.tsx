import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import { setStoryId, setStatus, setOutline } from '../store/slices/storySlice';
import type { BackendStatus, Outline } from '../store/slices/storySlice';
import { toggleFavorite } from '../store/slices/favoritesSlice';
import { useTTSContext } from '../context/TTSContext';
import { api } from '../services/api';
import type { StoryStatusResponse } from '../services/api';

const KNOWN_STATUSES: BackendStatus[] = [
     'idle',
     'queued',
     'processing',
     'planning',
     'generating',
     'assembling',
     'cover_generating',
     'awaiting_approval',
     'completed',
     'failed',
];

const isBackendStatus = (value: unknown): value is BackendStatus =>
     typeof value === 'string' && KNOWN_STATUSES.includes(value as BackendStatus);

const NarratorStudio = () => {
     const { id } = useParams<{ id: string }>();
     const dispatch = useDispatch();
     const { outline } = useSelector((state: RootState) => state.story);
     const favoriteIds = useSelector((state: RootState) => state.favorites.ids);
     const isFavorite = id ? favoriteIds.includes(id) : false;
     const [storyDetails, setStoryDetails] = useState<StoryStatusResponse | null>(null);
     const [coverUrl, setCoverUrl] = useState<string | null>(null);
     const [coverError, setCoverError] = useState(false);
     const [showScript, setShowScript] = useState(false);

     // Sync URL param → Redux and fetch full story details
     useEffect(() => {
          if (!id) return;
          dispatch(setStoryId(id));
          api.getStoryStatus(id).then((data) => {
               setStoryDetails(data);
               if (isBackendStatus(data.status)) {
                    dispatch(setStatus(data.status));
               }
               if (data.outline) dispatch(setOutline(data.outline as Outline));
          }).catch(console.error);

          // Check cover availability non-blocking
          api.coverExists(id).then((res) => {
               if (res.has_cover) {
                    setCoverUrl(api.getCoverUrl(id));
                    setCoverError(false);
               }
          }).catch(() => {/* no cover — silent */ });
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

     const paragraphs: string[] = storyDetails?.draft_script
          ? storyDetails.draft_script.split(/\n{2,}/).filter(Boolean)
          : [];
     const chapterCount = outline?.chapters?.length ?? storyDetails?.outline?.chapters?.length ?? 0;
     const hasCover = Boolean(coverUrl) && !coverError;
     const totalParagraphs = paragraphs.length;
     const activeSegment = activeIndex >= 0 ? activeIndex + 1 : 0;
     const totalWords = storyDetails?.draft_script
          ? storyDetails.draft_script.trim().split(/\s+/).filter(Boolean).length
          : 0;
     const genreLabel = storyDetails?.tone
          ? `${storyDetails.tone.charAt(0).toUpperCase()}${storyDetails.tone.slice(1)}`
          : 'Story';
     const audienceLabel = storyDetails?.audience ?? 'General Audience';
     const releaseDateLabel = storyDetails
          ? new Date(storyDetails.created_at).toLocaleDateString(undefined, {
               month: 'long',
               day: 'numeric',
               year: 'numeric',
          })
          : null;

     const activeParagraph = activeIndex >= 0 && activeIndex < paragraphs.length
          ? paragraphs[activeIndex]
          : null;

     const statusLabel = isMicRecording
          ? 'Listening...'
          : isBuffering
               ? 'Buffering...'
               : isPlaying
                    ? 'Narrating'
                    : isConnected
                         ? 'Ready'
                         : 'Connecting...';

     const canInteract = isConnected || hasStarted;

     const mainActionLabel = isBuffering
          ? 'Buffering'
          : hasStarted
               ? 'Stop Narration'
               : 'Play Narration';

     const onMainAction = () => {
          if (hasStarted) {
               stop();
               return;
          }
          if (isConnected) {
               play();
          }
     };

     return (
          <div className="relative flex flex-col h-[calc(100vh-5rem)] overflow-hidden">
               {/* Background treatment */}
               <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
                    {hasCover && (
                         <img
                              src={coverUrl!}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover scale-[1.08] blur-3xl opacity-[0.1]"
                              aria-hidden="true"
                         />
                    )}
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,#0e0c20_0%,#100d22_48%,#0b0a17_100%)]" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(199,153,255,0.11),transparent_52%),radial-gradient(circle_at_80%_20%,rgba(74,248,227,0.08),transparent_45%)]" />
               </div>

               <div className="px-5 md:px-8 pt-7 pb-5 shrink-0 flex items-center justify-between">
                    <span className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/50">
                         Narrator Studio
                    </span>
                    <div className="flex items-center gap-2">
                         <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-secondary animate-pulse' : isConnected ? 'bg-primary animate-pulse' : 'bg-outline-variant/40'}`} />
                         <span className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/60">
                              {statusLabel}
                         </span>
                    </div>
               </div>

               <div className="flex-1 min-h-0 flex flex-col px-5 md:px-8 pb-4">
                    <section className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-6 xl:gap-10 overflow-hidden">
                         {/* Left column */}
                         <div className="min-h-0 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                              <div className="rounded-[28px] border border-white/[0.06] bg-[linear-gradient(160deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] backdrop-blur-xl p-6 md:p-7 shadow-[0_18px_60px_rgba(0,0,0,0.38)]">
                                   <div className="flex items-center gap-2 text-on-surface-variant/70 text-sm">
                                        <span className="material-symbols-outlined text-[17px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                                             theater_comedy
                                        </span>
                                        <span className="font-label uppercase tracking-[0.14em] text-[10px]">Story Session</span>
                                   </div>

                                   <h1 className="font-headline italic text-4xl md:text-5xl leading-[1.03] mt-3 text-on-background">
                                        {storyDetails?.topic ?? 'Loading story...'}
                                   </h1>

                                   <div className="mt-4 flex items-center gap-3 flex-wrap">
                                        <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-label uppercase tracking-[0.16em] text-on-surface-variant bg-white/[0.05] border border-white/[0.06]">
                                             {genreLabel}
                                        </span>
                                        <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-label uppercase tracking-[0.16em] border text-primary border-primary/30 bg-primary/10">
                                             {storyDetails?.status ?? 'loading'}
                                        </span>
                                   </div>

                                   <p className="mt-5 font-body text-base text-on-surface-variant/85 leading-relaxed">
                                        {releaseDateLabel
                                             ? `This story was generated on ${releaseDateLabel} for ${audienceLabel}.`
                                             : 'We are preparing your studio details.'}
                                        {chapterCount > 0 ? ` It contains ${chapterCount} chapter${chapterCount === 1 ? '' : 's'}.` : ''}
                                   </p>

                                   <div className="mt-6 grid grid-cols-3 gap-3">
                                        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
                                             <p className="font-label text-[9px] uppercase tracking-[0.18em] text-on-surface-variant/45">Segments</p>
                                             <p className="font-body text-lg text-on-background mt-1">{totalParagraphs || '-'}</p>
                                        </div>
                                        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
                                             <p className="font-label text-[9px] uppercase tracking-[0.18em] text-on-surface-variant/45">Words</p>
                                             <p className="font-body text-lg text-on-background mt-1">{totalWords || '-'}</p>
                                        </div>
                                        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
                                             <p className="font-label text-[9px] uppercase tracking-[0.18em] text-on-surface-variant/45">Active</p>
                                             <p className="font-body text-lg text-on-background mt-1">{activeSegment > 0 ? `${activeSegment}/${totalParagraphs || 0}` : '--'}</p>
                                        </div>
                                   </div>

                                   <div className="mt-6 flex items-center gap-3">
                                        <button
                                             onClick={onMainAction}
                                             disabled={!canInteract}
                                             className={`min-w-[220px] rounded-full px-6 py-3.5 inline-flex items-center justify-center gap-2 font-body text-lg transition-all ${canInteract
                                                  ? 'bg-on-background text-background hover:brightness-95 shadow-[0_10px_24px_rgba(0,0,0,0.25)]'
                                                  : 'bg-surface-container-high text-on-surface-variant/40 cursor-not-allowed'
                                                  }`}
                                        >
                                             {isBuffering ? (
                                                  <span className="w-5 h-5 border-2 border-background/25 border-t-background rounded-full animate-spin" />
                                             ) : (
                                                  <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                                                       {hasStarted ? 'stop' : 'play_arrow'}
                                                  </span>
                                             )}
                                             {mainActionLabel}
                                        </button>

                                        {id && (
                                             <button
                                                  onClick={() => dispatch(toggleFavorite(id))}
                                                  className={`w-12 h-12 rounded-full border transition-all inline-flex items-center justify-center ${isFavorite
                                                       ? 'border-primary/40 bg-primary/10 text-primary'
                                                       : 'border-white/[0.12] bg-white/[0.03] text-on-surface-variant/55 hover:text-primary hover:border-primary/35'
                                                       }`}
                                                  title={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
                                             >
                                                  <span className="material-symbols-outlined text-[19px]" style={{ fontVariationSettings: `'FILL' ${isFavorite ? 1 : 0}` }}>
                                                       favorite
                                                  </span>
                                             </button>
                                        )}
                                   </div>

                                   <div className="mt-5 flex items-center gap-2">
                                        <button
                                             onClick={stop}
                                             disabled={!hasStarted}
                                             className="h-10 px-4 rounded-full border border-white/[0.1] bg-white/[0.03] text-on-surface-variant/70 hover:text-on-surface hover:bg-white/[0.07] disabled:opacity-35 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1.5"
                                        >
                                             <span className="material-symbols-outlined text-[18px]">replay</span>
                                             Restart
                                        </button>

                                        <button
                                             onClick={isMicRecording ? stopMicQuestion : startMicQuestion}
                                             disabled={!hasStarted}
                                             className={`h-10 px-4 rounded-full border transition-all inline-flex items-center gap-1.5 disabled:opacity-35 disabled:cursor-not-allowed ${isMicRecording
                                                  ? 'border-secondary/35 bg-secondary/10 text-secondary animate-pulse'
                                                  : 'border-white/[0.1] bg-white/[0.03] text-on-surface-variant/70 hover:text-on-surface hover:bg-white/[0.07]'
                                                  }`}
                                        >
                                             <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: `'FILL' ${isMicRecording ? 1 : 0}` }}>
                                                  mic
                                             </span>
                                             {isMicRecording ? 'Stop Question' : 'Ask Question'}
                                        </button>
                                   </div>

                                   {(activeParagraph || storyDetails?.outline?.hook) && (
                                        <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                                             <p className="font-label text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/45 mb-2">Now Reading</p>
                                             <p className="font-body text-sm leading-relaxed text-on-surface-variant/95 line-clamp-4">
                                                  {activeParagraph ?? storyDetails?.outline?.hook}
                                             </p>
                                        </div>
                                   )}

                                   {storyDetails?.draft_script && (
                                        <div className="mt-5">
                                             <button
                                                  onClick={() => setShowScript(v => !v)}
                                                  className="w-full h-10 rounded-full border border-white/[0.1] bg-white/[0.03] text-on-surface-variant/70 hover:text-on-surface hover:bg-white/[0.07] transition-all inline-flex items-center justify-center gap-1.5 font-label text-xs uppercase tracking-[0.14em]"
                                             >
                                                  <span className="material-symbols-outlined text-[17px]" style={{ fontVariationSettings: `'FILL' ${showScript ? 1 : 0}` }}>
                                                       menu_book
                                                  </span>
                                                  {showScript ? 'Hide Story' : 'Read Story'}
                                                  <span className="material-symbols-outlined text-[15px] ml-0.5 transition-transform duration-300" style={{ transform: showScript ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                                       expand_more
                                                  </span>
                                             </button>

                                             {showScript && (
                                                  <div className="mt-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 max-h-[480px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                                       <p className="font-label text-[9px] uppercase tracking-[0.18em] text-on-surface-variant/40 mb-3">Full Story Transcript</p>
                                                       {storyDetails.draft_script.split(/\n{2,}/).filter(Boolean).map((para, i) => (
                                                            <p
                                                                 key={i}
                                                                 className={`font-body text-sm leading-relaxed mb-4 last:mb-0 transition-colors ${activeIndex === i ? 'text-on-background' : 'text-on-surface-variant/75'}`}
                                                            >
                                                                 {activeIndex === i && (
                                                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mr-2 mb-0.5 animate-pulse align-middle" />
                                                                 )}
                                                                 {para}
                                                            </p>
                                                       ))}
                                                  </div>
                                             )}
                                        </div>
                                   )}
                              </div>
                         </div>

                         {/* Right column: album hero */}
                         <div className="min-h-0 flex items-start lg:items-center justify-center overflow-hidden lg:pt-1">
                              <div className="relative w-full aspect-square rounded-[30px] overflow-hidden border border-white/[0.08] shadow-[0_30px_80px_rgba(0,0,0,0.5)] bg-[linear-gradient(145deg,#211c3b,#120f24)]">
                                   {hasCover ? (
                                        <img
                                             src={coverUrl!}
                                             alt="Story cover"
                                             className="w-full h-full object-cover"
                                             onError={() => setCoverError(true)}
                                        />
                                   ) : (
                                        <div className="w-full h-full bg-[radial-gradient(circle_at_28%_20%,rgba(199,153,255,0.55),transparent_55%),radial-gradient(circle_at_70%_80%,rgba(74,248,227,0.22),transparent_50%),linear-gradient(155deg,#261d45_0%,#15112b_80%)]" />
                                   )}

                                   <div className="absolute inset-0 bg-gradient-to-t from-black/42 via-transparent to-black/10" />

                                   <button
                                        onClick={onMainAction}
                                        disabled={!canInteract}
                                        className={`absolute left-5 bottom-5 w-16 h-16 rounded-full border border-white/30 backdrop-blur-md inline-flex items-center justify-center transition-all ${canInteract ? 'bg-black/45 text-white hover:bg-black/55' : 'bg-black/25 text-white/45 cursor-not-allowed'}`}
                                        title={mainActionLabel}
                                   >
                                        {isBuffering ? (
                                             <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                             <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                                                  {hasStarted ? 'stop' : 'play_arrow'}
                                             </span>
                                        )}
                                   </button>

                                   <div className="absolute right-5 bottom-5 text-right">
                                        <p className="font-label text-[10px] uppercase tracking-[0.2em] text-white/60">Magic Tale</p>
                                        <p className="font-headline italic text-white/85 text-xl leading-none mt-1">Narrator Studio</p>
                                   </div>
                              </div>
                         </div>
                    </section>
               </div>
          </div>
     );
};

export default NarratorStudio;
