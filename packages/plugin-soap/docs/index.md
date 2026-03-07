# SOAP Plugin

SOAP 1.1 and SOAP 1.2 protocol plugin for ApiQuest Fracture. Supports WSDL-driven operation invocation, raw XML envelope authoring, WS-Security, MTOM attachments, proxy, SSL/TLS, and cookie management.

## Installation

```bash
# Using npm
npm install -g @apiquest/plugin-soap

# Or using fracture CLI
fracture plugin install soap
```

## Protocol API

The SOAP plugin extends the [`quest`](../../fracture/api_reference) object with SOAP-specific properties and methods via [`protocolAPIProvider()`].

### quest.request

#### Properties

```javascript
quest.request.url    // "https://service.example.com/WeatherService" — SOAP service endpoint
                     // This is where the HTTP POST is sent, not the WSDL location.
```

#### Headers

```javascript
quest.request.headers.get('Authorization')                      // Get header value (case-insensitive)
quest.request.headers.add({key: 'X-Custom', value: 'value'})    // Add header
quest.request.headers.remove('X-Old')                           // Remove header
quest.request.headers.upsert({key: 'User-Agent', value: '...'}) // Add or update header
quest.request.headers.toObject()                                // All headers as object
```

#### SOAP-Specific Request Properties

```javascript
quest.request.soap.version               // "1.1" or "1.2" — SOAP version
quest.request.soap.action                // "http://example.com/GetWeather" — SOAPAction value
quest.request.soap.operation             // "GetWeather" — WSDL operation name
quest.request.soap.envelope.get()        // Get current raw XML envelope string (null in operation mode)
quest.request.soap.envelope.set('<soap:Envelope...>')  // Replace envelope (switches to raw mode)
```

**Note:** `quest.request.soap.envelope.get()` returns `null` when the request uses WSDL operation mode (`body.mode = 'operation'`), because the envelope is built at dispatch time. Use `quest.request.soap.envelope.set()` in pre-request scripts to override or inject a custom envelope before dispatch.

### quest.response

#### Status

```javascript
quest.response.status           // 200 - HTTP status code
quest.response.statusText       // "OK" - HTTP status text
```

#### Body

```javascript
quest.response.body             // Raw XML SOAP envelope string
quest.response.text()           // Alias for .body — returns the raw XML string
quest.response.json()           // Attempts to parse the body as JSON; returns {} if parsing fails
                                // Prefer quest.response.soap.parsed for most SOAP use cases
```

#### Headers

```javascript
quest.response.headers.get('content-type')   // Get header value (case-insensitive)
                                              // Returns string | string[] | null
quest.response.headers.has('content-type')   // Check if header exists
quest.response.headers.toObject()            // All headers as object
```

#### SOAP-Specific Response Properties

```javascript
quest.response.soap.xml           // Full raw XML SOAP envelope string
quest.response.soap.parsed        // Parsed representation of the SOAP body content as a plain object
quest.response.soap.fault.hasFault   // true if response contains a SOAP Fault element
quest.response.soap.fault.code       // Fault code (faultcode in 1.1, Code/Value in 1.2), or null
quest.response.soap.fault.reason     // Fault reason string, or null
quest.response.soap.fault.detail     // Fault detail content as string, or null
```

#### Metrics

```javascript
quest.response.duration         // 145 — Response duration in milliseconds
quest.response.size             // 1234 — Response body size in bytes
```

#### Assertion Helpers

```javascript
quest.response.to.be.ok                        // true if status === 200
quest.response.to.be.success                   // true if status 2xx
quest.response.to.be.clientError               // true if status 4xx
quest.response.to.be.serverError               // true if status 5xx
quest.response.to.have.status(200)             // true if status matches
quest.response.to.have.header('content-type')  // true if header exists
quest.response.to.have.soapFault()             // true if response contains a SOAP Fault element
```

## Request Data Structure

Basic structure (see [Collection Schema](../../fracture/quest_schema_spec.md) for full details):

```json
{
  "url": "https://service.example.com/WeatherService",
  "wsdl": "https://service.example.com/WeatherService?wsdl",
  "service": "WeatherService",
  "port": "WeatherServiceSoap",
  "operation": "GetWeather",
  "soapVersion": "1.1",
  "body": {
    "mode": "operation",
    "args": {
      "CityName": "London",
      "CountryName": "UK"
    }
  }
}
```

### Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | string | Always | SOAP service endpoint URL — where the POST is sent |
| `wsdl` | string | When `body.mode = 'operation'` | WSDL location (URL or file path). Used to build envelope and derive SOAPAction |
| `service` | string | When `body.mode = 'operation'` | WSDL service name |
| `port` | string | When `body.mode = 'operation'` | WSDL port name |
| `operation` | string | When `body.mode = 'operation'` | WSDL operation name. Also used to set SOAPAction from WSDL binding |
| `soapVersion` | `'1.1'` \| `'1.2'` | No | Defaults to `'1.1'` |
| `soapAction` | string | No | SOAPAction override. Derived from WSDL operation if not set. For SOAP 1.1 this becomes the `SOAPAction` HTTP header |
| `headers` | object | No | Additional HTTP headers (merged with protocol headers) |
| `body` | object | No | Body mode configuration |
| `attachments` | array | No | MTOM/MIME attachments |
| `security` | object | No | WS-Security configuration |

### Body Modes

**Operation mode (WSDL-driven):**

The plugin loads the WSDL, resolves namespace bindings, and constructs the XML envelope from the `args` object. Namespaces are automatically correct.

```json
{
  "body": {
    "mode": "operation",
    "args": {
      "CityName": "London",
      "CountryName": "UK"
    }
  }
}
```

**Raw mode (user-authored XML envelope):**

The plugin sends the XML string as the request body without modification. The user is responsible for namespace correctness and envelope structure.

```json
{
  "body": {
    "mode": "raw",
    "raw": "<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:web=\"http://www.webservicex.net\"><soap:Body><web:GetWeather><web:CityName>London</web:CityName><web:CountryName>UK</web:CountryName></web:GetWeather></soap:Body></soap:Envelope>"
  }
}
```

Use raw mode when:
- No WSDL is available
- The WSDL is inaccurate but the service still accepts a specific envelope format
- You need to test the service's response to a deliberately invalid or edge-case envelope
- Replaying a captured SOAP request

### WSDL and Endpoint URL

The `url` field is the **service endpoint** — where the HTTP POST is sent. The `wsdl` field is the **WSDL document location** used to parse the service contract. They can differ (e.g., WSDL from a staging discovery URL, endpoint pointing to a production host).

To share the same WSDL across multiple requests in a collection, use a collection variable:

```json
{
  "variables": {
    "wsdlUrl": "https://service.example.com/WeatherService?wsdl"
  },
  "items": [
    {
      "data": {
        "url": "https://service.example.com/WeatherService",
        "wsdl": "{{wsdlUrl}}",
        "operation": "GetWeather",
        "body": { "mode": "operation", "args": { "CityName": "London" } }
      }
    },
    {
      "data": {
        "url": "https://service.example.com/WeatherService",
        "wsdl": "{{wsdlUrl}}",
        "operation": "GetCityForecast",
        "body": { "mode": "operation", "args": { "City": "London" } }
      }
    }
  ]
}
```

Each request is independent and self-contained. Multiple requests can reference the same WSDL operation — or different operations from the same WSDL.

## WS-Security

WS-Security adds a `<wsse:Security>` header to the SOAP envelope. It is configured via `request.data.security` and is separate from transport-level auth (which is handled by `@apiquest/plugin-auth`).

### UsernameToken

Embeds username and password credentials in the SOAP envelope:

```json
{
  "security": {
    "mode": "usernameToken",
    "username": "{{serviceUser}}",
    "password": "{{servicePass}}"
  }
}
```

### X.509 Digital Signature

Signs the SOAP envelope using an X.509 certificate and private key:

```json
{
  "security": {
    "mode": "x509",
    "cert": "/path/to/client-cert.pem",
    "key": "/path/to/client-key.pem",
    "passphrase": "{{keyPassphrase}}"
  }
}
```

Signature behavior (algorithm defaults) can be tuned via `options.plugins.soap.securityOptions`:

```json
{
  "options": {
    "plugins": {
      "soap": {
        "securityOptions": {
          "signatureAlgorithm": "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
          "digestAlgorithm": "http://www.w3.org/2001/04/xmlenc#sha256"
        }
      }
    }
  }
}
```

## Attachments

MTOM/MIME attachments are base64-encoded content referenced by content ID:

```json
{
  "attachments": [
    {
      "contentId": "attachment-1",
      "contentType": "application/pdf",
      "filename": "report.pdf",
      "contentBase64": "JVBERi0xLjQK..."
    }
  ]
}
```

## Runtime Options

Configure SOAP-specific options via `options.plugins.soap`. These override collection-level defaults.

```json
{
  "options": {
    "timeout": { "request": 30000 },
    "followRedirects": true,
    "maxRedirects": 5,
    "ssl": {
      "validateCertificates": true,
      "clientCertificate": {
        "cert": "/path/to/cert.pem",
        "key": "/path/to/key.pem",
        "passphrase": "{{certPass}}"
      },
      "ca": "/path/to/ca.pem"
    },
    "proxy": {
      "enabled": true,
      "host": "proxy.example.com",
      "port": 8080,
      "auth": {
        "username": "proxyuser",
        "password": "{{proxyPass}}"
      },
      "bypass": ["localhost", "*.internal.com"]
    },
    "plugins": {
      "soap": {
        "keepAlive": true,
        "timeout": 60000,
        "followRedirects": true,
        "maxRedirects": 5,
        "validateCertificates": true,
        "wsdlCache": true
      }
    }
  }
}
```

### Plugin Options Schema

Options in `options.plugins.soap` override collection-level options:

| Option | Type | Default | Description |
|---|---|---|---|
| `keepAlive` | boolean | true | Keep TCP connections alive between requests |
| `timeout` | number | 30000 | Request timeout in ms (overrides `options.timeout.request`) |
| `followRedirects` | boolean | true | Follow HTTP redirects automatically |
| `maxRedirects` | number | 5 | Maximum redirects to follow |
| `validateCertificates` | boolean | true | Validate SSL/TLS certificates (overrides `options.ssl.validateCertificates`) |
| `wsdlCache` | boolean | true | Cache parsed WSDL documents in memory during a run |

Extended SOAP options (read directly from `options.plugins.soap` at runtime):

| Option | Type | Description |
|---|---|---|
| `parseOptions.ignoreNamespaces` | boolean | Strip XML namespace prefixes from parsed output |
| `parseOptions.preserveAttributes` | boolean | Include XML attributes in parsed output |
| `securityOptions.signatureAlgorithm` | string | XML digital signature algorithm URI |
| `securityOptions.digestAlgorithm` | string | XML digest algorithm URI |

## Environment Variables

The SOAP plugin respects standard proxy environment variables:
- `HTTP_PROXY` / `http_proxy` — HTTP proxy URL
- `HTTPS_PROXY` / `https_proxy` — HTTPS proxy URL
- `NO_PROXY` / `no_proxy` — Comma-separated list of hosts to bypass proxy

## Authentication

Transport-level authentication is handled by `@apiquest/plugin-auth`. The plugin applies auth headers before the SOAP plugin dispatches the request:

```json
{
  "protocol": "soap",
  "auth": {
    "type": "bearer",
    "data": {
      "token": "{{apiToken}}"
    }
  }
}
```

Supported transport-level auth types: `bearer`, `basic`, `oauth2`, `apikey`.

WS-Security (`usernameToken`, `x509`) is configured separately in `request.data.security` and is implemented inside the SOAP plugin, not via `plugin-auth`.

See [Authentication Plugins](../plugin-auth/index.md) for transport-level auth details.

## SOAP Version Behavior

### SOAP 1.1

- **Content-Type:** `text/xml; charset=utf-8`
- **SOAPAction header:** Standalone HTTP header — `SOAPAction: "http://example.com/GetWeather"`
- **Envelope namespace:** `http://schemas.xmlsoap.org/soap/envelope/`

### SOAP 1.2

- **Content-Type:** `application/soap+xml; charset=utf-8; action="http://example.com/GetWeather"`
- **No standalone SOAPAction header** — action is embedded in the Content-Type parameter
- **Envelope namespace:** `http://www.w3.org/2003/05/soap-envelope`

## Cookie Management

The SOAP plugin integrates with Fracture's cookie jar:
- Automatically sends relevant cookies with requests (domain/path matching)
- Stores `Set-Cookie` headers from responses (including SOAP fault responses)
- Cookies persist across requests in the same run

Access cookies in scripts via [`quest.cookies`](../../fracture/api_reference.md#questcookies).

## Plugin Configuration

### Protocols Provided

- `soap`

### Supported Authentication Types (transport-level)

- `bearer`, `basic`, `oauth2`, `apikey`
- Accepts additional auth plugins (`strictAuthList: false`)

## Script Examples

### Check for SOAP fault and extract reason

```javascript
quest.test('No SOAP fault', () => {
  expect(quest.response.to.have.soapFault()).to.be.false;
});

if (quest.response.soap.fault.hasFault) {
  console.log('Fault code:', quest.response.soap.fault.code);
  console.log('Fault reason:', quest.response.soap.fault.reason);
}
```

### Access parsed response body

```javascript
quest.test('Response contains result', () => {
  const parsed = quest.response.soap.parsed;
  expect(parsed).to.be.an('object');
});
```

### Modify envelope in pre-request script

```javascript
// Add a custom SOAP header to the envelope before dispatch (raw mode only)
const currentXml = quest.request.soap.envelope.get();
if (currentXml !== null) {
  const modified = currentXml.replace(
    '<soap:Body>',
    '<soap:Header><CustomHeader>value</CustomHeader></soap:Header><soap:Body>'
  );
  quest.request.soap.envelope.set(modified);
}
```

### Add HTTP headers in pre-request script

```javascript
quest.request.headers.add({ key: 'X-Correlation-ID', value: quest.variables.get('correlationId') });
```

## Usage Example

```json
{
  "$schema": "https://apiquest.net/schemas/collection-v1.0.json",
  "protocol": "soap",
  "variables": {
    "serviceUrl": "https://www.webservicex.net/globalweather.asmx",
    "wsdlUrl": "https://www.webservicex.net/globalweather.asmx?wsdl",
    "city": "London"
  },
  "items": [
    {
      "type": "request",
      "id": "get-weather",
      "name": "Get Weather",
      "data": {
        "url": "{{serviceUrl}}",
        "wsdl": "{{wsdlUrl}}",
        "service": "GlobalWeather",
        "port": "GlobalWeatherSoap",
        "operation": "GetWeather",
        "soapVersion": "1.1",
        "body": {
          "mode": "operation",
          "args": {
            "CityName": "{{city}}",
            "CountryName": "United Kingdom"
          }
        }
      },
      "postRequestScript": "quest.test('Success', () => {\n  expect(quest.response.to.be.success).to.be.true;\n  expect(quest.response.to.have.soapFault()).to.be.false;\n});"
    }
  ]
}
```
