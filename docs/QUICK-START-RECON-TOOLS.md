# Quick Start - Recon Tools Installation

## One-Line Installation (Recommended)

```bash
cd /home/ff/work/martech/shortner/s3db.js
sudo bash docs/install-recon-tools.sh
```

After installation, reload your shell:
```bash
source ~/.bashrc
```

## What Gets Installed

### Tier 1: Essential (No external dependencies)
- ✓ `dig`, `whois`, `curl`, `openssl` - Network basics
- ✓ `nmap` - Port scanner
- ✓ `nikto`, `whatweb` - Web scanners

### Tier 2: Go Tools (requires Go 1.21+)
- ✓ `subfinder` - Subdomain discovery
- ✓ `ffuf` - Web fuzzer
- ✓ `gobuster` - Directory bruteforcer
- ✓ `assetfinder` - Asset discovery

### Tier 3: Python Tools (requires Python 3)
- ✓ `sslyze` - TLS scanner
- ✓ `theHarvester` - OSINT tool
- ✓ `sherlock` - Username search
- ✓ `maigret` - OSINT tool

### Tier 4: Advanced Tools
- ✓ `gitleaks` - Secrets scanner
- ✓ `testssl.sh` - Comprehensive TLS testing
- ✓ `massdns` - Mass DNS resolver
- ✓ `aquatone` - Screenshot tool

## Manual Quick Install (Priority Tools Only)

If you want just the essentials:

```bash
# Core tools (APT)
sudo apt-get update
sudo apt-get install -y dnsutils whois curl openssl nmap masscan nikto whatweb sslscan

# Go (for Go-based tools)
wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin' >> ~/.bashrc
source ~/.bashrc

# Go tools
go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install github.com/ffuf/ffuf/v2@latest

# Python tools
pip3 install --user sslyze theHarvester

# Done!
```

## Verify Installation

```bash
# Quick check
which nmap subfinder ffuf dig whois

# Detailed check
for tool in dig whois nmap subfinder ffuf nikto whatweb; do
    command -v $tool && echo "✓ $tool installed" || echo "✗ $tool missing"
done
```

## Test ReconPlugin

```bash
cd /home/ff/work/martech/shortner/s3db.js
node docs/examples/e52-recon-new-features.js
```

## Common Issues

### `command not found` after installation

```bash
# Reload shell
source ~/.bashrc

# Or start new terminal
```

### Permission denied

```bash
# Fix permissions
chmod +x /usr/local/bin/*
```

### Go tools not found

```bash
# Add Go bin to PATH
echo 'export PATH=$PATH:$HOME/go/bin' >> ~/.bashrc
source ~/.bashrc
```

## Tool Categories

| Category | Tools | APT | Go | Python | Binary |
|----------|-------|-----|-----|--------|--------|
| DNS | dig, whois | ✓ | | | |
| Network | ping, curl, mtr | ✓ | | | |
| Ports | nmap, masscan | ✓ | | | |
| Subdomains | subfinder, amass | | ✓ | | |
| Fuzzing | ffuf, gobuster | | ✓ | | |
| Web | nikto, whatweb | ✓ | | | |
| TLS | sslscan, sslyze | ✓ | | ✓ | |
| Secrets | gitleaks | | | | ✓ |
| OSINT | theHarvester | | | ✓ | |

## Full Documentation

See `docs/recon-tools-installation.md` for complete guide with:
- Detailed installation steps
- API key configuration
- Wordlist setup
- Troubleshooting
- Docker alternative

## Time Estimates

- **Automated script**: 5-15 minutes (full installation)
- **Manual essentials**: 2-5 minutes
- **Priority tools only**: < 2 minutes
