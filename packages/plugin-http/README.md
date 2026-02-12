# @apiquest/plugin-http

HTTP/REST protocol plugin for ApiQuest. Provides comprehensive HTTP request execution with support for all standard methods, headers, body types, SSL/TLS, proxies, and cookie management.

## Installation

```bash
npm install -g @apiquest/plugin-http
```

**Note:** This plugin is required for HTTP/REST API testing with `@apiquest/fracture`.

## Features

- All HTTP methods (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, etc.)
- Request body formats: JSON, form-data, urlencoded, raw
- Custom headers and query parameters
- Cookie jar with persistence
- SSL/TLS client certificates
- Proxy support (HTTP/HTTPS)
- Redirect handling
- Timeout configuration
- Authentication integration (via `@apiquest/plugin-auth`)

## Usage

Set the collection protocol to `http`:

```json
{
  "$schema": "https://apiquest.net/schemas/collection-v1.0.json",
  "protocol": "http",
  "items": [
    {
      "type": "request",
      "id": "get-users",
      "name": "Get Users",
      "data": {
        "method": "GET",
        "url": "https://api.example.com/users",
        "headers": {
          "Accept": "application/json"
        }
      }
    }
  ]
}
```

### POST with JSON Body

```json
{
  "type": "request",
  "id": "create-user",
  "name": "Create User",
  "data": {
    "method": "POST",
    "url": "https://api.example.com/users",
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "mode": "raw",
      "raw": "{\"name\": \"John Doe\", \"email\": \"john@example.com\"}"
    }
  }
}
```

### Form Data

```json
{
  "data": {
    "method": "POST",
    "url": "https://api.example.com/upload",
    "body": {
      "mode": "formdata",
      "formdata": [
        { "key": "file", "value": "@/path/to/file.txt", "type": "file" },
        { "key": "description", "value": "Test upload" }
      ]
    }
  }
}
```

### Runtime Options

Configure SSL, proxy, redirects, and timeouts:

```json
{
  "options": {
    "timeout": 30000,
    "followRedirects": true,
    "maxRedirects": 5,
    "ssl": {
      "cert": "/path/to/client-cert.pem",
      "key": "/path/to/client-key.pem",
      "ca": "/path/to/ca-cert.pem",
      "passphrase": "{{certPassword}}"
    },
    "proxy": {
      "url": "http://proxy.example.com:8080",
      "auth": {
        "username": "{{proxyUser}}",
        "password": "{{proxyPass}}"
      }
    }
  }
}
```

## Response Handling

Access response data in post-request scripts:

```javascript
quest.test('Status is 200', () => {
  expect(quest.response.status).to.equal(200);
});

quest.test('Response is JSON', () => {
  const body = quest.response.json();
  expect(body).to.be.an('object');
});

quest.test('Has required fields', () => {
  const body = quest.response.json();
  expect(body).to.have.property('id');
  expect(body).to.have.property('name');
});
```

## Compatibility

- **Authentication:** Works with `@apiquest/plugin-auth` for Bearer, Basic, OAuth2, API Key
- **Protocols:** HTTP/1.1, HTTP/2 (auto-negotiated)
- **Node.js:** Requires Node.js 20+

## Documentation

- [Fracture Documentation](https://apiquest.net/docs/fracture)
- [Schema Reference](https://apiquest.net/schemas/collection-v1.0.json)

## License

Dual-licensed under AGPL-3.0-or-later and commercial license. See [LICENSE](./LICENSE.txt) for details.
