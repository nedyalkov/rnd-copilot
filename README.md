# OfficeRnD OAuth2 Integration Example (NestJS)

This project demonstrates a robust OfficeRnD OAuth2 integration using NestJS, TypeScript, and MongoDB (Mongoose). It is designed for secure, maintainable, and testable integration with OfficeRnD FLEX APIs, including full OAuth2 flow and integration secret management.

## Features

- **NestJS** backend with TypeScript
- **MongoDB** via Mongoose for token and metadata storage
- **OfficeRnD OAuth2**: start, return, and check endpoints
- **Integration secret handshake** after OAuth connection
- **Environment variable management** via `.env` and `@nestjs/config`
- **Prettier** and VS Code settings for consistent formatting
- **Comprehensive tests**: unit, integration, and controller
- **Package manager**: yarn

## Setup

1. **Install dependencies:**
   ```sh
   yarn install
   ```
2. **Configure environment:**

- Copy `.env.example` to `.env` and fill in your OfficeRnD credentials and URLs.
  - Ensure `OAUTH_SCOPES` includes `flex.settings.integrations.read`, as it is required to setup connection.

3. **Run the app:**
   ```sh
   yarn start:dev
   ```
4. **Run tests:**
   ```sh
   yarn jest
   ```

## Key Endpoints

- `GET /oauth/start` – Initiate OAuth2 flow
- `GET /oauth/return` – Handle OAuth2 callback and store tokens
- `GET /oauth/check` – Check connection validity

## Code Structure

- `src/oauth.controller.ts` – Handles OAuth2 endpoints
- `src/oauth.service.ts` – Business logic for OAuth2 and integration secret
- `src/oauth.schema.ts` – Mongoose schema for tokens
- `src/config/configuration.ts` – Centralized config loader
- `src/oauth.*.spec.ts` – Tests for controller, service, and schema

## Formatting & Linting

- Run `yarn format:write` to auto-format code
- Prettier and ESLint are pre-configured

## License

MIT (example)
