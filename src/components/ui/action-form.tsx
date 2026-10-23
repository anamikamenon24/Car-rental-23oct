"use client";

import { createContext, use, useActionState, type ComponentProps, type ReactNode } from "react";
import { initialFormState, type FormState } from "@/lib/ui/form-state";
import { CheckboxField, FormMessage, SelectField, TextareaField, TextField } from "./field";
import { SubmitButton } from "./submit-button";
import type { ButtonVariant, ButtonSize } from "./button";
import { cn } from "@/lib/ui/cn";

type Ctx = { state: FormState; pending: boolean };
const FormCtx = createContext<Ctx>({ state: initialFormState, pending: false });

export function useActionFormState() {
  return use(FormCtx);
}

/**
 * Server-action form with inline errors. Fields placed inside (AF* components) read their
 * server-side validation error and last submitted value from context, so pages can compose
 * forms in Server Components while errors still render next to each input.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  submitVariant = "primary",
  submitSize = "md",
  submitTestId,
  className,
  ariaLabel,
  footer,
  hideMessage = false,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  children: ReactNode;
  submitLabel?: ReactNode;
  pendingLabel?: string;
  submitVariant?: ButtonVariant;
  submitSize?: ButtonSize;
  submitTestId?: string;
  className?: string;
  ariaLabel?: string;
  footer?: ReactNode;
  hideMessage?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <FormCtx value={{ state, pending }}>
      <form action={formAction} className={cn("space-y-4", className)} aria-label={ariaLabel} noValidate>
        {!hideMessage ? <FormMessage state={state} /> : null}
        {children}
        {submitLabel || footer ? (
          <div className="flex flex-wrap items-center gap-2">
            {submitLabel ? (
              <SubmitButton
                variant={submitVariant}
                size={submitSize}
                pending={pending}
                pendingLabel={pendingLabel}
                data-testid={submitTestId}
              >
                {submitLabel}
              </SubmitButton>
            ) : null}
            {footer}
          </div>
        ) : null}
      </form>
    </FormCtx>
  );
}

function useField(name: string, defaultValue: unknown) {
  const { state } = use(FormCtx);
  const echoed = state.values?.[name];
  return {
    error: state.fieldErrors?.[name],
    defaultValue: echoed !== undefined ? echoed : defaultValue == null ? undefined : String(defaultValue),
  };
}

type DV = { defaultValue?: string | number | null };
type TextProps = Omit<ComponentProps<typeof TextField>, "defaultValue"> & DV;
export function AFText({ defaultValue, ...props }: TextProps) {
  const f = useField(props.name, defaultValue);
  return <TextField {...props} defaultValue={f.defaultValue} error={props.error ?? f.error} />;
}

type SelectProps = Omit<ComponentProps<typeof SelectField>, "defaultValue"> & DV;
export function AFSelect({ defaultValue, ...props }: SelectProps) {
  const f = useField(props.name, defaultValue);
  return <SelectField {...props} defaultValue={f.defaultValue} error={props.error ?? f.error} />;
}

type TextareaProps = Omit<ComponentProps<typeof TextareaField>, "defaultValue"> & DV;
export function AFTextarea({ defaultValue, ...props }: TextareaProps) {
  const f = useField(props.name, defaultValue);
  return <TextareaField {...props} defaultValue={f.defaultValue} error={props.error ?? f.error} />;
}

type CheckboxProps = ComponentProps<typeof CheckboxField>;
export function AFCheckbox({ defaultChecked, ...props }: CheckboxProps) {
  const { state } = use(FormCtx);
  const echoed = state.values ? state.values[props.name] === "on" : undefined;
  return (
    <CheckboxField {...props} defaultChecked={echoed ?? defaultChecked} error={props.error ?? state.fieldErrors?.[props.name]} />
  );
}

/** Shows a form-level error for a non-field key (e.g. "_form" or a nested path). */
export function AFError({ name }: { name: string }) {
  const { state } = use(FormCtx);
  const msg = state.fieldErrors?.[name]?.[0];
  return msg ? <p className="text-xs font-medium text-red-700">{msg}</p> : null;
}
