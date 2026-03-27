
import { GlassPanel } from './GlassPanel';

type PlaybackBarProps = {
     isConnected: boolean;
     hasStarted: boolean;
     isMicRecording: boolean;
     volume: number;
     onStop: () => void;
     onVolumeChange: (value: number) => void;
     onMicToggle: () => void;
};

export const PlaybackBar = ({
     isConnected,
     hasStarted,
     isMicRecording,
     volume,
     onStop,
     onVolumeChange,
     onMicToggle,
}: PlaybackBarProps) => {
     return (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-50">
               <GlassPanel className="px-6 py-3 flex items-center justify-between gap-4 shadow-2xl bg-surface-container-low/60 backdrop-blur-2xl border border-outline-variant/20">
                    {/* Mic Toggle */}
                    <button
                         onClick={onMicToggle}
                         disabled={!isConnected || !hasStarted}
                         title={isMicRecording ? 'Stop asking' : 'Ask a question'}
                         className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed
                              ${isMicRecording
                                   ? 'bg-secondary/20 text-secondary shadow-[0_0_16px_4px_rgba(74,248,227,0.25)] animate-pulse'
                                   : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest hover:text-secondary'
                              }`}
                    >
                         <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: isMicRecording ? "'FILL' 1" : "'FILL' 0" }}>
                              {isMicRecording ? 'mic' : 'mic'}
                         </span>
                         {isMicRecording && (
                              <span className="absolute inset-0 rounded-full border border-secondary/50 animate-ping" />
                         )}
                    </button>

                    {/* Volume */}
                    <div className="flex items-center gap-2 flex-1">
                         <span className="material-symbols-outlined text-on-surface-variant/60 text-[18px]">volume_down</span>
                         <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.01}
                              value={volume}
                              onChange={(e) => onVolumeChange(Number(e.target.value))}
                              className="flex-1 accent-primary h-1"
                         />
                         <span className="material-symbols-outlined text-on-surface-variant/60 text-[18px]">volume_up</span>
                    </div>

                    {/* Stop Button */}
                    <button
                         onClick={onStop}
                         disabled={!hasStarted}
                         title="End narration"
                         className="w-10 h-10 rounded-full flex items-center justify-center bg-error/10 text-error hover:bg-error/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed border border-error/20"
                    >
                         <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>stop</span>
                    </button>
               </GlassPanel>
          </div>
     );
};
