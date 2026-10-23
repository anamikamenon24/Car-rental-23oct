import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export const inputClasses =
  "block w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 shadow-xs transition-colors hover:border-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-ink-100 disabled:text-ink-500 aria-invalid:border-red-500 aria-invalid:focus:ring-red-200";

type ErrorValue = string | string[] | undefined | null;

function firstError(error: ErrorValue): string | undefined {
  if (!error) return undefined;
  return Array.isArray(error) ? error[0] : error;
}

type FieldShellProps = {
  id: string;
  label: ReactNode;
  error?: ErrorValue;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
  labelClassName?: string;
};

/** Label + control + hint + inline error, wired with aria-describedby. */
export function FieldShell({ id, label, error, hint, required, className, children, labelClassName }: FieldShellProps) {
  const msg = firstError(error);
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className={cn("mb-1.5 block text-sm font-medium text-ink-800", labelClassName)}>
        {label}
        {required ? (
          <span className="ml-0.5 text-red-700" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !msg ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
      {msg ? (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-red-700">
          {msg}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error: ErrorValue, hint: ReactNode) {
  if (firstError(error)) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

type CommonProps = {
  label: ReactNode;
  name: string;
  error?: ErrorValue;
  hint?: ReactNode;
  wrapperClassName?: string;
};

export function TextField({
  label,
  name,
  id,
  error,
  hint,
  wrapperClassName,
  className,
  required,
  ...props
}: CommonProps & ComponentProps<"input">) {
  const fieldId = id ?? `f-${name}`;
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      <input
        id={fieldId}
        name={name}
        required={required}
        aria-invalid={firstError(error) ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        className={cn(inputClasses, className)}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  name,
  id,
  error,
  hint,
  wrapperClassName,
  className,
  required,
  children,
  ...props
}: CommonProps & ComponentProps<"select">) {
  const fieldId = id ?? `f-${name}`;
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      <select
        id={fieldId}
        name={name}
        required={required}
        aria-invalid={firstError(error) ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        className={cn(inputClasses, "pr-8", className)}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function TextareaField({
  label,
  name,
  id,
  error,
  hint,
  wrapperClassName,
  className,
  required,
  ...props
}: CommonProps & ComponentProps<"textarea">) {
  const fieldId = id ?? `f-${name}`;
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      <textarea
        id={fieldId}
        name={name}
        required={required}
        aria-invalid={firstError(error) ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        className={cn(inputClasses, "min-h-24", className)}
        {...props}
      />
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  name,
  id,
  error,
  hint,
  wrapperClassName,
  ...props
}: CommonProps & Omit<ComponentProps<"input">, "type">) {
  const fieldId = id ?? `f-${name}`;
  const msg = firstError(error);
  return (
    <div className={wrapperClassName}>
      <div className="flex items-start gap-2.5">
        <input
          id={fieldId}
          name={name}
          type="checkbox"
          aria-invalid={msg ? true : undefined}
          aria-describedby={describedBy(fieldId, error, hint)}
          className="mt-0.5 size-4 rounded border-ink-300 accent-brand-700"
          {...props}
        />
        <label htmlFor={fieldId} className="text-sm text-ink-800">
          {label}
        </label>
      </div>
      {hint && !msg ? (
        <p id={`${fieldId}-hint`} className="ml-6.5 mt-1 text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
      {msg ? (
        <p id={`${fieldId}-error`} className="ml-6.5 mt-1 text-xs font-medium text-red-700">
          {msg}
        </p>
      ) : null}
    </div>
  );
}

/** Form-level error/success line for useActionState results. */
export function FormMessage({ state }: { state: { status: string; message?: string } | null | undefined }) {
  if (!state?.message) return null;
  const isError = state.status === "error";
  return (
    <p
      role={isError ? "alert" : "status"}
      aria-live="polite"
      className={cn(
        "rounded-lg px-3 py-2 text-sm",
        isError ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800",
      )}
    >
      {state.message}
    </p>
  );
}
