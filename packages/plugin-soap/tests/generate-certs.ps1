# Generate test certificates for SSL/TLS testing
# Run this script from any directory - it will find the correct location
# Requires OpenSSL to be installed and in PATH

$ErrorActionPreference = "Stop"

# Get script directory and set output directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$fixturesDir = Join-Path $scriptDir "test-fixtures"

# Find OpenSSL config file
$opensslCmd = Get-Command openssl -ErrorAction SilentlyContinue
if ($opensslCmd) {
  $opensslPath = $opensslCmd.Source
  $opensslDir = Split-Path -Parent $opensslPath
  $opensslParent = Split-Path -Parent $opensslDir
  
  $possibleConfigs = @(
    (Join-Path $opensslParent "ssl\openssl.cnf"),
    (Join-Path $opensslParent "etc\ssl\openssl.cnf"),
    "C:\Program Files\Git\usr\ssl\openssl.cnf"
  )
  
  foreach ($conf in $possibleConfigs) {
    if (Test-Path $conf) {
      $env:OPENSSL_CONF = $conf
      Write-Host "Using OpenSSL config: $conf" -ForegroundColor Cyan
      break
    }
  }
}

# Create test-fixtures directory
New-Item -ItemType Directory -Force -Path $fixturesDir | Out-Null
Set-Location $fixturesDir

Write-Host "Generating test certificates..." -ForegroundColor Green

# 1. Self-signed server certificate
Write-Host "1. Generating self-signed server certificate..."
openssl req -x509 -newkey rsa:2048 -nodes `
  -keyout server-key.pem -out server-cert.pem `
  -days 365 -subj "/CN=localhost" -batch

# 2. Client certificate for mTLS
Write-Host "2. Generating client certificate for mTLS..."
openssl req -x509 -newkey rsa:2048 -nodes `
  -keyout client-key.pem -out client-cert.pem `
  -days 365 -subj "/CN=test-client" -batch

# 3. Custom CA certificate
Write-Host "3. Generating custom CA certificate..."
openssl req -x509 -newkey rsa:2048 -nodes `
  -keyout ca-key.pem -out ca-cert.pem `
  -days 365 -subj "/CN=Test CA" -batch

# 4. Encrypted client key with passphrase
Write-Host "4. Generating encrypted client key with passphrase..."
openssl genrsa -aes256 -passout pass:test-passphrase -out client-key-encrypted.pem 2048
openssl req -new -x509 -key client-key-encrypted.pem -passin pass:test-passphrase `
  -out client-cert-encrypted.pem -days 365 -subj "/CN=test-client-encrypted" -batch

Write-Host ""
Write-Host "✓ Certificate generation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Generated files in test-fixtures/:" -ForegroundColor Cyan
Get-ChildItem | Format-Table Name, Length, LastWriteTime
