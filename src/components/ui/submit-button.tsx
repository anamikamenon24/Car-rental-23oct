"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button";
import { Spinner } from "./spinner";

type Props = Omit<ComponentProps<"button">, "type"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pendingLabel?: string;
  /** Force pending state (e.g. from useActionState) in addition to useFormStatus. */
  pending?: boolean;
};

/** Submit button that disables itself and shows a spinner while its form's action runs. */
export function SubmitButton({
  variant = "primary",
  size = "md",
  className,
  children,
  pendingLabel,
  pending: pendingProp,
  disabled,
  ...props
}: Props) {
  const { pending: formPending } = useFormStatus();
  const pending = formPending || Boolean(pendingProp);
  return (
    <button
      type="submit"
      className={buttonClasses(variant, size, className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending ? <Spinner className="size-4" /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
