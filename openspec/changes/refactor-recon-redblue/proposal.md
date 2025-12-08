# Change: Refactor Recon Plugin to Use RedBlue

## Why

The current Recon plugin depends on ~30 external binaries (nmap, amass, subfinder, nikto, whatweb, etc.) which creates significant operational complexity:
- Users must install and maintain multiple tools
- Different tools have incompatible output formats
- Version mismatches cause unpredictable behavior
- Many tools are abandoned or poorly maintained
- Cross-platform support is inconsistent

RedBlue (`~/Work/ff/redblue`) is a single Rust binary that implements all these capabilities natively with zero external dependencies, unified output format, and better performance.

## What Changes

- **BREAKING**: Remove all external binary dependencies from recon stages
- **BREAKING**: Simplify DependencyManager to only check for `rb` binary
- Refactor all 18 stages to use RedBlue CLI commands
- Update CommandRunner to parse RedBlue's unified output format
- Remove tool-specific parsing logic from each stage
- Consolidate `_individual` output format (no more per-tool breakdown)
- Update configuration schema to match RedBlue's flag structure

## Impact

- Affected specs: `recon-plugin` (new capability spec)
- Affected code:
  - `src/plugins/recon/stages/*.js` (all 18 stages)
  - `src/plugins/recon/managers/dependency-manager.js`
  - `src/plugins/recon/concerns/command-runner.js`
  - `src/plugins/recon/config/defaults.js`
- Breaking changes:
  - Configuration keys change (e.g., `subdomains.amass` → `subdomains.enabled`)
  - Output format changes (no more `_individual` per-tool breakdown)
  - Users must install RedBlue instead of individual tools

## Migration

1. Users install RedBlue: `cargo install redblue` or download binary
2. Remove old tools (optional, no conflict)
3. Update config to new schema (documented migration guide)
4. Existing reports remain compatible (read-only)

## RedBlue Command Mapping

| Stage | Current Tools | RedBlue Command |
|-------|---------------|-----------------|
| DNS | dig, nslookup | `rb dns record all <target>` |
| Subdomains | amass, subfinder, assetfinder, crt.sh | `rb recon domain subdomains <target>` |
| Ports | nmap, masscan | `rb scan ports <target>` |
| Whois | whois CLI | `rb recon domain whois <target>` |
| HTTP | curl | `rb web asset get <url>` |
| Fingerprint | whatweb | `rb web asset fingerprint <url>` |
| TLS Audit | openssl, sslyze, testssl.sh | `rb web asset cert <url>` |
| Web Discovery | ffuf, feroxbuster, gobuster | `rb web asset fuzz <url>` |
| Vulnerability | nikto, wpscan, droopescan | `rb web asset scan <url>` |
| OSINT | theHarvester, sherlock | `rb recon domain harvest <target>` |
| Latency | ping, mtr | `rb network host ping <target>` |
| ASN | dig + APIs | `rb network host intel <ip>` |
| Certificate | openssl + CT APIs | `rb web asset cert <url>` |
| DNSDumpster | web scraping | `rb recon domain subdomains <target>` (CT logs) |
| MassDNS | massdns + wordlist | `rb dns record bruteforce <target>` |
| Google Dorks | DuckDuckGo scraping | `rb recon domain urls <target>` |
| Screenshot | aquatone, EyeWitness | (future: `rb web asset screenshot`) |
| Secrets | gitleaks | (future: `rb recon repo secrets`) |
