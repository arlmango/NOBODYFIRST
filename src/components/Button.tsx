import type { ComponentPropsWithRef, MouseEvent } from 'react';

export type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'quiet';
};

/**
 * Native button. Prefer `aria-disabled` over `disabled` when the reason should stay
 * focusable and readable; clicks are swallowed while aria-disabled is set.
 */
export function Button({ variant = 'primary', className, type = 'button', onClick, ...rest }: ButtonProps) {
  const ariaDisabled = rest['aria-disabled'] === true || rest['aria-disabled'] === 'true';
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (ariaDisabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      {...rest}
      type={type}
      className={['btn', `btn--${variant}`, className].filter(Boolean).join(' ')}
      onClick={handleClick}
    />
  );
}
