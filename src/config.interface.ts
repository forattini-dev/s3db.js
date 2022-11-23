import PluginInterface from "./plugin.interface";

export default interface ConfigInterface {
  uri: string;
  parallelism?: number;
  plugins?: PluginInterface[];
  passphrase?: string | undefined;
}
