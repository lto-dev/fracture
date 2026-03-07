# Auth Plugin

Authentication plugin for ApiQuest Fracture. Provides common authentication methods including Bearer tokens, Basic auth, OAuth 2.0, API keys, Digest, and NTLM.

## Installation

```bash
# Using npm
npm install -g @apiquest/plugin-auth

# Or using fracture CLI
fracture plugin install auth
```

## Supported Auth Types

### Bearer Token

```json
{
  "auth": {
    "type": "bearer",
    "data": {
      "token": "{{apiToken}}"
    }
  }
}
```

###Basic Authentication

```json
{
  "auth": {
    "type": "basic",
    "data": {
      "username": "{{username}}",
      "password": "{{password}}"
    }
  }
}
```

### OAuth 2.0

```json
{
  "auth": {
    "type": "oauth2",
    "data": {
      "grantType": "client_credentials",
      "accessTokenUrl": "{{authUrl}}/token",
      "clientId": "{{clientId}}",
      "clientSecret": "{{clientSecret}}",
      "scope": "read write"
    }
  }
}
```

### API Key

```json
{
  "auth": {
    "type": "apikey",
    "data": {
      "key": "X-API-Key",
      "value": "{{apiKey}}",
      "in": "header"
    }
  }
}
```

Supports `in`: "header" or "query"

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

> **NTLM implementation status:** The plugin implements NTLMv2 using HMAC-MD5 with a pure-JS MD4 implementation (RFC 1320) for computing NTHash. The three-message handshake (Type1 Negotiate / Type2 Challenge / Type3 Authenticate) is fully implemented. Integration tests against a real NTLM server (e.g., `express-ntlm`) are tracked as a follow-up task.

## Plugin Configuration

### Authentication Types Provided
- `bearer`
- `basic`
- `oauth2`
- `apikey`
- `digest`
- `ntlm`

### Supported Protocols
- `http`
- `graphql`
- `grpc`
- `websocket`
- `sse`

## Usage

Authentication is applied by the runner before protocol plugin execution. Configure at collection, folder, or request level:

```json
{
  "$schema": "https://apiquest.net/schemas/collection-v1.0.json",
  "protocol": "http",
  "auth": {
    "type": "bearer",
    "data": {
      "token": "{{globalToken}}"
    }
  },
  "items": [
    {
      "type": "request",
      "id": "protected-resource",
      "name": "Get Protected Resource",
      "data": {
        "method": "GET",
        "url": "{{baseUrl}}/protected"
      }
    }
  ]
}
```

### Inheritance

- Requests inherit auth from parent folder
- Folders inherit auth from collection
- Use `"type": "inherit"` to explicitly inherit
- Use `"type": "none"` to disable auth for specific request/folder

## Writing Auth Plugins

Auth plugins implement the `IAuthPlugin` interface from `@apiquest/types`. There are two dispatch paths:

### Preemptive auth — implement `apply()`

Use this when credentials can be computed from the auth data alone, before any server interaction.

```typescript
import type { IAuthPlugin, Request, Auth, RuntimeOptions, ValidationResult, ILogger } from '@apiquest/types';

export const myPlugin: IAuthPlugin = {
  name: 'My Auth Plugin',
  version: '1.0.0',
  description: '...',
  authTypes: ['my-auth'],
  protocols: ['http'],
  dataSchema: { ... },

  async apply(request: Request, auth: Auth, options: RuntimeOptions, logger?: ILogger): Promise<Request> {
    // Return a MODIFIED request — return the same object mutated, or a new object.
    // The fracture runtime uses the RETURNED value. Do not rely on side effects.
    const token = (auth.data as { token: string }).token;
    return {
      ...request,
      data: {
        ...request.data,
        headers: {
          ...(request.data.headers as Record<string, string> ?? {}),
          Authorization: `Bearer ${token}`
        }
      }
    };
  },

  validate(auth: Auth, options: RuntimeOptions): ValidationResult {
    const token = (auth.data as { token?: string })?.token ?? '';
    return token !== ''
      ? { valid: true }
      : { valid: false, errors: [{ message: 'Token is required', location: '', source: 'auth' }] };
  }
};
```

### Handshake auth — implement `negotiate()`

Use this when the server must send a challenge before credentials can be computed (Digest, NTLM, Kerberos).

```typescript
import type { IAuthPlugin, Request, Auth, RuntimeOptions, AuthExecutor, ILogger } from '@apiquest/types';

export const myPlugin: IAuthPlugin = {
  // ...metadata...

  async negotiate(
    request: Request,
    auth: Auth,
    options: RuntimeOptions,
    executor: AuthExecutor,
    logger?: ILogger
  ): Promise<Request> {
    // Round 1: probe for the challenge
    const challengeResponse = await executor.send(request);

    // Inspect challengeResponse.data.status, challengeResponse.data.headers
    // to extract the challenge

    // Round N: send credentials
    const credentialedRequest = { ...request, data: { ...request.data, headers: { ... } } };
    await executor.send(credentialedRequest);

    // Return the final request (with auth headers applied).
    // PluginManager will call protocolPlugin.execute() with this returned request
    // for the "official" logged response.
    return credentialedRequest;
  },

  validate(auth, options) { ... }
};
```

### Request mutation contract

Both `apply()` and `negotiate()` must return the `Request` they want the runtime to use.

- **Return value is authoritative.** The runtime replaces `context.currentRequest` with the returned request. Mutations to the input that are not reflected in the return value may be ignored.
- **Prefer returning a new object.** Use spread syntax (`{ ...request, data: { ...request.data, headers: { ... } } }`) to avoid mutating the caller's copy.
- **In-place mutation is technically allowed** because `Request.data` is `Record<string, unknown>`, but it creates tight coupling and is harder to test.
- **Never return `undefined` or throw** unless the plugin genuinely cannot proceed (wrong credentials, server unreachable). A throw will cause the entire request to fail with an auth error.

### Which method takes priority?

When a plugin implements both `apply()` and `negotiate()`, the runtime calls **`negotiate()` only**. `apply()` is never called when `negotiate()` is present. Implement only one method per plugin to avoid confusion.

### Plugin must implement at least one

A plugin that implements neither `apply()` nor `negotiate()` will cause the runtime to throw an error at execution time. The interface allows both to be optional so that:
- `negotiate()`-only plugins satisfy the interface (they don't need apply)
- `apply()`-only plugins satisfy the interface (they don't need negotiate)

