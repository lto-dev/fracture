#!/bin/bash

# Generate test certificates for SSL/TLS testing
# Run this script from any directory - it will find the correct location

set -e

# Get script directory and set output directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
FIXTURES_DIR="$SCRIPT_DIR/test-fixtures"

# Create test-fixtures directory
mkdir -p "$FIXTURES_DIR"
cd "$FIXTURES_DIR"

echo "Generating test certificates..."

# 1. Self-signed server certificate
echo "1. Generating self-signed server certificate..."
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout server-key.pem -out server-cert.pem \
  -days 365 -subj "/CN=localhost" -batch \
  2>/dev/null

# 2. Client certificate for mTLS
echo "2. Generating client certificate for mTLS..."
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout client-key.pem -out client-cert.pem \
  -days 365 -subj "/CN=test-client" -batch \
  2>/dev/null

# 3. Custom CA certificate
echo "3. Generating custom CA certificate..."
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout ca-key.pem -out ca-cert.pem \
  -days 365 -subj "/CN=Test CA" -batch \
  2>/dev/null

# 4. Encrypted client key with passphrase
echo "4. Generating encrypted client key with passphrase..."
openssl genrsa -aes256 -passout pass:test-passphrase -out client-key-encrypted.pem 2048 2>/dev/null
openssl req -new -x509 -key client-key-encrypted.pem -passin pass:test-passphrase \
  -out client-cert-encrypted.pem -days 365 -subj "/CN=test-client-encrypted" -batch \
  2>/dev/null

echo ""
echo "✓ Certificate generation complete!"
echo ""
echo "Generated files in test-fixtures/:"
ls -lh

# Make sure .gitignore exists to ignore generated certs
echo "*.pem" > .gitignore
echo "✓ Added .gitignore for .pem files"
