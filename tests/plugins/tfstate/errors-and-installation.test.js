import { describe, expect, test } from '@jest/globals';

import {
  TfStateError,
  InvalidStateFileError,
  UnsupportedStateVersionError,
  StateFileNotFoundError,
  ResourceExtractionError,
  StateDiffError,
  FileWatchError,
  ResourceFilterError,
} from '../../../src/plugins/tfstate/errors.js';
import { createPlugin } from './helpers.js';

describe('TfStatePlugin - Error Classes', () => {
  test('should create TfStateError with context', () => {
    const error = new TfStateError('Test error', { foo: 'bar' });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('TfStateError');
    expect(error.message).toBe('Test error');
    expect(error.context).toEqual({ foo: 'bar' });
  });

  test('should create InvalidStateFileError', () => {
    const error = new InvalidStateFileError('/path/to/state.tfstate', 'missing version field');
    expect(error).toBeInstanceOf(TfStateError);
    expect(error.name).toBe('InvalidStateFileError');
    expect(error.filePath).toBe('/path/to/state.tfstate');
    expect(error.reason).toBe('missing version field');
    expect(error.message).toContain('Invalid Tfstate file');
  });

  test('should create UnsupportedStateVersionError', () => {
    const error = new UnsupportedStateVersionError(5, [3, 4]);
    expect(error).toBeInstanceOf(TfStateError);
    expect(error.name).toBe('UnsupportedStateVersionError');
    expect(error.version).toBe(5);
    expect(error.supportedVersions).toEqual([3, 4]);
    expect(error.message).toContain('not supported');
  });

  test('should create StateFileNotFoundError', () => {
    const error = new StateFileNotFoundError('/missing/state.tfstate');
    expect(error).toBeInstanceOf(TfStateError);
    expect(error.name).toBe('StateFileNotFoundError');
    expect(error.filePath).toBe('/missing/state.tfstate');
  });

  test('should create ResourceExtractionError', () => {
    const originalError = new Error('Extraction failed');
    const error = new ResourceExtractionError('aws_instance.web', originalError);
    expect(error).toBeInstanceOf(TfStateError);
    expect(error.name).toBe('ResourceExtractionError');
    expect(error.resourceAddress).toBe('aws_instance.web');
    expect(error.originalError).toBe(originalError);
  });

  test('should create StateDiffError', () => {
    const originalError = new Error('Diff failed');
    const error = new StateDiffError(1, 2, originalError);
    expect(error).toBeInstanceOf(TfStateError);
    expect(error.name).toBe('StateDiffError');
    expect(error.oldSerial).toBe(1);
    expect(error.newSerial).toBe(2);
  });

  test('should create FileWatchError', () => {
    const originalError = new Error('Watch failed');
    const error = new FileWatchError('/path/to/watch', originalError);
    expect(error).toBeInstanceOf(TfStateError);
    expect(error.name).toBe('FileWatchError');
    expect(error.path).toBe('/path/to/watch');
  });

  test('should create ResourceFilterError', () => {
    const originalError = new Error('Filter failed');
    const error = new ResourceFilterError('aws_*', originalError);
    expect(error).toBeInstanceOf(TfStateError);
    expect(error.name).toBe('ResourceFilterError');
    expect(error.filterExpression).toBe('aws_*');
  });
});

describe('TfStatePlugin - Installation', () => {
  test('should create plugin with default configuration', () => {
    const plugin = createPlugin();
    expect(plugin.resourceName).toBe('plg_tfstate_resources');
    expect(plugin.stateFilesName).toBe('plg_tfstate_state_files');
    expect(plugin.diffsName).toBe('plg_tfstate_state_diffs');
    expect(plugin.trackDiffs).toBe(true);
    expect(plugin.autoSync).toBe(false);
    expect(plugin.verbose).toBe(false);
    expect(plugin.supportedVersions).toEqual([3, 4]);
  });

  test('should create plugin with custom configuration', () => {
    const plugin = createPlugin({
      driver: 's3',
      resources: {
        resources: 'custom_resources',
        stateFiles: 'custom_states',
        diffs: 'custom_history',
      },
      diffs: {
        enabled: false,
      },
      autoSync: true,
      verbose: true,
      filters: {
        types: ['aws_instance'],
        exclude: ['data.*'],
      },
    });

    expect(plugin.resourceName).toBe('custom_resources');
    expect(plugin.stateFilesName).toBe('custom_states');
    expect(plugin.diffsName).toBe('custom_history');
    expect(plugin.trackDiffs).toBe(false);
    expect(plugin.autoSync).toBe(true);
    expect(plugin.verbose).toBe(true);
    expect(plugin.filters.types).toEqual(['aws_instance']);
    expect(plugin.filters.exclude).toEqual(['data.*']);
  });
});
