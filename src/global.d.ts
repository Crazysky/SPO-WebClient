/**
 * Global type declarations for test environment
 */

declare global {
  namespace jest {
    interface Matchers<R> {
      toContainRdoCommand(method: string, args?: string[]): R;
      toMatchRdoFormat(): R;
      toMatchRdoCallFormat(method: string): R;
      toMatchRdoSetFormat(property: string): R;
      toHaveRdoTypePrefix(prefix: string): R;
      toMatchRdoResponse(requestId?: number): R;
    }
  }
}

export {};
