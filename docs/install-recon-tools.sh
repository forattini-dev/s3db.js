#!/bin/bash

###############################################################################
# ReconPlugin - Automated Tool Installation Script
#
# Installs reconnaissance tools for s3db.js ReconPlugin
# Supports: Ubuntu 20.04+, Debian 11+
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directories
TOOLS_DIR="$HOME/tools"
GO_VERSION="1.21.5"

# Track installation results
INSTALLED=()
FAILED=()
SKIPPED=()

###############################################################################
# Helper Functions
###############################################################################

print_header() {
    echo -e "\n${BLUE}===================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===================================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
    INSTALLED+=("$1")
}

print_error() {
    echo -e "${RED}✗${NC} $1"
    FAILED+=("$1")
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_skip() {
    echo -e "${YELLOW}⊘${NC} $1 (already installed)"
    SKIPPED+=("$1")
}

check_installed() {
    command -v "$1" &> /dev/null
}

create_tools_dir() {
    mkdir -p "$TOOLS_DIR"
}

###############################################################################
# Installation Functions
###############################################################################

install_system_packages() {
    print_header "1. Installing System Packages (APT)"

    echo "Updating package list..."
    sudo apt-get update -qq

    local packages=(
        "dnsutils"      # dig, nslookup
        "whois"         # whois
        "iputils-ping"  # ping
        "traceroute"    # traceroute
        "mtr-tiny"      # mtr
        "curl"          # curl
        "wget"          # wget
        "git"           # git
        "build-essential" # compilers
        "openssl"       # openssl
        "nmap"          # nmap
        "masscan"       # masscan
        "nikto"         # nikto
        "whatweb"       # whatweb
        "sslscan"       # sslscan
        "python3"       # python3
        "python3-pip"   # pip3
        "python3-venv"  # venv
        "ruby"          # ruby
        "ruby-dev"      # ruby development
    )

    for pkg in "${packages[@]}"; do
        if dpkg -l | grep -q "^ii  $pkg "; then
            print_skip "$pkg"
        else
            echo "Installing $pkg..."
            if sudo apt-get install -y -qq "$pkg" &> /dev/null; then
                print_success "$pkg"
            else
                print_error "$pkg"
            fi
        fi
    done
}

install_go() {
    print_header "2. Installing Go"

    if check_installed go; then
        local current_version=$(go version | awk '{print $3}' | sed 's/go//')
        print_skip "Go $current_version"
        return 0
    fi

    echo "Downloading Go ${GO_VERSION}..."
    wget -q https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz -O /tmp/go.tar.gz

    echo "Installing Go..."
    sudo rm -rf /usr/local/go
    sudo tar -C /usr/local -xzf /tmp/go.tar.gz
    rm /tmp/go.tar.gz

    # Add to PATH if not already there
    if ! grep -q '/usr/local/go/bin' ~/.bashrc; then
        echo 'export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin' >> ~/.bashrc
        export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin
    fi

    print_success "Go ${GO_VERSION}"
}

install_go_tools() {
    print_header "3. Installing Go-based Tools"

    # Ensure Go is in PATH
    export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin

    declare -A go_tools=(
        ["subfinder"]="github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest"
        ["assetfinder"]="github.com/tomnomnom/assetfinder@latest"
        ["ffuf"]="github.com/ffuf/ffuf/v2@latest"
        ["gobuster"]="github.com/OJ/gobuster/v3@latest"
    )

    for tool in "${!go_tools[@]}"; do
        if check_installed "$tool"; then
            print_skip "$tool"
        else
            echo "Installing $tool..."
            if go install -v "${go_tools[$tool]}" &> /dev/null; then
                print_success "$tool"
            else
                print_error "$tool"
            fi
        fi
    done
}

install_gitleaks() {
    print_header "4. Installing Gitleaks"

    if check_installed gitleaks; then
        print_skip "gitleaks"
        return 0
    fi

    local version="8.18.2"
    echo "Downloading Gitleaks ${version}..."
    wget -q https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_linux_x64.tar.gz -O /tmp/gitleaks.tar.gz

    tar -xzf /tmp/gitleaks.tar.gz -C /tmp
    sudo mv /tmp/gitleaks /usr/local/bin/
    sudo chmod +x /usr/local/bin/gitleaks
    rm /tmp/gitleaks.tar.gz

    print_success "gitleaks"
}

install_testssl() {
    print_header "5. Installing testssl.sh"

    create_tools_dir

    if [ -d "$TOOLS_DIR/testssl.sh" ]; then
        print_skip "testssl.sh (updating...)"
        cd "$TOOLS_DIR/testssl.sh"
        git pull -q
    else
        echo "Cloning testssl.sh..."
        git clone --depth 1 https://github.com/drwetter/testssl.sh.git "$TOOLS_DIR/testssl.sh" &> /dev/null
    fi

    if [ ! -L /usr/local/bin/testssl.sh ]; then
        sudo ln -s "$TOOLS_DIR/testssl.sh/testssl.sh" /usr/local/bin/testssl.sh
    fi
    sudo chmod +x "$TOOLS_DIR/testssl.sh/testssl.sh"

    print_success "testssl.sh"
}

install_massdns() {
    print_header "6. Installing MassDNS"

    create_tools_dir

    if check_installed massdns; then
        print_skip "massdns"
        return 0
    fi

    if [ -d "$TOOLS_DIR/massdns" ]; then
        echo "Updating MassDNS..."
        cd "$TOOLS_DIR/massdns"
        git pull -q
    else
        echo "Cloning MassDNS..."
        git clone https://github.com/blechschmidt/massdns.git "$TOOLS_DIR/massdns" &> /dev/null
        cd "$TOOLS_DIR/massdns"
    fi

    echo "Building MassDNS..."
    make &> /dev/null
    sudo make install &> /dev/null

    print_success "massdns"
}

install_python_tools() {
    print_header "7. Installing Python Tools"

    # Ensure pip is up to date
    pip3 install --quiet --upgrade pip setuptools wheel

    local tools=(
        "sslyze"
        "theHarvester"
        "sherlock-project"
        "maigret"
        "droopescan"
    )

    for tool in "${tools[@]}"; do
        local cmd_name="$tool"
        # Handle package name vs command name differences
        case "$tool" in
            "sherlock-project") cmd_name="sherlock" ;;
        esac

        if check_installed "$cmd_name"; then
            print_skip "$tool"
        else
            echo "Installing $tool..."
            if pip3 install --quiet --user "$tool" &> /dev/null; then
                print_success "$tool"
            else
                print_error "$tool"
            fi
        fi
    done

    # Add pip user bin to PATH if not already there
    if ! grep -q '$HOME/.local/bin' ~/.bashrc; then
        echo 'export PATH=$PATH:$HOME/.local/bin' >> ~/.bashrc
        export PATH=$PATH:$HOME/.local/bin
    fi
}

install_ruby_tools() {
    print_header "8. Installing Ruby Tools"

    if check_installed wpscan; then
        print_skip "wpscan"
    else
        echo "Installing wpscan..."
        if sudo gem install wpscan --quiet &> /dev/null; then
            print_success "wpscan"
        else
            print_error "wpscan"
        fi
    fi
}

install_aquatone() {
    print_header "9. Installing Aquatone"

    if check_installed aquatone; then
        print_skip "aquatone"
        return 0
    fi

    local version="1.7.0"
    echo "Downloading Aquatone ${version}..."
    wget -q https://github.com/michenriksen/aquatone/releases/download/v${version}/aquatone_linux_amd64_${version}.zip -O /tmp/aquatone.zip

    unzip -q /tmp/aquatone.zip -d /tmp
    sudo mv /tmp/aquatone /usr/local/bin/
    sudo chmod +x /usr/local/bin/aquatone
    rm /tmp/aquatone.zip /tmp/LICENSE.txt /tmp/README.md 2>/dev/null || true

    print_success "aquatone"
}

install_eyewitness() {
    print_header "10. Installing EyeWitness"

    create_tools_dir

    if [ -d "$TOOLS_DIR/EyeWitness" ]; then
        print_skip "EyeWitness (updating...)"
        cd "$TOOLS_DIR/EyeWitness"
        git pull -q
    else
        echo "Cloning EyeWitness..."
        git clone https://github.com/FortyNorthSecurity/EyeWitness.git "$TOOLS_DIR/EyeWitness" &> /dev/null
    fi

    echo "Setting up EyeWitness..."
    cd "$TOOLS_DIR/EyeWitness/Python/setup"
    sudo ./setup.sh &> /dev/null || print_warning "EyeWitness setup may have issues"

    if [ ! -L /usr/local/bin/eyewitness ]; then
        sudo ln -s "$TOOLS_DIR/EyeWitness/Python/EyeWitness.py" /usr/local/bin/eyewitness
    fi

    print_success "EyeWitness"
}

install_amass() {
    print_header "11. Installing Amass"

    # Try APT first
    if check_installed amass; then
        print_skip "amass"
        return 0
    fi

    echo "Installing amass via APT..."
    if sudo apt-get install -y -qq amass &> /dev/null; then
        print_success "amass"
    else
        print_warning "amass APT install failed, trying via Go..."
        export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin
        if go install -v github.com/owasp-amass/amass/v4/...@master &> /dev/null; then
            print_success "amass (via Go)"
        else
            print_error "amass"
        fi
    fi
}

install_feroxbuster() {
    print_header "12. Installing Feroxbuster"

    if check_installed feroxbuster; then
        print_skip "feroxbuster"
        return 0
    fi

    echo "Installing feroxbuster via APT..."
    if sudo apt-get install -y -qq feroxbuster &> /dev/null; then
        print_success "feroxbuster"
    else
        print_warning "feroxbuster not available via APT"
        print_error "feroxbuster (install manually from GitHub)"
    fi
}

install_wordlists() {
    print_header "13. Installing Wordlists (SecLists)"

    if [ -d "/usr/share/seclists" ] || [ -d "$HOME/wordlists/SecLists" ]; then
        print_skip "SecLists"
        return 0
    fi

    # Try APT first
    if sudo apt-get install -y -qq seclists &> /dev/null; then
        print_success "SecLists (via APT)"
    else
        echo "Installing SecLists via git..."
        mkdir -p "$HOME/wordlists"
        git clone --depth 1 https://github.com/danielmiessler/SecLists.git "$HOME/wordlists/SecLists" &> /dev/null
        print_success "SecLists (via git)"
    fi
}

###############################################################################
# Verification
###############################################################################

verify_installation() {
    print_header "Verification Report"

    local tools=(
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

    local installed_count=0
    local missing_count=0

    echo -e "Tool Status:"
    echo

    for tool in "${tools[@]}"; do
        if check_installed "$tool"; then
            echo -e "${GREEN}✓${NC} $tool"
            ((installed_count++))
        else
            echo -e "${RED}✗${NC} $tool"
            ((missing_count++))
        fi
    done

    echo
    echo -e "${GREEN}Installed:${NC} $installed_count/${#tools[@]}"
    echo -e "${RED}Missing:${NC} $missing_count/${#tools[@]}"
}

###############################################################################
# Summary
###############################################################################

print_summary() {
    print_header "Installation Summary"

    echo -e "${GREEN}Successfully Installed (${#INSTALLED[@]}):${NC}"
    for tool in "${INSTALLED[@]}"; do
        echo "  ✓ $tool"
    done
    echo

    if [ ${#SKIPPED[@]} -gt 0 ]; then
        echo -e "${YELLOW}Skipped (${#SKIPPED[@]}):${NC}"
        for tool in "${SKIPPED[@]}"; do
            echo "  ⊘ $tool"
        done
        echo
    fi

    if [ ${#FAILED[@]} -gt 0 ]; then
        echo -e "${RED}Failed (${#FAILED[@]}):${NC}"
        for tool in "${FAILED[@]}"; do
            echo "  ✗ $tool"
        done
        echo
        echo "See docs/recon-tools-installation.md for manual installation instructions."
    fi
}

###############################################################################
# Main
###############################################################################

main() {
    clear
    print_header "ReconPlugin Tool Installer"

    echo "This script will install reconnaissance tools for s3db.js ReconPlugin"
    echo "Estimated time: 5-15 minutes depending on your connection"
    echo
    echo -e "${YELLOW}Note: You will be prompted for sudo password${NC}"
    echo
    read -p "Continue? (y/N) " -n 1 -r
    echo

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        exit 0
    fi

    # Run installations
    install_system_packages
    install_go
    install_go_tools
    install_gitleaks
    install_testssl
    install_massdns
    install_python_tools
    install_ruby_tools
    install_aquatone
    install_eyewitness
    install_amass
    install_feroxbuster
    install_wordlists

    # Verification
    verify_installation

    # Summary
    print_summary

    print_header "Installation Complete!"

    echo -e "${YELLOW}IMPORTANT:${NC} Reload your shell to update PATH:"
    echo "  source ~/.bashrc"
    echo
    echo "Or start a new terminal session."
    echo
    echo "Documentation: docs/recon-tools-installation.md"
}

# Run main function
main "$@"
