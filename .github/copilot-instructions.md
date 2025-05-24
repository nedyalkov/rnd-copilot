<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

This is a NestJS + TypeScript application meant to integration with the OfficeRnD OAuth2 backend. Use idiomatic NestJS and TypeScript best practices. All backend code should be placed in the `src` directory.
The application should be structured with clear separation of concerns, including controllers, services, and schemas. Use Mongoose for MongoDB interactions and ensure all environment variables are managed via the `.env` file.
The application should include comprehensive tests for all components, including unit tests for controllers and services, and integration tests for the OAuth flow. Use Jest as the testing framework.

Ensure that the code is well-documented, with clear comments explaining the purpose of each module, function, and significant logic. Follow best practices for error handling and logging.
The application should also include a README file with setup instructions, key endpoints, and code structure overview. Use Prettier for code formatting and ensure consistent style across the project.
The application should be designed to be easily extendable for future features, such as additional OAuth providers or enhanced integration capabilities with OfficeRnD APIs.

Make sure to use yarn as the package manager for dependency management, and include scripts for starting the application, running tests, and formatting code. The project should be set up to run in a development environment with hot reloading capabilities.
