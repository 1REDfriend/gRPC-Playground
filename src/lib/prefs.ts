// localStorage can throw in private windows or sandboxed previews; every access is guarded.
const PREFIX = 'grpc-playground:';

export function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // Preference is a convenience only; ignore storage failures.
  }
}
