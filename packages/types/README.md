# @apiquest/types

Shared TypeScript type definitions for the ApiQuest ecosystem.

## Installation

```bash
npm install @apiquest/types
```

## Usage

```typescript
import type {
  Collection,
  Request,
  Folder,
  Environment,
  RunOptions,
  RunResult,
  IProtocolPlugin,
  IAuthPlugin,
  IValueProviderPlugin
} from '@apiquest/types';
```

## Type Exports

- **Collection Types:** Collection, Request, Folder, CollectionItem, CollectionInfo
- **Auth Types:** Auth, BearerAuth, BasicAuth, ApiKeyAuth, OAuth2Auth
- **Environment:** Environment, Variable
- **Runtime:** RunOptions, RunResult, RuntimeOptions
- **Plugins:** IProtocolPlugin, IAuthPlugin, IValueProviderPlugin
- **Execution:** ExecutionContext, ProtocolResponse, ValidationResult

## Schema

JSON Schema: https://apiquest.net/schemas/collection-v1.0.json

## Compatibility

- TypeScript 5.0+
- Used with `@apiquest/fracture` and plugin development

## Documentation

- [Fracture Documentation](https://apiquest.net/docs/fracture)
- [Schema Specification](https://apiquest.net/schemas/collection-v1.0.json)

## License

Dual-licensed under AGPL-3.0-or-later and commercial license. See LICENSE.txt for details.
