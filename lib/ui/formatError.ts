export type FormattedError = {
  message: string;
  detail?: string;
};

type ErrorWithDetails = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  error_description?: unknown;
};

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

export function formatError(
  error: unknown,
  fallbackMessage = "Something went wrong. Please try again."
): FormattedError {
  if (!error) {
    return { message: fallbackMessage };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (error instanceof Error) {
    return { message: error.message || fallbackMessage };
  }

  if (typeof error === "object") {
    const maybeError = error as ErrorWithDetails;
    const message = asString(maybeError.message) ?? fallbackMessage;
    const detail =
      asString(maybeError.details) ??
      asString(maybeError.hint) ??
      asString(maybeError.error_description) ??
      undefined;
    return { message, detail };
  }

  return { message: fallbackMessage };
}
