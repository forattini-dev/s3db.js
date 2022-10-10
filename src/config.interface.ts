import LoggerInterface from "./logger.interface";

export default interface ConfigInterface {
  uri: string;
  logger?: LoggerInterface;
}
