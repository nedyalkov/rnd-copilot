# OAuth Module

This module implements the OfficeRnD OAuth2 integration for the application.

## Features

- Full OAuth2 flow: start, return, and check endpoints
- If the OAuth is used and the token has expired, it gets refreshed automatically
- Secure token exchange and refresh logic
- Fetches and stores the OfficeRnD integration secret after connection
- Stores all tokens and metadata in MongoDB
- Strong typing and robust error handling
- DTOs for controller query parameters
- Comprehensive tests with proper mocking

## Main Files

- `oauth.controller.ts` – Handles all OAuth2-related HTTP endpoints
- `oauth.service.ts` – Contains business logic for OAuth2, token storage, and integration secret handshake
- `oauth.schema.ts` – Mongoose schema for OAuth tokens and metadata
- `oauth.controller.spec.ts`, `oauth.service.integration.spec.ts` – Tests for controller and service

## Endpoints

- `GET /oauth/start` – Redirects to OfficeRnD OAuth2 authorization
- `GET /oauth/return` – Handles OAuth2 callback, stores tokens, fetches integration secret
- `GET /oauth/check` – Checks if the current connection is valid

## Environment Variables

- All configuration is loaded via the central config loader and `.env` file
- Required scopes for this module: `flex.settings.integrations.read`

## Usage

Import the module and its controller/service into your main application module. Ensure MongoDB and environment variables are configured.
