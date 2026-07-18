#!/usr/bin/env bash
# Default-DROP egress with a small allowlist so an unattended
# --dangerously-skip-permissions run can't reach arbitrary hosts. Modeled on
# Anthropic's devcontainer firewall. Must run as root with NET_ADMIN.
set -euo pipefail

ALLOWED_DOMAINS=(
  api.anthropic.com
  github.com
  api.github.com
  codeload.github.com
  objects.githubusercontent.com
  registry.npmjs.org
)

# Reset.
iptables -F
iptables -X 2>/dev/null || true
ipset destroy allowed 2>/dev/null || true
ipset create allowed hash:ip

# Loopback + established connections + DNS (needed to resolve the allowlist itself).
iptables -A INPUT  -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT
iptables -A INPUT  -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Resolve each allowed domain to its current IPs and add them to the set.
for domain in "${ALLOWED_DOMAINS[@]}"; do
  for ip in $(dig +short "$domain" A | grep -E '^[0-9.]+$'); do
    ipset add allowed "$ip" 2>/dev/null || true
  done
done

iptables -A OUTPUT -m set --match-set allowed dst -j ACCEPT

# Default deny everything else.
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

echo "init-firewall: egress restricted to ${ALLOWED_DOMAINS[*]}"
