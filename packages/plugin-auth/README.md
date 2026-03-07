# @apiquest/plugin-auth

Authentication plugins for ApiQuest. Provides Bearer, Basic, OAuth2, API Key, Digest, and NTLM authentication for HTTP-based protocols.

## Installation

```bash
# Using npm
npm install -g @apiquest/plugin-auth

# Or using fracture CLI
fracture plugin install auth
```

## Supported Authentication Types

### Preemptive auth (credentials injected before request)

- **Bearer Token** (`bearer`) — `Authorization: Bearer {token}`
- **Basic Auth** (`basic`) — `Authorization: Basic base64(username:password)`
- **OAuth2** (`oauth2`) — Client credentials flow: fetches token, injects `Authorization: Bearer`
- **API Key** (`apikey`) — Injects `{key}: {value}` as header or query param

### Handshake auth (multi-round challenge/response)

- **Digest Auth** (`digest`) — Two-round HTTP Digest (RFC 7616 / RFC 2617). Supports `qop=auth` with MD5 or SHA-256. The plugin probes the server for a challenge (round 1), then sends credentials (round 2).
- **NTLM Auth** (`ntlm`) — Three-message NTLMv2 handshake (Type1 Negotiate / Type2 Challenge / Type3 Authenticate). Uses HMAC-MD5 with a pure-JS MD4 implementation (RFC 1320) for NTHash computation — no OpenSSL dependency.

## Usage

Authentication is configured at the collection, folder, or request level:

```json
{
  "auth": {
    "type": "bearer",
    "bearer": {
      "token": "{{authToken}}"
    }
  }
}
```

### Bearer Token

```json
{
  "auth": {
    "type": "bearer",
    "bearer": {
      "token": "your-access-token"
    }
  }
}
```

### Basic Authentication

```json
{
  "auth": {
    "type": "basic",
    "basic": {
      "username": "{{username}}",
      "password": "{{password}}"
    }
  }
}
```

### API Key

```json
{
  "auth": {
    "type": "apikey",
    "apikey": {
      "key": "x-api-key",
      "value": "{{apiKey}}",
      "in": "header"
    }
  }
}
```

### OAuth2 Client Credentials

```json
{
  "auth": {
    "type": "oauth2",
    "oauth2": {
      "grantType": "client_credentials",
      "tokenUrl": "https://auth.example.com/oauth/token",
      "clientId": "{{clientId}}",
      "clientSecret": "{{clientSecret}}",
      "scope": "api:read api:write"
    }
  }
}
```

### Digest Authentication

```json
{
  "auth": {
    "type": "digest",
    "data": {
      "username": "{{username}}",
      "password": "{{password}}"
    }
  }
}
```

The plugin automatically handles the two-round exchange: it first probes the server for a challenge, then computes and sends credentials. Supports `qop=auth` (nc + cnonce), legacy no-qop (RFC 2069), and `algorithm=SHA-256`. Works against Apache httpd, nginx, and standard HTTP Digest servers.

Known limitation: `qop=auth-int` (body integrity) is not yet implemented. Tracked for a future release.

### NTLM Authentication

```json
{
  "auth": {
    "type": "ntlm",
    "data": {
      "username": "{{username}}",
      "password": "{{password}}",
      "domain": "{{domain}}"
    }
  }
}
```

Implements NTLMv2 using HMAC-MD5. NTHash is computed with a pure-JS MD4 implementation (RFC 1320) — no OpenSSL dependency, works on all Node.js 20+ environments. The three-message handshake (Type1 Negotiate / Type2 Challenge / Type3 Authenticate) is fully implemented.

Known limitation: Integration tests against a live NTLM server

## Compatibility

Works with protocol plugins that support HTTP-based authentication:
- `@apiquest/plugin-http`
- `@apiquest/plugin-graphql`
- `@apiquest/plugin-sse`

## Documentation

- [Fracture Documentation](https://apiquest.net/docs/fracture)
- [Schema Reference](https://apiquest.net/schemas/collection-v1.0.json)

## License

Dual-licensed under AGPL-3.0-or-later and commercial license. See [LICENSE](LICENSE) for details.
