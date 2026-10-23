"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { safeNext } from "@/lib/ui/safe-next";

type FieldErrors = Partial<Record<"name" | "email" | "password", string>>;

/** Maps Better Auth error codes to the field they belong to. */
function mapAuthError(error: { code?: string; message?: string; status?: number }): {
  field?: keyof FieldErrors;
  message: string;
} {
  const code = error.code ?? "";
  if (code === "USER_ALREADY_EXISTS" || code.includes("ALREADY_EXISTS"))
    return { field: "email", message: "An account with this email already exists. Try signing in." };
  if (code === "INVALID_EMAIL") return { field: "email", message: "Enter a valid email address." };
  if (code === "PASSWORD_TOO_SHORT") return { field: "password", message: error.message ?? "Password is too short." };
  if (code === "PASSWORD_TOO_LONG") return { field: "password", message: error.message ?? "Password is too long." };
  if (code === "INVALID_EMAIL_OR_PASSWORD") return { message: "Email or password is incorrect." };
  if (error.status === 429) return { message: "Too many attempts. Please wait a minute and try again." };
  return { message: error.message || "Something went wrong. Please try again." };
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    startTransition(async () => {
      setFormError(null);
      setFieldErrors({});
      const res = await signIn.email({ email, password });
      if (res.error) {
        const mapped = mapAuthError(res.error);
        if (mapped.field) setFieldErrors({ [mapped.field]: mapped.message });
        else setFormError(mapped.message);
        return;
      }
      router.push(safeNext(next));
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate={false} className="space-y-4" aria-label="Sign in">
      {formError ? (
        <Alert tone="error" data-testid="login-error">
          {formError}
        </Alert>
      ) : null}
      <TextField
        label="Email"
        name="email"
        id="login-email"
        data-testid="login-email"
        type="email"
        autoComplete="email"
        required
        error={fieldErrors.email}
      />
      <TextField
        label="Password"
        name="password"
        id="login-password"
        data-testid="login-password"
        type="password"
        autoComplete="current-password"
        required
        error={fieldErrors.password}
      />
      <button
        type="submit"
        data-testid="login-submit"
        disabled={pending}
        className={buttonClasses("primary", "lg", "w-full")}
      >
        {pending ? <Spinner className="size-4" /> : null}
        Sign in
      </button>
      <p className="text-center text-sm text-ink-600">
        New to DriveEasy?{" "}
        <Link
          href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}
          className="font-semibold text-brand-700 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    startTransition(async () => {
      setFormError(null);
      setFieldErrors({});
      const res = await signUp.email({ name, email, password });
      if (res.error) {
        const mapped = mapAuthError(res.error);
        if (mapped.field) setFieldErrors({ [mapped.field]: mapped.message });
        else setFormError(mapped.message);
        return;
      }
      router.push(safeNext(next));
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label="Create account">
      {formError ? (
        <Alert tone="error" data-testid="register-error">
          {formError}
        </Alert>
      ) : null}
      <TextField
        label="Full name"
        name="name"
        id="register-name"
        data-testid="register-name"
        autoComplete="name"
        required
        minLength={2}
        maxLength={100}
        error={fieldErrors.name}
      />
      <TextField
        label="Email"
        name="email"
        id="register-email"
        data-testid="register-email"
        type="email"
        autoComplete="email"
        required
        error={fieldErrors.email}
      />
      <TextField
        label="Password"
        name="password"
        id="register-password"
        data-testid="register-password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="At least 8 characters."
        error={fieldErrors.password}
      />
      <button
        type="submit"
        data-testid="register-submit"
        disabled={pending}
        className={buttonClasses("primary", "lg", "w-full")}
      >
        {pending ? <Spinner className="size-4" /> : null}
        Create account
      </button>
      <p className="text-center text-sm text-ink-600">
        Already have an account?{" "}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="font-semibold text-brand-700 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
