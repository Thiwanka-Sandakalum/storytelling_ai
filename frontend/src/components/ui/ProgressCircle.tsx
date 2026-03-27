

interface ProgressCircleProps {
     percentage: number;
}

export const ProgressCircle = ({ percentage }: ProgressCircleProps) => {
     const radius = 60;
     const stroke = 4;
     const normalizedRadius = radius - stroke * 2;
     const circumference = normalizedRadius * 2 * Math.PI;
     const strokeDashoffset = circumference - (percentage / 100) * circumference;

     return (
          <div className="relative w-32 h-32 mb-6">
               <svg className="w-full h-full -rotate-90">
                    <circle
                         className="text-surface-container-high"
                         strokeWidth={stroke}
                         stroke="currentColor"
                         fill="transparent"
                         r={normalizedRadius}
                         cx={radius}
                         cy={radius}
                    />
                    <circle
                         className="text-primary transition-all duration-1000 ease-out"
                         strokeWidth={stroke}
                         strokeDasharray={circumference + ' ' + circumference}
                         style={{ strokeDashoffset }}
                         strokeLinecap="round"
                         stroke="currentColor"
                         fill="transparent"
                         r={normalizedRadius}
                         cx={radius}
                         cy={radius}
                    />
               </svg>
               <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-headline text-3xl italic text-on-background">{percentage}%</span>
                    <span className="font-label text-[8px] uppercase tracking-widest text-on-surface-variant">Forged</span>
               </div>
               <div className="absolute -inset-2 rounded-full border border-primary/20 blur-sm animate-pulse-slow"></div>
          </div>
     );
};
