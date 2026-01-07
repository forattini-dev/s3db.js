import { isEmpty, isFunction } from 'lodash-es';
import { TasksPool } from '../tasks/tasks-pool.class.js';
import { DatabaseError } from '../errors.js';
import type { DatabaseRef, Plugin, PluginConstructor, MemorySnapshot } from './types.js';
import type { DatabaseCoordinators } from './database-coordinators.class.js';

export class DatabasePlugins {
  constructor(
    private database: DatabaseRef,
    private coordinators: DatabaseCoordinators
  ) {}

  async startPlugins(): Promise<void> {
    const db = this.database;

    if (!isEmpty(db.pluginList)) {
      const plugins: Plugin[] = [];
      for (const p of db.pluginList) {
        try {
          const plugin = isFunction(p) ? new (p as new (db: DatabaseRef) => Plugin)(db) : p;
          plugins.push(plugin as Plugin);
        } catch (error) {
          const pluginName = (p as any).name || (p as any).constructor?.name || 'Unknown';
          throw new DatabaseError(`Failed to instantiate plugin '${pluginName}': ${(error as Error).message}`, {
            operation: 'startPlugins.instantiate',
            pluginName,
            original: error
          });
        }
      }

      const concurrency = Math.max(1, Number.isFinite(db.executorPool?.concurrency) ? db.executorPool.concurrency! : 5);

      const installResult = await TasksPool.map(
        plugins,
        async (plugin) => {
          const pluginName = this._getPluginName(plugin);

          if (typeof plugin.setInstanceName === 'function') {
            plugin.setInstanceName(pluginName);
          } else {
            plugin.instanceName = pluginName;
          }

          await plugin.install(db);

          db.emit('db:plugin:metrics', {
            stage: 'install',
            plugin: pluginName,
            ...this.coordinators.collectMemorySnapshot()
          });

          db.pluginRegistry[pluginName] = plugin;
          return pluginName;
        },
        { concurrency }
      );

      if (installResult.errors.length > 0) {
        const errorInfo = installResult.errors[0]!;
        const failedPlugin = errorInfo.item;
        const error = errorInfo.error;
        const failedName = this._getPluginName(failedPlugin);
        throw new DatabaseError(`Failed to install plugin '${failedName}': ${error?.message || error}`, {
          operation: 'startPlugins.install',
          pluginName: failedName,
          original: error
        });
      }

      const startResult = await TasksPool.map(
        plugins,
        async (plugin) => {
          const pluginName = this._getPluginName(plugin);
          await plugin.start();
          db.emit('db:plugin:metrics', {
            stage: 'start',
            plugin: pluginName,
            ...this.coordinators.collectMemorySnapshot()
          });
          return plugin;
        },
        { concurrency }
      );

      if (startResult.errors.length > 0) {
        const errorInfo = startResult.errors[0]!;
        const failedPlugin = errorInfo.item;
        const error = errorInfo.error;
        const failedName = this._getPluginName(failedPlugin);
        throw new DatabaseError(`Failed to start plugin '${failedName}': ${error?.message || error}`, {
          operation: 'startPlugins.start',
          pluginName: failedName,
          original: error
        });
      }
    }
  }

  async usePlugin(plugin: Plugin, name: string | null = null): Promise<Plugin> {
    const db = this.database;
    const pluginName = this._getPluginName(plugin, name);

    if (typeof plugin.setInstanceName === 'function') {
      plugin.setInstanceName(pluginName);
    } else {
      plugin.instanceName = pluginName;
    }

    if (!plugin.processManager) {
      plugin.processManager = db.processManager;
    }

    if (!plugin.cronManager) {
      plugin.cronManager = db.cronManager;
    }

    if (!plugin.logger && db.logger) {
      plugin.logger = db.getChildLogger(`Plugin:${pluginName}`, { plugin: pluginName });
    }

    db.plugins[pluginName] = plugin;

    if (db.isConnected()) {
      await plugin.install(db);
      await plugin.start();
    }

    return plugin;
  }

  async uninstallPlugin(name: string, options: { purgeData?: boolean } = {}): Promise<void> {
    const db = this.database;
    const pluginName = name.toLowerCase().replace('plugin', '');
    const plugin = db.plugins[pluginName] || db.pluginRegistry[pluginName];

    if (!plugin) {
      throw new DatabaseError(`Plugin '${name}' not found`, {
        operation: 'uninstallPlugin',
        pluginName: name,
        availablePlugins: Object.keys(db.pluginRegistry),
        suggestion: 'Check plugin name or list available plugins using Object.keys(db.pluginRegistry)'
      });
    }

    if (plugin.stop) {
      await plugin.stop();
    }

    if (plugin.uninstall) {
      await plugin.uninstall(options);
    }

    delete db.plugins[pluginName];
    delete db.pluginRegistry[pluginName];

    const index = db.pluginList.indexOf(plugin as PluginConstructor);
    if (index > -1) {
      db.pluginList.splice(index, 1);
    }

    db.emit('db:plugin:uninstalled', { name: pluginName, plugin });
  }

  private _getPluginName(plugin: Plugin, customName: string | null = null): string {
    return customName || plugin.constructor.name.replace('Plugin', '').toLowerCase();
  }
}
