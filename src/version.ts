const VERSION = '__INJECT_VERSION__';

let _version: string | null = null;

export function getVersion(): string {
  if (_version) return _version;
  if (VERSION !== '__INJECT_VERSION__') {
    _version = VERSION;
    return _version;
  }
  _version = '0.0.0-dev';
  return _version;
}
