/**
 * Error utility functions for safe error handling with unknown catch types.
 */

/**
 * Extract a human-readable message from an unknown error value.
 * Use in catch blocks: `catch (err: unknown) { log(toErrorMessage(err)); }`
 */
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}
