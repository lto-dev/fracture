# @apiquest/plugin-vault-file

File-based vault provider plugin for ApiQuest. Provides secure secret storage using encrypted or plain JSON files.

## Installation

```bash
npm install -g @apiquest/plugin-vault-file
```

## Features

- Read secrets from JSON files
- AES-256-GCM encryption support
- Environment variable integration for encryption keys
- Read-only access (no write operations)
- Secure key handling from environment variables

## Usage

Configure the plugin in your collection's runtime options:

### Plain JSON Vault

```json
{
  "$schema": "https://apiquest.net/schemas/collection-v1.0.json",
  "protocol": "http",
  "options": {
    "plugins": {
      "vault:file": {
        "filePath": "./secrets.json"
      }
    }
  }
}
```

**secrets.json:**
```json
{
  "apiKey": "sk_live_abc123",
  "dbPassword": "secret_password",
  "jwtSecret": "my_jwt_secret"
}
```

### Encrypted Vault

For encrypted vaults, specify the encryption key from an environment variable:

```json
{
  "options": {
    "plugins": {
      "vault:file": {
        "filePath": "./secrets.json.enc",
        "key": "VAULT_KEY",
        "source": "env"
      }
    }
  }
}
```

This reads the encryption key from `process.env.VAULT_KEY`.

### Accessing Vault Secrets

Use the `{{$vault:file:secretName}}` syntax in your requests:

```json
{
  "type": "request",
  "id": "api-call",
  "name": "API Call with Secret",
  "auth": {
    "type": "apikey",
    "apikey": {
      "key": "x-api-key",
      "value": "{{$vault:file:apiKey}}",
      "in": "header"
    }
  }
}
```

### Using in Scripts

```javascript
// preRequestScript
const dbPassword = await quest.vault.get('file', 'dbPassword');
quest.variables.set('password', dbPassword);

quest.test('Vault accessible', async () => {
  const secret = await quest.vault.get('file', 'apiKey');
  expect(secret).to.be.a('string');
});
```

## Encryption

To create an encrypted vault file, use AES-256-GCM encryption with the following format:

```json
{
  "_encrypted": "aes-256-gcm",
  "_iv": "base64_initialization_vector",
  "_authTag": "base64_authentication_tag",
  "_data": "base64_encrypted_data"
}
```

The plugin automatically detects encrypted files by the presence of the `_encrypted` field.

## Security Best Practices

1. **Never commit unencrypted secrets** to version control
2. **Store encryption keys in environment variables**, not in code
3. **Use different vault files** for different environments (dev, staging, prod)
4. **Rotate secrets regularly** and update vault files
5. **Use encrypted vaults** for sensitive production secrets

## Compatibility

- **Protocols:** Works with all plugins
- **Node.js:** Requires Node.js 20+

## Documentation

- [Fracture Documentation](https://apiquest.net/docs/fracture)
- [Schema Reference](https://apiquest.net/schemas/collection-v1.0.json)

## License

Dual-licensed under AGPL-3.0-or-later and commercial license. See LICENSE.txt for details.
