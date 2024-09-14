import EventEmitter from "events";

export class Plugin extends EventEmitter {
  async setup(database) {
    // TODO: implement me!
  }

  async start() {
    // TODO: implement me!
  }

  async stop() {
    // TODO: implement me!
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