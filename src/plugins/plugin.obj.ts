import type { Database } from '../database.class.js';

export interface PluginObjectInterface {
  setup(database: Database): void;
  start(): void;
  stop(): void;
}

export const PluginObject: PluginObjectInterface = {
  setup(_database: Database): void {
    // TODO: implement me!
  },

  start(): void {
    // TODO: implement me!
  },

  stop(): void {
    // TODO: implement me!
  },
};
