
import { cn } from '../../utils/cn';

interface GlassPanelProps {
     children: React.ReactNode;
     className?: string;
}

export const GlassPanel = ({ children, className }: GlassPanelProps) => {
     return (
          <div className={cn(
               "glass-panel p-8 rounded-3xl cosmic-glow border border-outline-variant/15 hover:border-primary/20 transition-all duration-500",
               className
          )}>
               {children}
          </div>
     );
};
