/**
 * Common utility types used throughout s3db.js
 */

/** Deep partial utility - makes all nested properties optional */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** Make specific keys optional */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Make specific keys required */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/** Extract string keys from a type */
export type StringKeys<T> = Extract<keyof T, string>;

/** Value that can be sync or async */
export type MaybeAsync<T> = T | Promise<T>;

/** Generic constructor type */
export type Constructor<T = object> = new (...args: unknown[]) => T;

/** JSON-serializable value */
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

/** JSON object type */
export type JSONObject = { [key: string]: JSONValue };

/** Log levels supported by the logger */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

/** Logger options */
export interface LoggerOptions {
  level?: LogLevel;
  pretty?: boolean;
  destination?: string;
}

/** Nullable type helper */
export type Nullable<T> = T | null;

/** Optional type helper */
export type Optional<T> = T | undefined;

/** Record with string keys */
export type StringRecord<T = unknown> = Record<string, T>;

/** Callback function type */
export type Callback<T = void> = (error: Error | null, result?: T) => void;

/** Async callback function type */
export type AsyncCallback<T = void> = () => Promise<T>;

/** Event handler type */
export type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

/** Disposable interface for cleanup */
export interface Disposable {
  dispose(): void | Promise<void>;
}

/** Result type for operations that can fail */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };
