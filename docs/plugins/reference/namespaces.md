# 📘 Plugin Namespace API Reference

> **What this reference covers:** the shared namespace helpers used by plugins to implement multi-instance isolation consistently.

**Main:** [← Plugin System](/plugins/README.md) | **Related:** [Architecture](/plugins/guides/architecture.md)

---

## Overview

Plugins that support namespaces should all behave the same way:

1. validate namespace format
2. detect existing namespaces
3. warn which namespace is active
4. generate consistent namespaced resources
5. keep storage paths isolated

## Rules

Namespaces must:

- contain only alphanumeric characters, hyphens, or underscores
- be between 1 and 50 characters
- avoid spaces and special characters

## API

### `listPluginNamespaces(storage, pluginPrefix)`

Lists existing namespaces for a plugin by scanning storage.

### `warnNamespaceUsage(pluginName, currentNamespace, existingNamespaces)`

Emits consistent warnings showing what already exists and which namespace this instance will use.

### `detectAndWarnNamespaces(storage, pluginName, pluginPrefix, currentNamespace)`

Runs the full detection flow and returns the namespaces found.

### `getNamespacedResourceName(baseResourceName, namespace, pluginPrefix)`

Generates resource names consistently.

### `validateNamespace(namespace)`

Validates a raw namespace string and throws on invalid input.

### `getValidatedNamespace(config, defaultNamespace = 'default')`

Reads `config.namespace`, validates it, and falls back to a default namespace.

## Author Checklist

- validate namespace in the constructor
- run detection/warning during install or initialize
- namespace all generated resources
- namespace plugin-owned storage paths
- document namespace behavior in the plugin README
- test storage and resource isolation
