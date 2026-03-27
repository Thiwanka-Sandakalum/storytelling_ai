
import { cn } from '../../utils/cn';

interface LuminousButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
     variant?: 'primary' | 'secondary' | 'outline';
     glow?: boolean;
}

export const LuminousButton = ({
     children,
     className,
     variant = 'primary',
     glow = true,
     ...props
}: LuminousButtonProps) => {
     const variants = {
          primary: "bg-gradient-to-br from-primary via-primary-container to-secondary text-on-primary-container font-black shadow-lg shadow-primary/20 hover:scale-[1.03]",
          secondary: "bg-surface-container-high text-on-surface-variant hover:text-primary",
          outline: "bg-transparent border border-outline-variant/30 text-on-surface-variant hover:border-primary/50",
     };

     return (
          <button
               className={cn(
                    "px-6 py-3 rounded-xl transition-all duration-300 active:scale-95 font-label text-xs uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed",
                    variants[variant],
                    glow && variant === 'primary' && "ignite-glow",
                    className
               )}
               {...props}
          >
               {children}
          </button>
     );
};
