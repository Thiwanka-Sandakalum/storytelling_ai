
import { GlassPanel } from './GlassPanel';

interface ChapterCardProps {
     number: number;
     title: string;
     content: string;
     tags?: string[];
     generating?: boolean;
     onEdit?: (field: 'title' | 'description', value: string) => void;
}

export const ChapterCard = ({ number, title, content, tags, generating, onEdit }: ChapterCardProps) => {
     if (generating) {
          return (
               <GlassPanel className="p-8 border-dashed border-2 border-primary/20 bg-surface-container-low/30 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-transparent animate-pulse-slow"></div>
                    <div className="relative z-10 py-10 flex flex-col items-center justify-center text-center">
                         <div className="w-12 h-12 mb-4 flex items-center justify-center">
                              <span className="material-symbols-outlined text-primary text-4xl animate-spin" style={{ animationDuration: '3s' }}>
                                   deployed_code
                              </span>
                         </div>
                         <p className="font-label text-[10px] text-primary uppercase tracking-[0.3em] font-bold">Architect is Thinking</p>
                         <p className="font-headline italic text-xl text-on-surface-variant mt-2">Generating Chapter {String(number).padStart(2, '0')}: {title}</p>
                    </div>
               </GlassPanel>
          );
     }

     return (
          <GlassPanel className="p-8 group hover:border-primary/30 transition-all mb-4">
               <div className="flex items-start justify-between mb-6">
                    <div className="flex-1">
                         <span className="font-label text-[10px] text-primary-dim uppercase tracking-tighter mb-1 block">Chapter {String(number).padStart(2, '0')}</span>
                         {onEdit ? (
                              <input
                                   className="font-headline text-3xl italic text-on-background bg-transparent border-none focus:ring-1 focus:ring-primary/30 rounded px-1 -ml-1 w-full"
                                   value={title}
                                   onChange={(e) => onEdit('title', e.target.value)}
                              />
                         ) : (
                              <h3 className="font-headline text-3xl italic text-on-background group-hover:text-primary transition-colors">{title}</h3>
                         )}
                    </div>
               </div>
               {onEdit ? (
                    <textarea
                         className="font-body text-on-surface-variant leading-relaxed w-full bg-transparent border-none focus:ring-1 focus:ring-primary/30 rounded resize-none"
                         rows={3}
                         value={content}
                         onChange={(e) => onEdit('description', e.target.value)}
                    />
               ) : (
                    <p className="font-body text-on-surface-variant leading-relaxed">
                         {content}
                    </p>
               )}
               {tags && tags.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-outline-variant/10 flex gap-4">
                         {tags.map(tag => (
                              <span key={tag} className="bg-surface-container-highest px-3 py-1 rounded-full text-[10px] text-on-surface-variant uppercase tracking-widest border border-outline-variant/20">
                                   {tag}
                              </span>
                         ))}
                    </div>
               )}
          </GlassPanel>
     );
};
