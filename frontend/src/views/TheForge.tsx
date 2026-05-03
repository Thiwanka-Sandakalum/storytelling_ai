import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { GlassPanel } from '../components/ui/GlassPanel';
import { LuminousButton } from '../components/ui/LuminousButton';
import { StoryGenerationLoader } from '../components/ui/StoryGenerationLoader';
import { api } from '../services/api';
import { addNotification, setStatus, setStoryId } from '../store/slices/storySlice';

const tones = ['Inspirational', 'Educational', 'Dark', 'Funny'];
const lengths = ['short', 'medium', 'long'];

/** Maps display label to the backend enum value accepted by the API. */
const TONE_MAP: Record<string, string> = {
     Inspirational: 'inspirational',
     Educational: 'educational',
     Dark: 'dark',
     Funny: 'funny',
};

const TheForge = () => {
     const [topic, setTopic] = useState('');
     const [selectedTone, setSelectedTone] = useState('Inspirational');
     const [selectedLength, setSelectedLength] = useState('medium');
     const [audience, setAudience] = useState('');
     const [selectedVoice, setSelectedVoice] = useState('Puck');
     const [isIgniting, setIsIgniting] = useState(false);
     const [generatingStatus, setGeneratingStatus] = useState<string | null>(null);
     const [requireApproval, setRequireApproval] = useState(false);
     const dispatch = useDispatch();
     const navigate = useNavigate();

     const handleIgnite = async () => {
          if (!topic) return;
          setIsIgniting(true);
          setGeneratingStatus('queued');
          try {
               const result = await api.generateStory(
                    topic,
                    TONE_MAP[selectedTone] || 'inspirational',
                    audience || 'general audience',
                    selectedVoice as any,
                    selectedLength as any,
                    requireApproval,
               );

               // Sync story ID into Redux and navigate immediately.
               // SSE (via useSSE in TheBlueprint / StoryProgress) will drive all further status updates.
               dispatch(setStoryId(result.story_id));
               dispatch(setStatus('queued'));
               navigate(`/story/${result.story_id}`);
          } catch (err) {
               console.error('Ignite failed:', err);
               dispatch(addNotification({
                    type: 'error',
                    message: err instanceof Error ? err.message : 'Unable to ignite your story right now. Please try again.',
               }));
               setGeneratingStatus(null);
               setIsIgniting(false);
          }
     };

     return (
          <>
               <div className="h-[calc(100vh-5rem)] max-w-6xl mx-auto px-6 py-5 overflow-hidden flex flex-col">
                    <header className="mb-5">
                         <p className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary mb-2 flex items-center gap-2">
                              <span className="w-1 h-1 rounded-full bg-secondary animate-pulse"></span>
                              Neural Engine Active
                         </p>
                         <h1 className="font-headline italic text-4xl md:text-5xl text-on-background mb-2 text-glow">The Forge</h1>
                         <p className="text-on-surface-variant font-body text-sm md:text-base max-w-2xl leading-relaxed">
                              Define your story seed, pick tone and narrator, then ignite.
                         </p>
                    </header>

                    <div className="lg:col-span-8 min-h-0 flex flex-col gap-4">
                         <div className="relative min-h-0 flex-1">
                              <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/60 absolute -top-3 left-4 bg-background px-2 z-10">
                                   Story Seed
                              </label>
                              <GlassPanel className="p-5 h-full flex flex-col min-h-0">
                                   <textarea
                                        className="w-full h-full min-h-0 bg-transparent border-none focus:ring-0 text-lg md:text-xl font-headline italic text-on-background placeholder:text-on-surface-variant/30 resize-none"
                                        placeholder="A clockmaker discovers a key to the stars inside a pocket watch that has stopped for a century..."
                                        value={topic}
                                        onChange={(e) => setTopic(e.target.value)}
                                   />
                                   <div className="flex justify-end items-center mt-3 pt-3 border-t border-outline-variant/10">
                                        <span className="text-[10px] font-label text-on-surface-variant uppercase tracking-widest text-glow">
                                             {topic.length} / 2000 Tokens
                                        </span>
                                   </div>
                              </GlassPanel>
                         </div>

                         <div className="relative">
                              <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/60 absolute -top-3 left-4 bg-background px-2 z-10">
                                   Target Audience
                              </label>
                              <GlassPanel className="p-4">
                                   <input
                                        type="text"
                                        className="w-full bg-transparent border-none focus:ring-0 text-sm font-body text-on-background placeholder:text-on-surface-variant/30"
                                        placeholder="e.g., teens, tech enthusiasts, general audience"
                                        value={audience}
                                        onChange={(e) => setAudience(e.target.value)}
                                   />
                              </GlassPanel>
                         </div>

                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              {/* Review outline toggle */}
                              <div className="col-span-full flex items-center gap-3 px-1">
                                   <button
                                        type="button"
                                        role="switch"
                                        aria-checked={requireApproval}
                                        onClick={() => setRequireApproval((v) => !v)}
                                        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${requireApproval ? 'bg-primary' : 'bg-surface-container-high border border-outline-variant/30'}`}
                                   >
                                        <span
                                             className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${requireApproval ? 'translate-x-5' : 'translate-x-0'}`}
                                        />
                                   </button>
                                   <div>
                                        <p className="font-label text-xs font-semibold text-on-surface uppercase tracking-widest">
                                             Review outline before writing
                                        </p>
                                        <p className="font-body text-[11px] text-on-surface-variant/60 mt-0.5">
                                             Pause after planning so you can edit and approve the chapter structure.
                                        </p>
                                   </div>
                              </div>

                              <GlassPanel className="p-4">
                                   <h4 className="font-label text-[10px] uppercase tracking-widest text-secondary mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-sm">palette</span>
                                        Tone
                                   </h4>
                                   <div className="grid grid-cols-2 gap-2">
                                        {tones.map((tone) => (
                                             <button
                                                  key={tone}
                                                  onClick={() => setSelectedTone(tone)}
                                                  className={`px-3 py-2.5 rounded-lg border text-xs font-semibold tracking-wide transition-all ${selectedTone === tone
                                                       ? 'bg-primary/10 border-primary/40 text-primary'
                                                       : 'bg-surface-container-low border-outline-variant/15 text-on-surface-variant hover:border-outline'
                                                       }`}
                                             >
                                                  {tone}
                                             </button>
                                        ))}
                                   </div>
                              </GlassPanel>

                              <GlassPanel className="p-4">
                                   <h4 className="font-label text-[10px] uppercase tracking-widest text-secondary mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-sm">schedule</span>
                                        Length
                                   </h4>
                                   <div className="grid grid-cols-3 gap-2">
                                        {lengths.map((len) => (
                                             <button
                                                  key={len}
                                                  onClick={() => setSelectedLength(len)}
                                                  className={`px-3 py-2.5 rounded-lg border text-xs font-semibold tracking-wide transition-all capitalize ${selectedLength === len
                                                       ? 'bg-tertiary/10 border-tertiary/40 text-tertiary'
                                                       : 'bg-surface-container-low border-outline-variant/15 text-on-surface-variant hover:border-outline'
                                                       }`}
                                             >
                                                  {len}
                                             </button>
                                        ))}
                                   </div>
                              </GlassPanel>

                              <GlassPanel className="p-4">
                                   <h4 className="font-label text-[10px] uppercase tracking-widest text-secondary mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-sm">record_voice_over</span>
                                        Voice
                                   </h4>
                                   <div className="grid grid-cols-2 gap-2 grid-rows-3">
                                        {['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede'].map((voice) => (
                                             <button
                                                  key={voice}
                                                  onClick={() => setSelectedVoice(voice)}
                                                  className={`px-3 py-2.5 rounded-lg border text-xs font-semibold tracking-wide transition-all ${selectedVoice === voice
                                                       ? 'bg-secondary/10 border-secondary/40 text-secondary'
                                                       : 'bg-surface-container-low border-outline-variant/15 text-on-surface-variant hover:border-outline'
                                                       }`}
                                             >
                                                  {voice}
                                             </button>
                                        ))}
                                   </div>
                              </GlassPanel>
                         </div>
                         <LuminousButton
                              onClick={handleIgnite}
                              className="w-full py-4 text-sm tracking-[0.3em] disabled:opacity-50"
                              disabled={!topic || isIgniting}
                         >
                              {isIgniting ? 'Igniting...' : 'Ignite Tale'}
                         </LuminousButton>
                    </div>
               </div>

               {/* Show loader while generating story */}
               {generatingStatus && <StoryGenerationLoader status={generatingStatus} topic={topic} />}
          </>
     );
};

export default TheForge;
