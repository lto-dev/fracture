# @apiquest/plugin-graphql

GraphQL protocol plugin for ApiQuest. Provides support for GraphQL queries, mutations, and subscriptions with variable support.

## Installation

```bash
npm install -g @apiquest/plugin-graphql
```

## Features

- GraphQL queries and mutations
- Variable support
- Operation name specification (for multi-operation documents)
- Custom HTTP headers
- Fragment support
- Authentication integration (via `@apiquest/plugin-auth`)

## Usage

Set the collection protocol to `graphql`:

```json
{
  "$schema": "https://apiquest.net/schemas/collection-v1.0.json",
  "protocol": "graphql",
  "items": [
    {
      "type": "request",
      "id": "get-user",
      "name": "Get User by ID",
      "data": {
        "url": "https://api.example.com/graphql",
        "query": "query GetUser($id: ID!) {\n  user(id: $id) {\n    id\n    name\n    email\n  }\n}",
        "variables": {
          "id": "{{userId}}"
        }
      }
    }
  ]
}
```

### Mutation Example

```json
{
  "type": "request",
  "id": "create-user",
  "name": "Create User",
  "data": {
    "url": "https://api.example.com/graphql",
    "mutation": "mutation CreateUser($input: UserInput!) {\n  createUser(input: $input) {\n    id\n    name\n    email\n  }\n}",
    "variables": {
      "input": {
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  }
}
```

### With Custom Headers

```json
{
  "data": {
    "url": "https://api.example.com/graphql",
    "query": "{ users { id name } }",
    "headers": {
      "x-api-version": "2024-01-01",
      "x-request-id": "{{$guid}}"
    }
  }
}
```

### Multi-Operation Documents

```json
{
  "data": {
    "url": "https://api.example.com/graphql",
    "query": "query GetUser { user { id } }\nquery GetPosts { posts { id } }",
    "operationName": "GetUser"
  }
}
```

## Response Handling

Access GraphQL response data in post-request scripts:

```javascript
quest.test('Query successful', () => {
  expect(quest.response.status).to.equal(200);
});

quest.test('No GraphQL errors', () => {
  const body = quest.response.json();
  expect(body.errors).to.be.undefined;
});

quest.test('User data returned', () => {
  const body = quest.response.json();
  expect(body.data.user).to.be.an('object');
  expect(body.data.user.id).to.be.a('string');
});
```

## Compatibility

- **Authentication:** Works with `@apiquest/plugin-auth` for Bearer, Basic, OAuth2, API Key
- **Node.js:** Requires Node.js 20+

## Documentation

- [Fracture Documentation](https://apiquest.net/docs/fracture)
- [Schema Reference](https://apiquest.net/schemas/collection-v1.0.json)

## License

Dual-licensed under AGPL-3.0-or-later and commercial license. See LICENSE.txt for details.
