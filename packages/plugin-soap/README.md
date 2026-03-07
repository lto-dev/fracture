# @apiquest/plugin-soap

SOAP protocol plugin for ApiQuest. Provides SOAP 1.1 and SOAP 1.2 request execution with support for WSDL-driven operation invocation, raw XML envelope authoring, WS-Security (UsernameToken and X.509), MTOM attachments, SSL/TLS, proxies, and cookie management.

## Installation

```bash
# Using npm
npm install -g @apiquest/plugin-soap

# Or using fracture CLI
fracture plugin install soap
```

**Note:** This plugin is required for SOAP API testing with `@apiquest/fracture`.

## Features

- SOAP 1.1 and SOAP 1.2 envelope handling with correct Content-Type headers
- WSDL-driven operation mode: select service, port, and operation by name; provide args as a plain object
- Raw envelope mode: author the full XML SOAP envelope and send it as-is
- WS-Security support: UsernameToken and X.509 digital signature
- MTOM/MIME attachment support
- Custom HTTP headers per request
- Cookie jar with persistence (aligned with HTTP plugin behavior)
- SSL/TLS client certificates
- Proxy support (HTTP/HTTPS) with bypass rules
- Redirect handling and timeout configuration
- Transport-level authentication via `@apiquest/plugin-auth` (bearer, basic, OAuth2, API key)

## Usage

Set the collection protocol to `soap`:

```json
{
  "$schema": "https://apiquest.net/schemas/collection-v1.0.json",
  "protocol": "soap",
  "variables": {
    "serviceUrl": "https://service.example.com/WeatherService",
    "wsdlUrl": "https://service.example.com/WeatherService?wsdl"
  },
  "items": [
    {
      "type": "request",
      "id": "get-weather",
      "name": "Get Weather",
      "data": {
        "url": "{{serviceUrl}}",
        "wsdl": "{{wsdlUrl}}",
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
    }
  ]
}
```

### Raw Envelope Mode

Send a pre-authored XML SOAP envelope directly:

```json
{
  "type": "request",
  "id": "get-weather-raw",
  "name": "Get Weather (Raw Envelope)",
  "data": {
    "url": "https://service.example.com/WeatherService",
    "soapVersion": "1.1",
    "soapAction": "http://www.webservicex.net/GetWeather",
    "body": {
      "mode": "raw",
      "raw": "<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:web=\"http://www.webservicex.net\"><soap:Body><web:GetWeather><web:CityName>London</web:CityName><web:CountryName>UK</web:CountryName></web:GetWeather></soap:Body></soap:Envelope>"
    }
  }
}
```

### SOAP 1.2

```json
{
  "data": {
    "url": "https://service.example.com/Service",
    "soapVersion": "1.2",
    "soapAction": "http://example.com/GetData",
    "body": {
      "mode": "operation",
      "args": { "id": "42" }
    }
  }
}
```

### WS-Security: UsernameToken

```json
{
  "data": {
    "url": "https://secure.example.com/Service",
    "wsdl": "https://secure.example.com/Service?wsdl",
    "service": "SecureService",
    "port": "SecureServiceSoap",
    "operation": "GetSecureData",
    "soapVersion": "1.1",
    "body": { "mode": "operation", "args": {} },
    "security": {
      "mode": "usernameToken",
      "username": "{{serviceUser}}",
      "password": "{{servicePass}}"
    }
  }
}
```

### WS-Security: X.509 Digital Signature

```json
{
  "data": {
    "url": "https://secure.example.com/Service",
    "soapVersion": "1.1",
    "body": {
      "mode": "raw",
      "raw": "<soap:Envelope ...>...</soap:Envelope>"
    },
    "security": {
      "mode": "x509",
      "cert": "/path/to/client-cert.pem",
      "key": "/path/to/client-key.pem",
      "passphrase": "{{certPassphrase}}"
    }
  }
}
```

### Runtime Options

Configure SSL, proxy, redirects, timeout, and SOAP-specific settings:

```json
{
  "options": {
    "timeout": { "request": 30000 },
    "followRedirects": true,
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
      "port": 8080
    },
    "plugins": {
      "soap": {
        "keepAlive": true,
        "timeout": 60000,
        "validateCertificates": false,
        "wsdlCache": true
      }
    }
  }
}
```

## Response Handling

Access SOAP response data in post-request scripts:

```javascript
quest.test('Status is 200', () => {
  expect(quest.response.status).to.equal(200);
});

quest.test('No SOAP fault', () => {
  expect(quest.response.to.have.soapFault()).to.be.false;
});

quest.test('Has weather result', () => {
  const parsed = quest.response.soap.parsed;
  expect(parsed).to.be.an('object');
});

quest.test('Raw XML contains expected element', () => {
  expect(quest.response.soap.xml).to.include('GetWeatherResult');
});
```

Access SOAP fault details when the server returns a fault:

```javascript
quest.test('Handle SOAP fault', () => {
  if (quest.response.soap.fault.hasFault) {
    console.log('Fault code:', quest.response.soap.fault.code);
    console.log('Fault reason:', quest.response.soap.fault.reason);
  }
});
```

## Compatibility

- **Authentication:** Works with `@apiquest/plugin-auth` for Bearer, Basic, OAuth2, API Key (transport-level). WS-Security (UsernameToken, X.509) is configured directly in `request.data.security`.
- **SOAP versions:** SOAP 1.1 and SOAP 1.2
- **Node.js:** Requires Node.js 20+

## Documentation

- [Fracture Documentation](https://apiquest.net/docs/fracture)
- [SOAP Plugin API Reference](docs/index.md)
- [Schema Reference](https://apiquest.net/schemas/collection-v1.0.json)

## License

Dual-licensed under AGPL-3.0-or-later and commercial license. See [LICENSE](LICENSE) for details.
