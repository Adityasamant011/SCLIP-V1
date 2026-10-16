/** Python launch helpers for immutable app resources. */
export function pythonArgsWithoutBytecode(args: readonly string[]): string[] {
  return ['-B', ...args]
}

export function pythonEnvWithoutBytecode(env: Record<string, string | undefined>): Record<string, string | undefined> {
  return { ...env, PYTHONDONTWRITEBYTECODE: '1' }
}
