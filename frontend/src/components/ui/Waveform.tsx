

export const Waveform = () => {
     return (
          <div className="flex items-center justify-center gap-1.5 h-32 mb-16 px-12 w-full">
               {[...Array(11)].map((_, i) => (
                    <div
                         key={i}
                         className={`wave-bar w-1 rounded-full ${i % 2 === 0 ? 'bg-primary' : 'bg-secondary'
                              } ${i === 5 ? 'w-2 bg-secondary-fixed shadow-[0_0_15px_rgba(74,248,227,0.4)]' : ''}`}
                         style={{
                              animationDelay: `${i * 0.1}s`,
                              height: i === 5 ? '48px' : '24px'
                         }}
                    />
               ))}
          </div>
     );
};
