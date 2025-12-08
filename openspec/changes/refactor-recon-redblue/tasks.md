# Tasks: Refactor Recon Plugin to Use RedBlue

## 1. Core Infrastructure

- [ ] 1.1 Update CommandRunner to handle RedBlue JSON output
  - File: `src/plugins/recon/concerns/command-runner.js`
  - Add `runRedBlue(domain, resource, verb, target, flags)` method
  - Parse JSON output with error handling
  - Map exit codes to status enum

- [ ] 1.2 Simplify DependencyManager
  - File: `src/plugins/recon/managers/dependency-manager.js`
  - Remove 53-tool mapping
  - Single `rb` binary check
  - Update install guide message

- [ ] 1.3 Update configuration schema
  - File: `src/plugins/recon/config/defaults.js`
  - Flatten tool-specific options to capability-focused
  - Add RedBlue-specific flags (threads, timeout, etc.)
  - Document new schema

## 2. Stage Refactoring - Network Layer

- [ ] 2.1 Refactor DNS Stage
  - File: `src/plugins/recon/stages/dns-stage.js`
  - Replace: `dig`, `nslookup`
  - Command: `rb dns record all <target> --json`
  - Parse: A, AAAA, MX, NS, TXT, CNAME, SOA records

- [ ] 2.2 Refactor Latency Stage
  - File: `src/plugins/recon/stages/latency-stage.js`
  - Replace: `ping`, `mtr`
  - Command: `rb network host ping <target> --count 10 --json`
  - Parse: RTT stats, packet loss

- [ ] 2.3 Refactor Ports Stage
  - File: `src/plugins/recon/stages/ports-stage.js`
  - Replace: `nmap`, `masscan`
  - Command: `rb scan ports <target> --json`
  - Parse: Open ports, services, banners

- [ ] 2.4 Refactor ASN Stage
  - File: `src/plugins/recon/stages/asn-stage.js`
  - Replace: `dig` + iptoasn/hackertarget APIs
  - Command: `rb network host intel <ip> --json`
  - Parse: ASN, organization, CIDR, geolocation

## 3. Stage Refactoring - Domain Reconnaissance

- [ ] 3.1 Refactor Subdomains Stage
  - File: `src/plugins/recon/stages/subdomains-stage.js`
  - Replace: `amass`, `subfinder`, `assetfinder`, crt.sh API
  - Command: `rb recon domain subdomains <target> --threads 20 --json`
  - Parse: Subdomain list, sources, takeover detection

- [ ] 3.2 Refactor Whois Stage
  - File: `src/plugins/recon/stages/whois-stage.js`
  - Replace: `whois` CLI + APIs
  - Command: `rb recon domain whois <target> --json`
  - Parse: Registrar, dates, nameservers, contacts

- [ ] 3.3 Refactor DNSDumpster Stage (merge into Subdomains)
  - File: `src/plugins/recon/stages/dnsdumpster-stage.js`
  - Mark as deprecated, functionality merged into subdomains-stage
  - Keep file for backward compat, delegate to subdomains

- [ ] 3.4 Refactor MassDNS Stage
  - File: `src/plugins/recon/stages/massdns-stage.js`
  - Replace: `massdns` + wordlist
  - Command: `rb dns record bruteforce <target> --wordlist <path> --json`
  - Parse: Resolved subdomains

- [ ] 3.5 Refactor Google Dorks Stage
  - File: `src/plugins/recon/stages/google-dorks-stage.js`
  - Replace: DuckDuckGo scraping
  - Command: `rb recon domain urls <target> --json`
  - Parse: Historical URLs, interesting paths

## 4. Stage Refactoring - Web Layer

- [ ] 4.1 Refactor HTTP Stage
  - File: `src/plugins/recon/stages/http-stage.js`
  - Replace: `curl`
  - Command: `rb web asset get <url> --json`
  - Parse: Status, headers, redirects, timing

- [ ] 4.2 Refactor Certificate Stage
  - File: `src/plugins/recon/stages/certificate-stage.js`
  - Replace: `openssl` + CT APIs
  - Command: `rb web asset cert <url> --json`
  - Parse: Cert chain, validity, SANs, issuer

- [ ] 4.3 Refactor TLS Audit Stage (merge into Certificate)
  - File: `src/plugins/recon/stages/tls-audit-stage.js`
  - Replace: `openssl`, `sslyze`, `testssl.sh`, `sslscan`
  - Command: `rb web asset cert <url> --audit --json`
  - Parse: Protocols, ciphers, vulnerabilities

- [ ] 4.4 Refactor Fingerprint Stage
  - File: `src/plugins/recon/stages/fingerprint-stage.js`
  - Replace: `whatweb`
  - Command: `rb web asset fingerprint <url> --json`
  - Parse: Technologies, versions, frameworks

- [ ] 4.5 Refactor Web Discovery Stage
  - File: `src/plugins/recon/stages/web-discovery-stage.js`
  - Replace: `ffuf`, `feroxbuster`, `gobuster`
  - Command: `rb web asset fuzz <url> --wordlist <path> --json`
  - Parse: Discovered paths, status codes, sizes

- [ ] 4.6 Refactor Vulnerability Stage
  - File: `src/plugins/recon/stages/vulnerability-stage.js`
  - Replace: `nikto`, `wpscan`, `droopescan`
  - Command: `rb web asset scan <url> --json`
  - Parse: Vulnerabilities, CVEs, risk scores

## 5. Stage Refactoring - OSINT Layer

- [ ] 5.1 Refactor OSINT Stage
  - File: `src/plugins/recon/stages/osint-stage.js`
  - Replace: `theHarvester`, `sherlock`, `maigret`
  - Command: `rb recon domain harvest <target> --json`
  - Parse: Emails, usernames, related domains

## 6. Unavailable Stages

- [ ] 6.1 Update Screenshot Stage
  - File: `src/plugins/recon/stages/screenshot-stage.js`
  - Mark as `unavailable` (RedBlue doesn't support yet)
  - Return: `{ status: 'unavailable', reason: 'Pending RedBlue support' }`
  - Track: RedBlue issue for screenshot feature

- [ ] 6.2 Update Secrets Stage
  - File: `src/plugins/recon/stages/secrets-stage.js`
  - Mark as `unavailable` (no gitleaks equivalent)
  - Return: `{ status: 'unavailable', reason: 'Pending RedBlue support' }`
  - Track: RedBlue issue for secrets scanning

## 7. Integration & Testing

- [ ] 7.1 Update main ReconPlugin orchestration
  - File: `src/plugins/recon/index.js`
  - Remove per-tool feature flags
  - Update stage initialization
  - Simplify scan() method

- [ ] 7.2 Update StorageManager for new output format
  - File: `src/plugins/recon/managers/storage-manager.js`
  - Remove `_individual` handling
  - Update artifact paths

- [ ] 7.3 Update FingerprintBuilder
  - File: `src/plugins/recon/concerns/fingerprint-builder.js`
  - Adapt to new output format
  - Simplify consolidation logic

- [ ] 7.4 Create integration tests
  - File: `tests/plugins/recon/redblue-integration.test.js`
  - Mock RedBlue CLI output
  - Test each stage with expected JSON
  - Test error handling

- [ ] 7.5 Update existing unit tests
  - Files: `tests/plugins/recon/stages/*.test.js`
  - Remove tool-specific mocks
  - Add RedBlue output mocks

## 8. Documentation & Migration

- [ ] 8.1 Update README with new requirements
  - Document RedBlue installation
  - Update configuration examples
  - Add troubleshooting section

- [ ] 8.2 Create migration guide
  - Document config schema changes
  - Provide before/after examples
  - Script for config migration

- [ ] 8.3 Update CLAUDE.md
  - File: `CLAUDE.md`
  - Add RedBlue command reference
  - Update stage documentation

## 9. Cleanup

- [ ] 9.1 Remove legacy tool-specific code
  - Remove unused parsing functions
  - Clean up imports
  - Remove dead configuration options

- [ ] 9.2 Archive legacy stage implementations
  - Move to `stages/_legacy/` (optional, for rollback)
  - Add deprecation notices
