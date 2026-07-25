import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", ...props }, ref) => {
    // Tailwind base classes
    const baseStyles = "inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-[color,background-color,border-color,box-shadow,transform,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]";

    // Variants
    const variants = {
      default: "bg-primary text-on-primary hover:bg-primary-fixed shadow-[0_0_15px_rgba(192,193,255,0.15)]",
      destructive: "bg-error text-on-error hover:bg-error-container",
      outline: "border border-outline-variant bg-transparent text-white hover:bg-white/5 hover:text-white",
      secondary: "bg-surface-container-high text-white hover:bg-surface-container-highest",
      ghost: "hover:bg-white/5 hover:text-white text-zinc-400",
      link: "text-primary underline-offset-4 hover:underline",
    };

    // Sizes
    const sizes = {
      default: "h-10 px-4 py-2",
      sm: "h-9 rounded-md px-3 text-xs",
      lg: "h-11 rounded-lg px-8 text-base",
      icon: "h-10 w-10",
    };

    const combinedClassName = `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`.trim();

    return (
      <button
        className={combinedClassName}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };
