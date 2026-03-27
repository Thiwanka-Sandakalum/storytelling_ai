import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { type RootState } from '../store';
import { GlassPanel } from '../components/ui/GlassPanel';
import { LuminousButton } from '../components/ui/LuminousButton';
import { ChapterCard } from '../components/ui/ChapterCard';
import { ArchitectLog } from '../components/ui/ArchitectLog';
import { api } from '../services/api';
import { useSSE } from '../hooks/useSSE';
import { setStatus, addNotification, type Outline, type StorySection } from '../store/slices/storySlice';

interface TheBlueprintProps {
     onConfirm?: () => void;
}

const TheBlueprint = ({ onConfirm }: TheBlueprintProps) => {
     const dispatch = useDispatch();
     const { currentId, events, status, outline: reduxOutline } = useSelector((state: RootState) => state.story);

     // Initialize SSE Monitoring
     useSSE(currentId);

     // Local state for structural edits
     const [localOutline, setLocalOutline] = useState<Outline | null>(null);
     const [isSaving, setIsSaving] = useState(false);

     useEffect(() => {
          if (reduxOutline && !localOutline) {
               setLocalOutline(reduxOutline);
          }
     }, [reduxOutline, localOutline]);

     const handleSectionEdit = (index: number, field: 'title' | 'description', value: string) => {
          if (!localOutline) return;
          const newSections = [...localOutline.sections];
          newSections[index] = { ...newSections[index], [field]: value };
          setLocalOutline({ ...localOutline, sections: newSections });
     };

     const handleSave = async () => {
          if (!currentId || !localOutline) return;
          setIsSaving(true);
          try {
               await api.patchOutline(currentId, localOutline);
               dispatch(addNotification({ type: 'success', message: 'Blueprint changes preserved.' }));
          } catch (err) {
               console.error('Save failed:', err);
               dispatch(addNotification({ type: 'error', message: 'Failed to save architectural changes.' }));
          } finally {
               setIsSaving(false);
          }
     };

     const handleConfirm = async () => {
          if (!currentId) return;
          // Auto-save if changes exist before confirming
          if (localOutline !== reduxOutline) {
               await handleSave();
          }
          try {
               await api.approveOutline(currentId);
               dispatch(setStatus('writing'));
               if (onConfirm) onConfirm();
          } catch (err) {
               console.error('Approval failed:', err);
          }
     };

     if (!localOutline && status === 'planning') {
          return (
               <div className="flex items-center justify-center h-[60vh]">
                    <div className="text-center space-y-4">
                         <div className="w-12 h-12 border-2 border-secondary border-t-transparent rounded-full animate-spin mx-auto"></div>
                         <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant/60">Architect is drafting the foundation...</p>
                    </div>
               </div>
          );
     }

     const isPendingApproval = status === 'pending_approval';
     const sections = localOutline?.sections || [];

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
                                             Review and refine the narrative architecture. {isPendingApproval ? "The foundation is ready for your seal of approval." : "The Architect is still weaving the threads."}
                                        </p>
                                   </div>
                                   {isPendingApproval && (
                                        <LuminousButton
                                             variant="secondary"
                                             className="px-6 py-2"
                                             onClick={handleSave}
                                             disabled={isSaving}
                                        >
                                             {isSaving ? 'Preserving...' : 'Save Changes'}
                                        </LuminousButton>
                                   )}
                              </div>
                         </header>

                         <div className="space-y-4">
                              {sections.map((section: StorySection, idx: number) => (
                                   <ChapterCard
                                        key={idx}
                                        number={idx + 1}
                                        title={section.title}
                                        content={section.description}
                                        generating={!isPendingApproval}
                                        onEdit={isPendingApproval ? (field, val) => handleSectionEdit(idx, field as any, val) : undefined}
                                   />
                              ))}
                         </div>
                    </div>

                    {/* Right: Architect Log & Controls */}
                    <div className="lg:col-span-4 space-y-6">
                         <ArchitectLog logs={events} />

                         <GlassPanel className="p-8 space-y-6">
                              <div className="space-y-2">
                                   <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/60">Current Phase</p>
                                   <p className="font-body text-lg font-bold text-secondary capitalize">{status.replace('_', ' ')}</p>
                              </div>

                              <div className="pt-4 border-t border-outline-variant/10">
                                   <LuminousButton
                                        onClick={handleConfirm}
                                        className="w-full py-4 text-sm tracking-[0.2em]"
                                        disabled={!isPendingApproval}
                                   >
                                        Seal the Blueprint
                                   </LuminousButton>
                                   {!isPendingApproval && (
                                        <p className="text-[10px] text-center mt-4 text-on-surface-variant/40 font-label uppercase tracking-tighter">
                                             Waiting for Architect to finalize structures...
                                        </p>
                                   )}
                              </div>
                         </GlassPanel>
                    </div>
               </div>
          </div>
     );
};

export default TheBlueprint;
