# @apiquest/plugin-sse

Server-Sent Events (SSE) protocol plugin for ApiQuest. Provides support for testing SSE endpoints with event streaming and message validation.

## Installation

```bash
npm install -g @apiquest/plugin-sse
```

## Features

- SSE connection management
- Event streaming with named events
- Message data validation
- Event counting and assertions
- Custom headers support
- Authentication integration (via `@apiquest/plugin-auth`)
- Timeout configuration

## Usage

Set the collection protocol to `sse`:

```json
{
  "$schema": "https://apiquest.net/schemas/collection-v1.0.json",
  "protocol": "sse",
  "items": [
    {
      "type": "request",
      "id": "stream-events",
      "name": "Stream Server Events",
      "data": {
        "url": "https://api.example.com/events",
        "timeout": 30000,
        "scripts": [
          {
            "event": "onMessage",
            "script": "quest.test('Message received', () => {\n  const msg = quest.message;\n  expect(msg.data).to.be.a('string');\n});"
          },
          {
            "event": "onComplete",
            "script": "quest.test('Stream completed', () => {\n  expect(quest.messages.length).to.be.greaterThan(0);\n});"
          }
        ]
      }
    }
  ]
}
```

### With Custom Headers

```json
{
  "data": {
    "url": "https://api.example.com/stream",
    "headers": {
      "Accept": "text/event-stream",
      "x-stream-id": "{{streamId}}"
    },
    "timeout": 60000
  }
}
```

### Event Scripts

SSE requests support event-based scripts:

- **onMessage** - Runs for each received message
- **onError** - Runs when an error occurs
- **onComplete** - Runs when the stream completes

```json
{
  "data": {
    "scripts": [
      {
        "event": "onMessage",
        "script": "const data = JSON.parse(quest.message.data);\nquest.variables.set('lastEventId', data.id);\n\nquest.test('Valid event data', () => {\n  expect(data).to.have.property('timestamp');\n});"
      },
      {
        "event": "onError",
        "script": "console.error('Stream error:', quest.error);"
      },
      {
        "event": "onComplete",
        "script": "quest.test('Received messages', () => {\n  expect(quest.messages.length).to.equal(10);\n});"
      }
    ]
  }
}
```

### Message Counting

Use `quest.expectMessages()` in the preRequestScript to enable deterministic test counting:

```json
{
  "type": "request",
  "id": "stream-events",
  "name": "Stream Server Events",
  "preRequestScript": "quest.expectMessages(5, 10000);",
  "data": {
    "url": "https://api.example.com/events",
    "scripts": [
      {
        "event": "onMessage",
        "script": "quest.test('Message received', () => {\n  expect(quest.message.data).to.exist;\n});"
      }
    ]
  }
}
```

This informs the runner to expect 5 messages, enabling accurate test count reporting (5 messages × tests per message).

## Response Handling

Access SSE data in scripts:

```javascript
// In onMessage script
quest.test('Event has data', () => {
  expect(quest.message.data).to.be.a('string');
});

quest.test('Event type is update', () => {
  expect(quest.message.event).to.equal('update');
});

// In onComplete script
quest.test('Received all messages', () => {
  expect(quest.messages.length).to.equal(5);
});

quest.test('All messages valid', () => {
  quest.messages.forEach(msg => {
    const data = JSON.parse(msg.data);
    expect(data).to.have.property('id');
  });
});
```

## Compatibility

- **Authentication:** Works with `@apiquest/plugin-auth` for Bearer, Basic, API Key
- **Node.js:** Requires Node.js 20+

## Documentation

- [Fracture Documentation](https://apiquest.net/docs/fracture)
- [Schema Reference](https://apiquest.net/schemas/collection-v1.0.json)

## License

Dual-licensed under AGPL-3.0-or-later and commercial license. See LICENSE.txt for details.
