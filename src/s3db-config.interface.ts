import PluginInterface from "./plugin.interface";

export default interface S3dbConfigInterface {
  uri: string;
  cache?: boolean;
  parallelism?: number;
  plugins?: PluginInterface[];
  passphrase?: string | undefined;
}
