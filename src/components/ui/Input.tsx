import React from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-xl border border-[#d8c8b2] bg-[#fffaf2]/80 px-4 py-2 text-base text-[#35261d] ring-offset-[#f7f0e4] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[#a08d7a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c75b2d] disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
