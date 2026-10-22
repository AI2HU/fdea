export type FdeaError =
  | {
      readonly tag: "invalid_input";
      readonly message: string;
      readonly issues?: readonly string[];
    }
  | { readonly tag: "project_not_found"; readonly message: string }
  | { readonly tag: "source_not_found"; readonly message: string }
  | { readonly tag: "source_unreadable"; readonly message: string }
  | { readonly tag: "unsupported_source_type"; readonly message: string }
  | {
      readonly tag: "invalid_opportunity_map";
      readonly message: string;
      readonly issues: readonly string[];
    }
  | {
      readonly tag: "invalid_process_model";
      readonly message: string;
      readonly issues: readonly string[];
    }
  | {
      readonly tag: "not_ready";
      readonly message: string;
      readonly blockers: readonly string[];
    }
  | { readonly tag: "output_not_empty"; readonly message: string }
  | { readonly tag: "toolchain_unsupported"; readonly message: string }
  | {
      readonly tag: "generation_failed";
      readonly message: string;
      readonly step: string;
      readonly output?: string;
    }
  | { readonly tag: "storage_failure"; readonly message: string };

export type Result<T, E = FdeaError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E extends FdeaError>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

export const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);
