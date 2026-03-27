

interface ProseCanvasProps {
     paragraphs: string[];
     activeIndex: number;
}

export const ProseCanvas = ({ paragraphs, activeIndex }: ProseCanvasProps) => {
     return (
          <div className="text-center space-y-12 overflow-y-auto max-h-[512px] px-4 no-scrollbar scroll-smooth pb-32">
               {paragraphs.map((p, i) => (
                    <p
                         key={i}
                         className={`font-display text-2xl md:text-5xl italic leading-relaxed transition-all duration-700 ${i === activeIndex
                                   ? "text-on-surface text-glow font-bold scale-105"
                                   : i < activeIndex ? "text-on-surface/10 blur-[2px]" : "text-on-surface/30"
                              }`}
                    >
                         {p}
                    </p>
               ))}
          </div>
     );
};
