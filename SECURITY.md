# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 11.x.x  | :white_check_mark: |
| < 11.0  | :x:                |

## Known Security Advisories

### Development Dependencies

The following vulnerabilities exist in **development-only** dependencies and **do not affect** the published npm package or runtime security:

#### pkg (GHSA-22r3-9w55-cj54) - MODERATE
- **Status**: Acknowledged, monitored
- **Impact**: Local privilege escalation
- **Scope**: Only affects developers running `pnpm run build:binaries`
- **Mitigation**: pkg is deprecated and archived. No patched version available (`<0.0.0`).
- **Risk Assessment**: LOW - Only used for creating standalone binaries during release process
- **Future Plans**: Migrate to Node.js Single Executable Applications (SEA) when stable

#### tar-fs - HIGH
- **Status**: RESOLVED in v11.1.1+
- **Fix**: Updated to patched version 2.1.4+

## Reporting a Vulnerability

If you discover a security vulnerability in the **runtime code** (not dev dependencies), please report it by:

1. **DO NOT** open a public issue
2. Email: [security contact - update this]
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Depends on severity
  - Critical: 7 days
  - High: 14 days
  - Medium: 30 days
  - Low: 60 days

## Security Best Practices

### For Users

1. **Always encrypt sensitive data**: Use `secret` field type for passwords, tokens, etc.
2. **Validate credentials**: Never commit AWS credentials to version control
3. **Use IAM policies**: Implement least-privilege access for S3 buckets
4. **Enable paranoid mode**: For production, use `paranoid: true` for soft deletes
5. **Audit hooks**: Review serialized functions before deploying to production

### For Contributors

1. **No secrets in tests**: Use environment variables or LocalStack
2. **Validate input**: All user input should be validated before S3 operations
3. **Handle errors safely**: Never expose AWS error details to end users
4. **Review dependencies**: Run `pnpm audit` before submitting PRs
5. **Test encryption**: Verify `secret` fields are actually encrypted in S3

## Audit Configuration

This project uses `audit-level=high` in `.npmrc` to focus on critical vulnerabilities affecting production. Moderate/low severity issues in dev-only dependencies are monitored but may not block releases if:

- They only affect development tools
- No patch is available
- The risk is assessed as acceptable

Current audit threshold: **HIGH** (ignores moderate/low in dev dependencies)
