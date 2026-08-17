import React from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c75b2d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f0e4] disabled:pointer-events-none disabled:opacity-50',
          {
            'bg-[#c75b2d] text-[#fffaf2] hover:bg-[#ad4825] shadow-[0_8px_18px_rgba(151,60,26,0.16)]': variant === 'primary',
            'bg-[#ead3ad] text-[#4b382c] hover:bg-[#dfc393]': variant === 'secondary',
            'border border-[#cdbba3] bg-transparent hover:bg-[#eadfcd] text-[#4b382c]': variant === 'outline',
            'hover:bg-[#eadfcd] text-[#796a5d] hover:text-[#35261d]': variant === 'ghost',
            'h-9 px-4 text-sm': size === 'sm',
            'h-11 px-6 text-base': size === 'md',
            'h-14 px-8 text-lg': size === 'lg',
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
