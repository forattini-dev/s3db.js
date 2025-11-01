# ReconPlugin Tools - Installation Guide

Complete toolkit installation for s3db.js ReconPlugin reconnaissance features.

## 📊 Current Status

You currently have **6/29** tools installed:
- ✓ dig, whois, ping, mtr, curl, openssl

**Missing 23 tools** that unlock advanced features.

## 🚀 Quick Start (5-15 minutes)

### Automated Installation (Recommended)

```bash
cd /home/ff/work/martech/shortner/s3db.js
sudo bash docs/install-recon-tools.sh
```

This installs:
- ✓ All APT packages (nmap, masscan, nikto, whatweb, sslscan, etc.)
- ✓ Go 1.21+ and Go-based tools (subfinder, ffuf, gobuster, etc.)
- ✓ Python tools (sslyze, theHarvester, sherlock, maigret)
- ✓ Ruby tools (wpscan)
- ✓ Binary tools (gitleaks, aquatone)
- ✓ Git-based tools (testssl.sh, massdns, EyeWitness)
- ✓ Wordlists (SecLists)

After installation:
```bash
source ~/.bashrc  # Reload PATH
```

### Manual Installation (Priority Tools)

If you prefer manual control or want only essential tools:

```bash
# 1. System packages (2 minutes)
sudo apt-get update
sudo apt-get install -y dnsutils whois curl openssl nmap masscan nikto whatweb sslscan traceroute python3-pip

# 2. Install Go (1 minute)
wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin' >> ~/.bashrc
source ~/.bashrc

# 3. Go tools (2 minutes)
go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install github.com/ffuf/ffuf/v2@latest
go install github.com/OJ/gobuster/v3@latest

# 4. Python tools (1 minute)
pip3 install --user sslyze theHarvester

# Done! Verify:
which nmap subfinder ffuf
```

## 📚 Documentation

- **Quick Start**: [QUICK-START-RECON-TOOLS.md](QUICK-START-RECON-TOOLS.md)
- **Full Guide**: [recon-tools-installation.md](recon-tools-installation.md)
- **Installation Script**: [install-recon-tools.sh](install-recon-tools.sh)

## 🔧 Tool Categories

### Network Reconnaissance
| Tool | Status | Installation | Purpose |
|------|--------|--------------|---------|
| dig | ✓ Installed | Pre-installed | DNS lookups |
| whois | ✓ Installed | Pre-installed | Domain info |
| nmap | ✗ Missing | `apt install nmap` | Port scanning |
| masscan | ✗ Missing | `apt install masscan` | Fast port scanning |

### Subdomain Discovery
| Tool | Status | Installation | Purpose |
|------|--------|--------------|---------|
| subfinder | ✗ Missing | Go install | Fast subdomain discovery |
| amass | ✗ Missing | `apt install amass` | Comprehensive enumeration |
| assetfinder | ✗ Missing | Go install | Simple discovery |

### Web Discovery & Fuzzing
| Tool | Status | Installation | Purpose |
|------|--------|--------------|---------|
| ffuf | ✗ Missing | Go install | Fast web fuzzer |
| gobuster | ✗ Missing | Go install | Directory bruteforce |
| feroxbuster | ✗ Missing | `apt install feroxbuster` | Rust-based fuzzer |

### Vulnerability Scanning
| Tool | Status | Installation | Purpose |
|------|--------|--------------|---------|
| nikto | ✗ Missing | `apt install nikto` | Web server scanner |
| wpscan | ✗ Missing | `gem install wpscan` | WordPress scanner |
| droopescan | ✗ Missing | `pip install droopescan` | Drupal/Joomla scanner |

### TLS/SSL Security
| Tool | Status | Installation | Purpose |
|------|--------|--------------|---------|
| openssl | ✓ Installed | Pre-installed | TLS basics |
| sslscan | ✗ Missing | `apt install sslscan` | SSL/TLS scanner |
| testssl.sh | ✗ Missing | Git clone | Comprehensive TLS testing |
| sslyze | ✗ Missing | `pip install sslyze` | Python TLS scanner |

### Secrets Detection
| Tool | Status | Installation | Purpose |
|------|--------|--------------|---------|
| gitleaks | ✗ Missing | Binary download | Secret scanner |

### OSINT
| Tool | Status | Installation | Purpose |
|------|--------|--------------|---------|
| theHarvester | ✗ Missing | `pip install theHarvester` | Email/subdomain harvester |
| sherlock | ✗ Missing | `pip install sherlock-project` | Username search |
| maigret | ✗ Missing | `pip install maigret` | OSINT tool |

### Technology Fingerprinting
| Tool | Status | Installation | Purpose |
|------|--------|--------------|---------|
| whatweb | ✗ Missing | `apt install whatweb` | Web tech fingerprinting |

### Screenshots
| Tool | Status | Installation | Purpose |
|------|--------|--------------|---------|
| aquatone | ✗ Missing | Binary download | Website screenshots |
| eyewitness | ✗ Missing | Git clone + setup | Screenshot tool |

### DNS Resolution
| Tool | Status | Installation | Purpose |
|------|--------|--------------|---------|
| massdns | ✗ Missing | Git clone + build | Mass DNS resolver |

## 🎯 Feature Enablement by Tools

### What You Can Do Now (6 tools)
- ✓ DNS lookups (dig)
- ✓ Whois queries (whois)
- ✓ Basic connectivity (ping, mtr)
- ✓ HTTP requests (curl)
- ✓ TLS basics (openssl)

### What You'll Unlock After Installation

**With nmap + masscan**:
- Port scanning (fast and comprehensive)
- Service detection
- OS fingerprinting

**With subfinder + amass + assetfinder**:
- Automated subdomain discovery
- Asset enumeration
- Attack surface mapping

**With ffuf + gobuster + feroxbuster**:
- Directory bruteforcing
- Endpoint discovery
- Virtual host discovery

**With nikto + wpscan**:
- Web vulnerability scanning
- CMS-specific testing
- Security misconfigurations

**With testssl.sh + sslyze + sslscan**:
- Comprehensive TLS auditing
- Cipher suite analysis
- Certificate validation

**With gitleaks**:
- Exposed secrets detection
- API key scanning
- Credential discovery

**With theHarvester + sherlock + maigret**:
- Email harvesting
- Social media OSINT
- Username enumeration

**With aquatone + eyewitness**:
- Visual reconnaissance
- Screenshot capture
- Multi-page analysis

**With massdns**:
- High-performance DNS resolution
- Subdomain validation
- Large-scale DNS queries

## ⚡ Quick Commands

### Check Installation Status
```bash
bash /tmp/check-current-tools.sh
```

### Install Everything
```bash
sudo bash docs/install-recon-tools.sh
```

### Install Priority Tools Only (< 5 minutes)
```bash
# APT tools
sudo apt-get update && sudo apt-get install -y nmap masscan nikto whatweb sslscan

# Go setup + tools
wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin' >> ~/.bashrc
source ~/.bashrc
go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install github.com/ffuf/ffuf/v2@latest

# Python tools
pip3 install --user sslyze
```

### Test ReconPlugin
```bash
node docs/examples/e52-recon-new-features.js
```

## 🐛 Troubleshooting

### Command not found after installation
```bash
source ~/.bashrc
# Or restart terminal
```

### Go tools not in PATH
```bash
echo 'export PATH=$PATH:$HOME/go/bin' >> ~/.bashrc
source ~/.bashrc
```

### Python tools not found
```bash
echo 'export PATH=$PATH:$HOME/.local/bin' >> ~/.bashrc
source ~/.bashrc
```

### Permission denied (masscan, nmap)
Some tools require sudo for certain features:
```bash
sudo nmap -sS target.com  # SYN scan
sudo masscan 0.0.0.0/0 -p80  # Internet-wide scan
```

## 📖 Learn More

- **ReconPlugin Documentation**: [../plugins/recon/](../plugins/recon/)
- **Example Usage**: [examples/e52-recon-new-features.js](examples/e52-recon-new-features.js)
- **Security Audit**: Automatically checks target security posture
- **Artifact Persistence**: All results saved to filesystem or S3

## 🎓 Best Practices

1. **Start with essentials**: Install nmap, subfinder, ffuf first
2. **Use wordlists**: Download SecLists for better fuzzing results
3. **API keys**: Configure API keys for amass, subfinder, theHarvester
4. **Rate limiting**: Use `--rate` flags to avoid blocking
5. **Legal**: Only scan systems you have permission to test

## 💡 Tips

- **Fast scans**: Use masscan for initial port discovery, nmap for detailed scans
- **Subdomain discovery**: Combine subfinder + amass for best results
- **Web fuzzing**: Start with small wordlists, then scale up
- **TLS auditing**: testssl.sh provides most comprehensive results
- **OSINT**: theHarvester + sherlock cover most use cases
- **Screenshots**: aquatone is faster, eyewitness is more feature-rich

## 🔗 External Resources

- OWASP Amass: https://github.com/owasp-amass/amass
- ProjectDiscovery: https://github.com/projectdiscovery
- SecLists: https://github.com/danielmiessler/SecLists
- testssl.sh: https://github.com/drwetter/testssl.sh
- Gitleaks: https://github.com/gitleaks/gitleaks
