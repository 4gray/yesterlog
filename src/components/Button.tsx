import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "icon";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "primary-button",
  secondary: "secondary-button",
  ghost: "ghost-button",
  icon: "icon-button"
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/**
 * The one button. Renders the canonical classes from styles/primitives.css;
 * defaults to type="button" so it never submits a form by accident.
 * Bespoke view-local button classes should migrate here over time.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", className, type = "button", ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={className ? `${VARIANT_CLASS[variant]} ${className}` : VARIANT_CLASS[variant]}
      {...rest}
    />
  )
);

Button.displayName = "Button";
