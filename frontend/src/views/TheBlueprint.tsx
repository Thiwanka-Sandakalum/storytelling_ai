import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useNavigate } from 'react-router-dom';
import { type RootState } from '../store';
import { GlassPanel } from '../components/ui/GlassPanel';
import { LuminousButton } from '../components/ui/LuminousButton';
import { ChapterCard } from '../components/ui/ChapterCard';
import { AsyncStatePanel } from '../components/ui/AsyncStatePanel';
import { GenerationProgress } from '../components/ui/GenerationProgress';
import { api } from '../services/api';
import type { StoryChapterOut, StoryOutlineOut, StorySectionOut } from '../services/api';
import { useSSE } from '../hooks/useSSE';
import { setStoryId, setStatus, setOutline, addNotification, type BackendStatus, type Outline } from '../store/slices/storySlice';

/** In-progress statuses where we show the live progress view, not the editor. */
const ACTIVE_STATUSES = new Set(['queued', 'processing', 'planning', 'generating', 'assembling', 'cover_generating']);

const BACKEND_STATUSES: BackendStatus[] = [
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
     typeof value === 'string' && BACKEND_STATUSES.includes(value as BackendStatus);

const cloneOutline = (outline: StoryOutlineOut): StoryOutlineOut =>
     JSON.parse(JSON.stringify(outline)) as StoryOutlineOut;

const buildFlatSectionsFromChapters = (chapters: StoryChapterOut[]): StorySectionOut[] => {
     let runningIndex = 0;
     return chapters.flatMap((chapter, chIdx) => {
          const chapterIndex = chapter.chapter_index ?? chIdx;
          return chapter.sections.map((section) => {
               const next: StorySectionOut = {
                    ...section,
                    index: section.index ?? runningIndex,
                    chapter_index: chapterIndex,
                    chapter_title: chapter.title,
               };
               runningIndex += 1;
               return next;
          });
     });
};

const TheBlueprint = () => {
     const dispatch = useDispatch();
     const navigate = useNavigate();
     const { id: urlId } = useParams<{ id: string }>();

     const { currentId, status, outline: reduxOutline } = useSelector((state: RootState) => state.story);

     // Hydrate Redux from URL param on direct navigation / refresh
     useEffect(() => {
          if (urlId && urlId !== currentId) {
               dispatch(setStoryId(urlId));
               api.getStoryStatus(urlId).then((data) => {
                    dispatch(setStatus(data.status as any));
                    if (data.outline) dispatch(setOutline(data.outline as Outline));
               }).catch(() => {
                    dispatch(addNotification({ type: 'error', message: 'Could not load story details.' }));
               });
          }
     }, [urlId, currentId, dispatch]);

     const storyId = urlId ?? currentId;

     // Subscribe to SSE for live updates
     // sseReconnectKey increments after outline approval so the stream re-opens
     // to track the resuming generation phase.
     const [sseReconnectKey, setSseReconnectKey] = useState(0);
     useSSE(storyId, sseReconnectKey);

     // Navigate automatically when generation completes
     useEffect(() => {
          if (status === 'completed' && storyId) {
               navigate(`/studio/${storyId}`, { replace: true });
          }
     }, [status, storyId, navigate]);

     // Local state for editable outline
     const [localOutline, setLocalOutline] = useState<StoryOutlineOut | null>(null);
     const [isSaving, setIsSaving] = useState(false);
     const [isApproving, setIsApproving] = useState(false);
     const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

     // Reset editor state whenever the active story changes.
     useEffect(() => {
          setLocalOutline(null);
          setHasUnsavedChanges(false);
     }, [storyId]);

     // Hydrate from Redux when we have a backend outline and no local edits in progress.
     useEffect(() => {
          if (!reduxOutline) return;
          if (hasUnsavedChanges) return;
          setLocalOutline(cloneOutline(reduxOutline as StoryOutlineOut));
     }, [reduxOutline, hasUnsavedChanges]);

     const updateOutlineDraft = (updater: (current: StoryOutlineOut) => StoryOutlineOut) => {
          setLocalOutline((current) => {
               if (!current) return current;
               return updater(current);
          });
          setHasUnsavedChanges(true);
     };

     const handleSectionEdit = (chapterIdx: number, sectionIdx: number, field: 'title' | 'description', value: string) => {
          updateOutlineDraft((outline) => {
               const chapters = outline.chapters.map((chapter, ci) => {
                    if (ci !== chapterIdx) return chapter;
                    const sections = chapter.sections.map((section, si) =>
                         si === sectionIdx ? { ...section, [field]: value } : section
                    );
                    return { ...chapter, sections };
               });

               return {
                    ...outline,
                    chapters,
                    sections: buildFlatSectionsFromChapters(chapters),
               };
          });
     };

     const handleOutlineTextEdit = (field: 'hook' | 'closing', value: string) => {
          updateOutlineDraft((outline) => ({ ...outline, [field]: value }));
     };

     const handleSave = async () => {
          if (!storyId || !localOutline) return;
          setIsSaving(true);
          try {
               const updated = await api.patchOutline(storyId, localOutline);
               if (updated.outline) {
                    dispatch(setOutline(updated.outline as Outline));
                    setLocalOutline(cloneOutline(updated.outline));
               }
               setHasUnsavedChanges(false);
               dispatch(addNotification({ type: 'success', message: 'Blueprint changes preserved.' }));
          } catch (err) {
               console.error('Save failed:', err);
               dispatch(addNotification({ type: 'error', message: 'Failed to save architectural changes.' }));
          } finally {
               setIsSaving(false);
          }
     };

     const handleConfirm = async () => {
          if (!storyId) return;
          setIsApproving(true);
          // Persist any unsaved edits before approving
          if (localOutline) {
               try {
                    const patched = await api.patchOutline(storyId, localOutline);
                    if (patched.outline) {
                         dispatch(setOutline(patched.outline as Outline));
                         setLocalOutline(cloneOutline(patched.outline));
                    }
                    setHasUnsavedChanges(false);
               } catch {
                    dispatch(addNotification({ type: 'error', message: 'Failed to save outline edits before approval.' }));
                    setIsApproving(false);
                    return;
               }
          }
          try {
               const approved = await api.approveOutline(storyId);
               if (approved.outline) {
                    dispatch(setOutline(approved.outline as Outline));
                    setLocalOutline(cloneOutline(approved.outline));
               }
               if (isBackendStatus(approved.status)) {
                    dispatch(setStatus(approved.status));
               }
               // Reopen SSE stream after approval so resumed pipeline events are received.
               setSseReconnectKey((k) => k + 1);
          } catch (err) {
               console.error('Approval failed:', err);
               dispatch(addNotification({ type: 'error', message: 'Approval failed. The pipeline checkpoint may have expired — please regenerate.' }));
          } finally {
               setIsApproving(false);
          }
     };

     // ── Render: still in active generation phase ───────────────────────────
     if (ACTIVE_STATUSES.has(status)) {
          return (
               <div className="max-w-2xl mx-auto">
                    <GenerationProgress status={status} />
               </div>
          );
     }

     // ── Render: idle (hydration in flight) — show spinner ──────────────────
     if (status === 'idle') {
          return (
               <div className="max-w-6xl mx-auto px-8 py-12">
                    <AsyncStatePanel state="loading" title="Loading story…" message="Fetching story details from the Architect." />
               </div>
          );
     }

     // ── Render: failed — show error with recovery action ───────────────────
     if (status === 'failed') {
          return (
               <div className="max-w-6xl mx-auto px-8 py-12">
                    <AsyncStatePanel
                         state="error"
                         title="Generation Failed"
                         message="The Architect encountered an error and could not complete your story. Please return to the Forge and try again."
                         actionLabel="Back to Forge"
                         onAction={() => navigate('/')}
                    />
               </div>
          );
     }

     // ── Keep original active-phase block just to satisfy compiler — unreachable ──
     // ── Render: awaiting_approval — outline editor ──────────────────────────
     const isAwaitingApproval = status === 'awaiting_approval';
     const chapters = localOutline?.chapters ?? [];

     return (
          <div className="max-w-6xl mx-auto px-8 py-12">
               <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    {/* Left: Structural Visualization */}
                    <div className="lg:col-span-8 space-y-8">
                         <header className="mb-10">
                              <div className="flex justify-between items-start">
                                   <div>
                                        <h2 className="font-headline italic text-4xl text-on-background mb-2">The Blueprint</h2>
                                        <p className="text-on-surface-variant font-body text-sm max-w-xl">
                                             Review and refine the narrative architecture.{' '}
                                             {isAwaitingApproval
                                                  ? 'The foundation is ready for your seal of approval.'
                                                  : 'The Architect is still weaving the threads.'}
                                        </p>
                                   </div>
                                   {isAwaitingApproval && (
                                        <LuminousButton
                                             variant="secondary"
                                             className="px-6 py-2"
                                             onClick={handleSave}
                                             disabled={isSaving || !hasUnsavedChanges}
                                        >
                                             {isSaving ? 'Preserving…' : 'Save Changes'}
                                        </LuminousButton>
                                   )}
                              </div>
                         </header>

                         {localOutline && (
                              <div className="space-y-2 mb-4">
                                   <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/60">Hook</p>
                                   {isAwaitingApproval ? (
                                        <textarea
                                             className="w-full bg-surface-container-low/40 border border-outline-variant/20 rounded-xl p-3 font-body text-sm text-on-surface-variant leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary/30 resize-y min-h-[88px]"
                                             value={localOutline.hook}
                                             onChange={(e) => handleOutlineTextEdit('hook', e.target.value)}
                                        />
                                   ) : (
                                        <p className="font-body text-sm text-on-surface-variant leading-relaxed">{localOutline.hook}</p>
                                   )}
                              </div>
                         )}

                         <div className="space-y-4">
                              {chapters.map((chapter, chIdx) => (
                                   <div key={chIdx} className="space-y-2">
                                        <p className="font-label text-[10px] uppercase tracking-widest text-secondary">
                                             Chapter {(chapter.chapter_index ?? chIdx) + 1} — {chapter.title}
                                        </p>
                                        {chapter.sections.map((section, secIdx) => (
                                             <ChapterCard
                                                  key={secIdx}
                                                  number={(section.index ?? secIdx) + 1}
                                                  title={section.title}
                                                  content={section.description}
                                                  generating={!isAwaitingApproval}
                                                  onEdit={
                                                       isAwaitingApproval
                                                            ? (field, val) => handleSectionEdit(chIdx, secIdx, field, val)
                                                            : undefined
                                                  }
                                             />
                                        ))}
                                   </div>
                              ))}
                         </div>

                         {localOutline && (
                              <div className="space-y-2 mt-4">
                                   <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/60">Closing</p>
                                   {isAwaitingApproval ? (
                                        <textarea
                                             className="w-full bg-surface-container-low/40 border border-outline-variant/20 rounded-xl p-3 font-body text-sm text-on-surface-variant leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary/30 resize-y min-h-[88px]"
                                             value={localOutline.closing}
                                             onChange={(e) => handleOutlineTextEdit('closing', e.target.value)}
                                        />
                                   ) : (
                                        <p className="font-body text-sm text-on-surface-variant leading-relaxed">{localOutline.closing}</p>
                                   )}
                              </div>
                         )}
                    </div>

                    {/* Right: Story Metadata + Approve */}
                    <div className="lg:col-span-4 space-y-5">
                         {/* Metadata card */}
                         {localOutline && (
                              <GlassPanel className="p-6 space-y-5 bg-surface-container-low/60">
                                   <p className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                                        Story Stats
                                   </p>
                                   <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                             <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/50">Words</span>
                                             <span className="font-body text-sm text-on-background">{localOutline.target_words.toLocaleString()}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                             <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/50">Read time</span>
                                             <span className="font-body text-sm text-on-background">~{localOutline.target_minutes} min</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                             <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/50">Chapters</span>
                                             <span className="font-body text-sm text-on-background">{localOutline.chapters.length}</span>
                                        </div>
                                   </div>
                              </GlassPanel>
                         )}

                         {/* Approve card */}
                         <GlassPanel className="p-6 space-y-4 bg-surface-container-low/60">
                              <div className="space-y-1">
                                   <p className="font-label text-[10px] uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                                        <span className={`w-1.5 h-1.5 rounded-full bg-primary ${isAwaitingApproval ? 'animate-pulse' : ''}`} />
                                        Review Required
                                   </p>
                                   <p className="font-body text-xs text-on-surface-variant/60 leading-relaxed">
                                        {isAwaitingApproval
                                             ? 'The blueprint is ready. Review each chapter above, then seal it to begin writing.'
                                             : 'Waiting for the Architect to finalise the structure…'}
                                   </p>
                              </div>

                              <LuminousButton
                                   onClick={handleConfirm}
                                   className="w-full py-3.5 text-sm tracking-[0.15em]"
                                   disabled={!isAwaitingApproval || isApproving}
                              >
                                   {isApproving ? 'Approving…' : 'Seal the Blueprint'}
                              </LuminousButton>
                         </GlassPanel>
                    </div>
               </div>
          </div>
     );
};

export default TheBlueprint;
