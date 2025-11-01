import { PluginError } from '../../errors.js';

/**
 * TfStatePlugin Error Classes
 * Custom errors for Terraform/OpenTofu state operations
 */

/**
 * Base error for all Terraform/OpenTofu state operations
 */
export class TfStateError extends PluginError {
  constructor(message, context = {}) {
    const merged = {
      pluginName: context.pluginName || 'TfStatePlugin',
      operation: context.operation || 'unknown',
      statusCode: context.statusCode ?? 500,
      retriable: context.retriable ?? false,
      suggestion: context.suggestion ?? 'Verify Terraform/OpenTofu configuration and state storage before retrying.',
      ...context
    };
    super(message, merged);
    this.name = 'TfStateError';
    this.context = context;
  }
}

/**
 * Thrown when state file is invalid or corrupted
 */
export class InvalidStateFileError extends TfStateError {
  constructor(filePath, reason, context = {}) {
    super(`Invalid Tfstate file "${filePath}": ${reason}`, {
      statusCode: context.statusCode ?? 422,
      retriable: false,
      suggestion: context.suggestion ?? 'Validate Terraform state integrity or re-run terraform state pull.',
      filePath,
      reason,
      ...context
    });
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
      `Tfstate version ${version} is not supported. Supported versions: ${supportedVersions.join(', ')}`,
      {
        statusCode: context.statusCode ?? 400,
        retriable: false,
        suggestion: context.suggestion ?? `Upgrade/downgrade Terraform state to one of the supported versions: ${supportedVersions.join(', ')}.`,
        version,
        supportedVersions,
        ...context
      }
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
    super(`Tfstate file not found: ${filePath}`, {
      statusCode: context.statusCode ?? 404,
      retriable: false,
      suggestion: context.suggestion ?? 'Ensure the state file exists at the configured path/bucket.',
      filePath,
      ...context
    });
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
      {
        retriable: context.retriable ?? false,
        suggestion: context.suggestion ?? 'Check resource address and state structure; rerun extraction after fixing the state.',
        resourceAddress,
        originalError,
        ...context
      }
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
      {
        retriable: context.retriable ?? true,
        suggestion: context.suggestion ?? 'Refresh the latest state snapshots and retry the diff operation.',
        oldSerial,
        newSerial,
        originalError,
        ...context
      }
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
    super(`Failed to watch path "${path}": ${originalError.message}`, {
      retriable: context.retriable ?? true,
      suggestion: context.suggestion ?? 'Verify filesystem permissions and that the watch path exists.',
      path,
      originalError,
      ...context
    });
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
      {
        statusCode: context.statusCode ?? 400,
        retriable: context.retriable ?? false,
        suggestion: context.suggestion ?? 'Validate the filter expression syntax and ensure referenced resources exist.',
        filterExpression,
        originalError,
        ...context
      }
    );
    this.name = 'ResourceFilterError';
    this.filterExpression = filterExpression;
    this.originalError = originalError;
  }
}
