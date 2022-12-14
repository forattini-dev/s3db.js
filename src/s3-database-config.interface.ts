import PluginInterface from "./plugins/plugin.interface";

export interface S3dbConfigInterface {
  uri: string;
  cache?: boolean;
  parallelism?: number;
  plugins?: PluginInterface[];
  passphrase?: string | undefined;
}

export default S3dbConfigInterface
