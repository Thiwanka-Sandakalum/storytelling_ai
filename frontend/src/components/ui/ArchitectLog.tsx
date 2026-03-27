import { useEffect, useRef } from 'react';

interface LogEntry {
     timestamp: string;
     message: string;
     type?: 'info' | 'success' | 'warning' | 'error';
}

interface ArchitectLogProps {
     logs: LogEntry[];
}

export const ArchitectLog = ({ logs }: ArchitectLogProps) => {
     const scrollRef = useRef<HTMLDivElement>(null);

     useEffect(() => {
          if (scrollRef.current) {
               scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
     }, [logs]);

     return (
          <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl overflow-hidden shadow-2xl">
               <div className="bg-surface-container px-4 py-2 flex items-center justify-between border-b border-outline-variant/20">
                    <span className="font-label text-[10px] text-secondary font-bold uppercase tracking-widest">Architect Log</span>
                    <div className="flex gap-1.5">
                         <div className="w-2 h-2 rounded-full bg-error/40"></div>
                         <div className="w-2 h-2 rounded-full bg-secondary/40"></div>
                         <div className="w-2 h-2 rounded-full bg-primary/40"></div>
                    </div>
               </div>
               <div
                    ref={scrollRef}
                    className="p-6 h-64 font-mono text-[11px] leading-relaxed text-secondary/70 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-primary/20"
               >
                    {logs.map((log, i) => (
                         <p key={i}>
                              <span className="text-secondary-dim">[{log.timestamp}]</span> {log.message}
                              {i === logs.length - 1 && <span className="w-1.5 h-3 bg-secondary inline-block align-middle ml-2 animate-pulse" />}
                         </p>
                    ))}
                    {logs.length === 0 && (
                         <p className="opacity-40 italic">Awaiting connection to Neural Engine...</p>
                    )}
               </div>
          </div>
     );
};
