# Recon Plugin Specification

## ADDED Requirements

### Requirement: RedBlue Backend Integration

The Recon plugin SHALL use RedBlue (`rb` binary) as the sole backend for all reconnaissance operations, eliminating dependencies on external security tools.

#### Scenario: RedBlue availability check
- **WHEN** the plugin initializes
- **THEN** it SHALL verify that the `rb` binary is available in PATH
- **AND** emit `recon:dependency-missing` event if not found

#### Scenario: Unified command execution
- **WHEN** a stage executes a reconnaissance task
- **THEN** it SHALL invoke RedBlue using the pattern `rb [domain] [resource] [verb] [target] [flags]`
- **AND** parse the JSON output into a standardized result object

#### Scenario: Error handling
- **WHEN** RedBlue returns a non-zero exit code
- **THEN** the stage SHALL return `{ status: 'error', error: <stderr content> }`
- **AND** log the failure for debugging

### Requirement: Subdomain Enumeration

The plugin SHALL discover subdomains using RedBlue's multi-source enumeration capabilities.

#### Scenario: Subdomain discovery
- **WHEN** `subdomains` stage executes for a target domain
- **THEN** it SHALL run `rb recon domain subdomains <target> --json`
- **AND** return deduplicated subdomain list with source metadata

#### Scenario: Recursive enumeration
- **WHEN** `recursive: true` is configured
- **THEN** it SHALL pass `--recursive` flag to enable deep enumeration

#### Scenario: Subdomain takeover detection
- **WHEN** subdomains are discovered
- **THEN** it SHALL check for dangling CNAME records indicating takeover vulnerability

### Requirement: DNS Resolution

The plugin SHALL perform comprehensive DNS lookups using RedBlue's native DNS implementation.

#### Scenario: All record types
- **WHEN** `dns` stage executes
- **THEN** it SHALL run `rb dns record all <target> --json`
- **AND** return A, AAAA, MX, NS, TXT, CNAME, SOA records

#### Scenario: DNS bruteforce
- **WHEN** `massdns` stage executes with a wordlist
- **THEN** it SHALL run `rb dns record bruteforce <target> --wordlist <path> --json`
- **AND** return resolved subdomains from wordlist

### Requirement: Port Scanning

The plugin SHALL discover open ports and services using RedBlue's port scanner.

#### Scenario: Port discovery
- **WHEN** `ports` stage executes
- **THEN** it SHALL run `rb scan ports <target> --json`
- **AND** return open ports with service detection and banners

#### Scenario: Custom port range
- **WHEN** specific ports are configured
- **THEN** it SHALL pass `--ports <range>` flag

### Requirement: Web Fingerprinting

The plugin SHALL identify web technologies using RedBlue's fingerprinting module.

#### Scenario: Technology detection
- **WHEN** `fingerprint` stage executes for a URL
- **THEN** it SHALL run `rb web asset fingerprint <url> --json`
- **AND** return detected technologies, versions, and frameworks

#### Scenario: HTTP headers analysis
- **WHEN** fingerprinting executes
- **THEN** it SHALL analyze response headers for technology hints

### Requirement: TLS/Certificate Analysis

The plugin SHALL analyze TLS configuration and certificates using RedBlue.

#### Scenario: Certificate inspection
- **WHEN** `certificate` stage executes
- **THEN** it SHALL run `rb web asset cert <url> --json`
- **AND** return certificate chain, validity, SANs, and issuer

#### Scenario: TLS security audit
- **WHEN** `tlsAudit` stage executes
- **THEN** it SHALL run `rb web asset cert <url> --audit --json`
- **AND** return protocol versions, cipher suites, and vulnerabilities

### Requirement: Web Content Discovery

The plugin SHALL discover web paths and directories using RedBlue's fuzzer.

#### Scenario: Directory fuzzing
- **WHEN** `webDiscovery` stage executes
- **THEN** it SHALL run `rb web asset fuzz <url> --json`
- **AND** return discovered paths with status codes and sizes

#### Scenario: Recursive fuzzing
- **WHEN** `recursive: true` is configured
- **THEN** it SHALL pass `--recursive --depth <n>` flags

### Requirement: Vulnerability Scanning

The plugin SHALL detect web vulnerabilities using RedBlue's scanner.

#### Scenario: Vulnerability detection
- **WHEN** `vulnerability` stage executes
- **THEN** it SHALL run `rb web asset scan <url> --json`
- **AND** return detected vulnerabilities with CVEs and risk scores

### Requirement: WHOIS Lookup

The plugin SHALL retrieve domain registration information using RedBlue.

#### Scenario: WHOIS query
- **WHEN** `whois` stage executes
- **THEN** it SHALL run `rb recon domain whois <target> --json`
- **AND** return registrar, dates, nameservers, and contacts

### Requirement: Network Intelligence

The plugin SHALL gather IP and ASN information using RedBlue.

#### Scenario: ASN lookup
- **WHEN** `asn` stage executes
- **THEN** it SHALL run `rb network host intel <ip> --json`
- **AND** return ASN, organization, CIDR, and geolocation

#### Scenario: Latency measurement
- **WHEN** `latency` stage executes
- **THEN** it SHALL run `rb network host ping <target> --json`
- **AND** return RTT statistics and packet loss

### Requirement: OSINT Harvesting

The plugin SHALL collect OSINT data using RedBlue's harvester.

#### Scenario: Email and username discovery
- **WHEN** `osint` stage executes
- **THEN** it SHALL run `rb recon domain harvest <target> --json`
- **AND** return discovered emails, usernames, and related domains

#### Scenario: URL harvesting
- **WHEN** `googleDorks` stage executes
- **THEN** it SHALL run `rb recon domain urls <target> --json`
- **AND** return historical URLs from archives

### Requirement: Unavailable Stage Handling

The plugin SHALL gracefully handle stages not yet supported by RedBlue.

#### Scenario: Screenshot stage unavailable
- **WHEN** `screenshot` stage is invoked
- **THEN** it SHALL return `{ status: 'unavailable', reason: 'Pending RedBlue support' }`

#### Scenario: Secrets stage unavailable
- **WHEN** `secrets` stage is invoked
- **THEN** it SHALL return `{ status: 'unavailable', reason: 'Pending RedBlue support' }`

### Requirement: Simplified Configuration

The plugin SHALL use a capability-focused configuration schema instead of tool-specific options.

#### Scenario: Flattened config structure
- **WHEN** configuring the plugin
- **THEN** options SHALL follow the pattern `{ <stage>: { enabled, threads, timeout, ... } }`
- **AND** NOT use tool-specific keys like `subdomains.amass.enabled`

#### Scenario: RedBlue flags passthrough
- **WHEN** stage-specific flags are configured
- **THEN** they SHALL be passed directly to RedBlue commands

### Requirement: Unified Output Format

The plugin SHALL produce consistent output across all stages.

#### Scenario: Standard result structure
- **WHEN** any stage completes
- **THEN** it SHALL return `{ status, data, metadata }`
- **WHERE** status is `'ok' | 'empty' | 'error' | 'unavailable'`

#### Scenario: Metadata inclusion
- **WHEN** a stage completes successfully
- **THEN** metadata SHALL include `command`, `duration_ms`, and `timestamp`

## REMOVED Requirements

### Requirement: Multi-Tool Dependency Management

**Reason**: RedBlue replaces all external tools with a single binary.

**Migration**: Users install `rb` instead of individual tools (amass, subfinder, nmap, etc.).

### Requirement: Per-Tool Individual Output

**Reason**: RedBlue consolidates sources internally; per-tool breakdown no longer meaningful.

**Migration**: Existing reports remain readable; new reports use unified format.

### Requirement: Tool-Specific Configuration

**Reason**: Configuration simplified to capability-focused options.

**Migration**: Config migration guide provided; old keys ignored with warnings.
