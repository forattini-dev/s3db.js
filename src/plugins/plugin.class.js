import EventEmitter from "events";

export class Plugin extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.database = null;
    this.isStarted = false;
    this.isSetup = false;
  }

  async setup(database) {
    this.beforeSetup();
    
    this.database = database;
    this.isSetup = true;
    
    // Basic setup - can be overridden in subclasses
    this.emit("plugin.setup", { plugin: this.constructor.name, database: database.constructor.name });
    
    this.afterSetup();
  }

  async start() {
    if (!this.isSetup) {
      throw new Error("Plugin must be setup before starting");
    }

    this.beforeStart();
    
    this.isStarted = true;
    
    // Basic start - can be overridden in subclasses
    this.emit("plugin.start", { plugin: this.constructor.name });
    
    this.afterStart();
  }

  async stop() {
    if (!this.isStarted) {
      return; // Already stopped or never started
    }

    this.beforeStop();
    
    this.isStarted = false;
    
    // Basic stop - can be overridden in subclasses
    this.emit("plugin.stop", { plugin: this.constructor.name });
    
    this.afterStop();
  }

  beforeSetup() {
    this.emit("plugin.beforeSetup", new Date());
  }

  afterSetup() {
    this.emit("plugin.afterSetup", new Date());
  }

  beforeStart() {
    this.emit("plugin.beforeStart", new Date());
  }

  afterStart() {
    this.emit("plugin.afterStart", new Date());
  }

  beforeStop() {
    this.emit("plugin.beforeStop", new Date());
  }

  afterStop() {
    this.emit("plugin.afterStop", new Date());
  }
}

export default Plugin