# @apiquest/plugin-auth

Authentication plugins for ApiQuest. Provides Bearer, Basic, OAuth2, and API Key authentication support for HTTP-based protocols.

## Installation

```bash
npm install -g @apiquest/plugin-auth
```

## Supported Authentication Types

- **Bearer Token** - Authorization: Bearer {token}
- **Basic Auth** - Username/password authentication
- **OAuth2** - OAuth 2.0 client credentials flow
- **API Key** - Custom header or query parameter authentication

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

## Compatibility

Works with protocol plugins that support HTTP-based authentication:
- `@apiquest/plugin-http`
- `@apiquest/plugin-graphql`
- `@apiquest/plugin-sse`

## Documentation

- [Fracture Documentation](https://apiquest.net/docs/fracture)
- [Schema Reference](https://apiquest.net/schemas/collection-v1.0.json)

## License

Dual-licensed under AGPL-3.0-or-later and commercial license. See [LICENSE](./LICENSE.txt) for details.
