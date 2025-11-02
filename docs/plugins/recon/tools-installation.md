# ReconPlugin - Installation Guide for Reconnaissance Tools

Complete guide to install all reconnaissance tools used by ReconPlugin on Linux (Ubuntu/Debian).

## Quick Installation Script

Run the automated installation script:

```bash
cd s3db.js
sudo bash docs/install-recon-tools.sh
```

## Manual Installation by Category

### 1. Essential Tools (Built-in or APT)

```bash
# DNS tools
sudo apt-get install -y dnsutils        # dig, nslookup
sudo apt-get install -y whois            # whois lookups

# Network tools
sudo apt-get install -y iputils-ping     # ping
sudo apt-get install -y traceroute       # traceroute
sudo apt-get install -y mtr-tiny         # mtr (traceroute alternative)
sudo apt-get install -y curl             # HTTP requests
sudo apt-get install -y openssl          # TLS/SSL testing
```

### 2. Port Scanning & Network Discovery

```bash
# Nmap - Port scanner
sudo apt-get install -y nmap

# Masscan - Fast port scanner
sudo apt-get install -y masscan

# Note: Masscan requires sudo to run (raw sockets)
```

### 3. Subdomain Discovery (Go-based tools)

**Prerequisites**: Install Go first:
```bash
# Install Go 1.21+
wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin' >> ~/.bashrc
source ~/.bashrc
```

**Install tools**:
```bash
# Subfinder - Fast subdomain discovery
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest

# Assetfinder - Simple subdomain finder
go install github.com/tomnomnom/assetfinder@latest

# Amass - Comprehensive subdomain enumeration (also via APT)
sudo apt-get install -y amass
# OR latest version via Go:
# go install -v github.com/owasp-amass/amass/v4/...@master
```

### 4. Directory/Endpoint Fuzzing (Go-based)

```bash
# FFuf - Fast web fuzzer
go install github.com/ffuf/ffuf/v2@latest

# Gobuster - Directory/DNS/vhost bruteforcer
go install github.com/OJ/gobuster/v3@latest

# Feroxbuster - Fast content discovery (Rust-based, via APT)
sudo apt-get install -y feroxbuster
```

### 5. TLS/SSL Auditing

```bash
# SSLScan - SSL/TLS scanner
sudo apt-get install -y sslscan

# testssl.sh - Comprehensive TLS testing
git clone --depth 1 https://github.com/drwetter/testssl.sh.git ~/tools/testssl.sh
sudo ln -s ~/tools/testssl.sh/testssl.sh /usr/local/bin/testssl.sh
sudo chmod +x ~/tools/testssl.sh/testssl.sh

# SSLyze - Python-based SSL scanner
pip3 install --upgrade sslyze
```

### 6. Secrets Detection

```bash
# Gitleaks - Secrets scanner
# Option 1: via Homebrew (if available)
# brew install gitleaks

# Option 2: Download binary
wget https://github.com/gitleaks/gitleaks/releases/download/v8.18.2/gitleaks_8.18.2_linux_x64.tar.gz
tar -xzf gitleaks_8.18.2_linux_x64.tar.gz
sudo mv gitleaks /usr/local/bin/
sudo chmod +x /usr/local/bin/gitleaks
rm gitleaks_8.18.2_linux_x64.tar.gz

# Option 3: via Go
go install github.com/gitleaks/gitleaks/v8@latest
```

### 7. Vulnerability Scanning

```bash
# Nikto - Web server scanner
sudo apt-get install -y nikto

# WPScan - WordPress vulnerability scanner (Ruby-based)
sudo apt-get install -y ruby ruby-dev
sudo gem install wpscan

# Droopescan - Drupal/Joomla scanner (Python-based)
pip3 install droopescan
```

### 8. Technology Fingerprinting

```bash
# WhatWeb - Web technology fingerprinting
sudo apt-get install -y whatweb
```

### 9. OSINT Tools (Python-based)

**Prerequisites**: Install Python3 and pip:
```bash
sudo apt-get install -y python3 python3-pip python3-venv
```

**Install tools**:
```bash
# theHarvester - Email/subdomain/IP harvester
pip3 install theHarvester

# Sherlock - Username search across social networks
pip3 install sherlock-project

# Maigret - Username OSINT tool
pip3 install maigret
```

### 10. Screenshots & Visual Recon

```bash
# Aquatone - Visual inspection of websites
# Download latest release from https://github.com/michenriksen/aquatone/releases
wget https://github.com/michenriksen/aquatone/releases/download/v1.7.0/aquatone_linux_amd64_1.7.0.zip
unzip aquatone_linux_amd64_1.7.0.zip
sudo mv aquatone /usr/local/bin/
sudo chmod +x /usr/local/bin/aquatone
rm aquatone_linux_amd64_1.7.0.zip

# EyeWitness - Screenshot tool (Python-based)
git clone https://github.com/FortyNorthSecurity/EyeWitness.git ~/tools/EyeWitness
cd ~/tools/EyeWitness/Python/setup
sudo ./setup.sh
sudo ln -s ~/tools/EyeWitness/Python/EyeWitness.py /usr/local/bin/eyewitness
```

### 11. DNS Mass Resolution

```bash
# MassDNS - High-performance DNS resolver
git clone https://github.com/blechschmidt/massdns.git ~/tools/massdns
cd ~/tools/massdns
make
sudo make install
```

## Verification

Check installed tools:

```bash
# Create verification script
cat > /tmp/check-recon-tools.sh << 'EOF'
#!/bin/bash

tools=(
    "dig" "whois" "ping" "traceroute" "mtr" "curl" "openssl"
    "nmap" "masscan"
    "subfinder" "assetfinder" "amass"
    "ffuf" "gobuster" "feroxbuster"
    "sslscan" "testssl.sh" "sslyze"
    "gitleaks"
    "nikto" "wpscan" "droopescan"
    "whatweb"
    "theHarvester" "sherlock" "maigret"
    "aquatone" "eyewitness"
    "massdns"
)

echo "=== Checking Recon Tools ==="
echo

for tool in "${tools[@]}"; do
    if command -v "$tool" &> /dev/null; then
        version=$(command "$tool" --version 2>&1 | head -1 || echo "installed")
        echo "✓ $tool - $version"
    else
        echo "✗ $tool - NOT FOUND"
    fi
done
EOF

chmod +x /tmp/check-recon-tools.sh
/tmp/check-recon-tools.sh
```

## Priority Installation (Essentials)

If you have limited time/space, install these core tools first:

```bash
# Tier 1: Absolutely essential
sudo apt-get install -y dnsutils whois curl openssl nmap

# Tier 2: Highly recommended
sudo apt-get install -y masscan nikto whatweb sslscan
go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install github.com/ffuf/ffuf/v2@latest

# Tier 3: Advanced features
pip3 install sslyze theHarvester
git clone --depth 1 https://github.com/drwetter/testssl.sh.git ~/tools/testssl.sh
sudo ln -s ~/tools/testssl.sh/testssl.sh /usr/local/bin/testssl.sh
```

## Tool Categories by Feature

| Feature | Required Tools | Alternative Tools |
|---------|---------------|-------------------|
| DNS | `dig` (dnsutils) | - |
| Whois | `whois` | - |
| Certificates | `openssl` | - |
| HTTP Headers | `curl` | - |
| Latency | `ping` | `mtr`, `traceroute` |
| Port Scanning | `nmap` | `masscan` |
| Subdomains | `amass`, `subfinder` | `assetfinder` |
| Web Discovery | `ffuf`, `feroxbuster` | `gobuster` |
| Vulnerability | `nikto` | `wpscan`, `droopescan` |
| TLS Audit | `sslscan`, `testssl.sh` | `sslyze` |
| Fingerprinting | `whatweb` | - |
| Screenshots | `aquatone` | `eyewitness` |
| OSINT | `theHarvester` | `sherlock`, `maigret` |
| Secrets | `gitleaks` | - |
| MassDNS | `massdns` | - |

## Notes

### Permissions

Some tools require elevated privileges:
- `masscan` - requires sudo (raw sockets)
- `nmap` - some scan types require sudo
- Port scans < 1024 may require sudo

### API Keys (Optional but Recommended)

Some tools work better with API keys:

**Amass**:
```bash
# Create config file
mkdir -p ~/.config/amass
cat > ~/.config/amass/config.ini << EOF
[data_sources.AlienVault]
[data_sources.AlienVault.Credentials]
apikey = YOUR_API_KEY

[data_sources.Shodan]
[data_sources.Shodan.Credentials]
apikey = YOUR_API_KEY
EOF
```

**Subfinder**:
```bash
# Create config file
mkdir -p ~/.config/subfinder
cat > ~/.config/subfinder/provider-config.yaml << EOF
shodan:
  - YOUR_API_KEY
virustotal:
  - YOUR_API_KEY
EOF
```

**theHarvester**:
```bash
# Edit ~/.theHarvester/api-keys.yaml
shodan_key: YOUR_API_KEY
virustotal_key: YOUR_API_KEY
```

### Wordlists for Fuzzing

```bash
# SecLists - Comprehensive wordlist collection
sudo apt-get install -y seclists
# OR
git clone https://github.com/danielmiessler/SecLists.git ~/wordlists/SecLists

# Common wordlist locations:
# - /usr/share/seclists/ (via APT)
# - ~/wordlists/SecLists/ (via git)
# - /usr/share/wordlists/ (Kali Linux)
```

## Docker Alternative

If you prefer containerized tools:

```bash
# Pull comprehensive security toolkit
docker pull kalilinux/kali-rolling

# Run tools in container
docker run -it --rm kalilinux/kali-rolling nmap scanme.nmap.org
```

## Troubleshooting

### Tool not found after installation

```bash
# Add Go bin to PATH
echo 'export PATH=$PATH:$HOME/go/bin' >> ~/.bashrc
source ~/.bashrc

# Add local bin to PATH
echo 'export PATH=$PATH:/usr/local/bin' >> ~/.bashrc
source ~/.bashrc
```

### Permission denied errors

```bash
# Make sure tools are executable
sudo chmod +x /usr/local/bin/*

# Add user to necessary groups
sudo usermod -aG netdev $USER
```

### Python tools not found

```bash
# Use pip3 instead of pip
pip3 install --user <tool>

# Add pip user bin to PATH
echo 'export PATH=$PATH:$HOME/.local/bin' >> ~/.bashrc
source ~/.bashrc
```

## Keeping Tools Updated

```bash
# APT packages
sudo apt-get update && sudo apt-get upgrade

# Go tools
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install github.com/ffuf/ffuf/v2@latest
go install github.com/OJ/gobuster/v3@latest

# Python tools
pip3 install --upgrade sslyze theHarvester sherlock-project maigret droopescan

# Git-based tools
cd ~/tools/testssl.sh && git pull
cd ~/tools/massdns && git pull && make && sudo make install
cd ~/tools/EyeWitness && git pull
```
