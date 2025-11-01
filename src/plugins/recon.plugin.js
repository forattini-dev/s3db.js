/**
 * ReconPlugin - Backward Compatibility Wrapper
 *
 * This file maintains backward compatibility with the original monolithic ReconPlugin.
 * It re-exports the modular refactored version from src/plugins/recon/index.js
 *
 * Migration Path:
 * 1. Original: import { ReconPlugin } from 's3db.js/plugins/recon.plugin.js'
 * 2. Modular: import { ReconPlugin } from 's3db.js/plugins/recon/index.js'
 *
 * Both imports work identically - this wrapper ensures existing code continues to function.
 *
 * The original 2709-line monolithic implementation has been backed up to:
 * src/plugins/recon.plugin.js.backup
 *
 * New Modular Structure:
 * ├── recon/
 * │   ├── index.js               # Main plugin orchestrator
 * │   ├── config/
 * │   │   ├── defaults.js        # Default configuration
 * │   │   └── resources.js       # Database resource schemas
 * │   ├── managers/
 * │   │   ├── storage-manager.js # Report persistence & resource updates
 * │   │   ├── target-manager.js  # Dynamic target management
 * │   │   ├── scheduler-manager.js # Scheduled scanning
 * │   │   └── dependency-manager.js # Tool availability checking
 * │   ├── stages/
 * │   │   ├── dns-stage.js       # DNS enumeration
 * │   │   ├── certificate-stage.js # TLS certificate inspection
 * │   │   ├── latency-stage.js   # Network latency measurement
 * │   │   ├── http-stage.js      # HTTP header analysis
 * │   │   ├── ports-stage.js     # Port scanning
 * │   │   ├── subdomains-stage.js # Subdomain discovery
 * │   │   ├── web-discovery-stage.js # Directory/endpoint fuzzing
 * │   │   ├── vulnerability-stage.js # Vulnerability scanning
 * │   │   ├── tls-audit-stage.js # TLS/SSL security auditing
 * │   │   ├── fingerprint-stage.js # Technology fingerprinting
 * │   │   ├── screenshot-stage.js # Visual reconnaissance
 * │   │   └── osint-stage.js     # OSINT data gathering
 * │   └── concerns/
 * │       ├── command-runner.js  # CLI command execution
 * │       ├── target-normalizer.js # URL/domain parsing
 * │       ├── fingerprint-builder.js # Fingerprint aggregation
 * │       ├── report-generator.js # Report generation (MD/JSON/HTML)
 * │       └── diff-detector.js   # Change detection
 *
 * Benefits of Modular Structure:
 * - Testability: Each stage/manager/concern can be tested independently
 * - Maintainability: Easy to locate and modify specific functionality
 * - Extensibility: Simple to add new stages or tools
 * - Performance: Stages can run in parallel
 * - Clarity: Clear separation of concerns
 */

// Re-export the modular ReconPlugin
export { ReconPlugin } from './recon/index.js';

// Default export for CommonJS compatibility
export { ReconPlugin as default } from './recon/index.js';

// Note: All public APIs remain unchanged. Existing code using ReconPlugin
// will continue to work without modifications:
//
// await plugin.scan(target, options)
// await plugin.batchScan(targets, options)
// await plugin.getReport(reportId)
// await plugin.listReports(options)
// await plugin.compareReports(id1, id2)
// await plugin.addTarget(target, schedule)
// await plugin.removeTarget(targetId)
// await plugin.listTargets()
// plugin.generateMarkdownReport(report)
// plugin.generateJSONReport(report)
// plugin.generateHTMLReport(report)
// plugin.generateExecutiveSummary(report)
