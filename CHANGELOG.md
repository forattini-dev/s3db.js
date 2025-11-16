# Changelog

## Unreleased

### Added
- Automatic OpenAPI tag inference for custom routes (plugin-level + resource-level). Swagger UI now groups routes like `/billing/*` or `/ops/*` under dedicated tags while falling back to **Custom Routes** only when no meaningful segment exists.
