/**
 * TfStatePlugin Error Classes
 * Custom errors for Terraform/OpenTofu state operations
 */

/**
 * Base error for all Terraform/OpenTofu state operations
 */
export class TfStateError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'TfStateError';
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when state file is invalid or corrupted
 */
export class InvalidStateFileError extends TfStateError {
  constructor(filePath, reason, context = {}) {
    super(`Invalid Terraform state file "${filePath}": ${reason}`, context);
    this.name = 'InvalidStateFileError';
    this.filePath = filePath;
    this.reason = reason;
  }
}

/**
 * Thrown when state file version is not supported
 */
export class UnsupportedStateVersionError extends TfStateError {
  constructor(version, supportedVersions, context = {}) {
    super(
      `Terraform state version ${version} is not supported. Supported versions: ${supportedVersions.join(', ')}`,
      context
    );
    this.name = 'UnsupportedStateVersionError';
    this.version = version;
    this.supportedVersions = supportedVersions;
  }
}

/**
 * Thrown when state file cannot be read
 */
export class StateFileNotFoundError extends TfStateError {
  constructor(filePath, context = {}) {
    super(`Terraform state file not found: ${filePath}`, context);
    this.name = 'StateFileNotFoundError';
    this.filePath = filePath;
  }
}

/**
 * Thrown when resource extraction fails
 */
export class ResourceExtractionError extends TfStateError {
  constructor(resourceAddress, originalError, context = {}) {
    super(
      `Failed to extract resource "${resourceAddress}": ${originalError.message}`,
      context
    );
    this.name = 'ResourceExtractionError';
    this.resourceAddress = resourceAddress;
    this.originalError = originalError;
  }
}

/**
 * Thrown when state diff calculation fails
 */
export class StateDiffError extends TfStateError {
  constructor(oldSerial, newSerial, originalError, context = {}) {
    super(
      `Failed to calculate diff between state serials ${oldSerial} and ${newSerial}: ${originalError.message}`,
      context
    );
    this.name = 'StateDiffError';
    this.oldSerial = oldSerial;
    this.newSerial = newSerial;
    this.originalError = originalError;
  }
}

/**
 * Thrown when file watching setup fails
 */
export class FileWatchError extends TfStateError {
  constructor(path, originalError, context = {}) {
    super(`Failed to watch path "${path}": ${originalError.message}`, context);
    this.name = 'FileWatchError';
    this.path = path;
    this.originalError = originalError;
  }
}

/**
 * Thrown when resource filtering fails
 */
export class ResourceFilterError extends TfStateError {
  constructor(filterExpression, originalError, context = {}) {
    super(
      `Failed to apply resource filter "${filterExpression}": ${originalError.message}`,
      context
    );
    this.name = 'ResourceFilterError';
    this.filterExpression = filterExpression;
    this.originalError = originalError;
  }
}
