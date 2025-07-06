export const PluginObject = {
  database: null,
  isStarted: false,
  isSetup: false,
  options: {},

  setup(database) {
    this.database = database;
    this.isSetup = true;
    
    // Basic setup for object-based plugins
    console.log(`Plugin object setup for database: ${database.constructor.name}`);
    
    // Emit event if the database supports it
    if (database.emit) {
      database.emit("plugin.setup", { plugin: "PluginObject", database: database.constructor.name });
    }
    
    return this;
  },

  start() {
    if (!this.isSetup) {
      throw new Error("Plugin must be setup before starting");
    }
    
    this.isStarted = true;
    
    // Basic start for object-based plugins
    console.log("Plugin object started");
    
    // Emit event if the database supports it
    if (this.database && this.database.emit) {
      this.database.emit("plugin.start", { plugin: "PluginObject" });
    }
    
    return this;
  },

  stop() {
    if (!this.isStarted) {
      return this; // Already stopped or never started
    }
    
    this.isStarted = false;
    
    // Basic stop for object-based plugins
    console.log("Plugin object stopped");
    
    // Emit event if the database supports it
    if (this.database && this.database.emit) {
      this.database.emit("plugin.stop", { plugin: "PluginObject" });
    }
    
    return this;
  },
}