---
name: Backend Service Standards
description: Strict architecture and coding rules for Fastify 5, TypeScript, TypeBox, and Kysely.
applyTo: "apps/service/**"
---

# Technical Stack Guidelines

## 1. Fastify 5 & Modular Architecture

- **Framework:** Use **Fastify v5**. Adhere to the latest breaking changes (e.g., streamlined hook handling).
- **Structure:**
  - Routes: `src/app/routes/`. Export a `default async function (fastify: FastifyInstance)` for `@fastify/autoload`. Only `GET` and `POST` methods allowed.
  - Plugins: `src/app/plugins/`. Wrap all shared logic with `fastify-plugin` to prevent encapsulation of decorators.
- **Core Logic**
  - Logs: Use `fastify.log`. Never use `console.log`.
  - Function: Use functional programming. Prefer `const` and arrow functions for internal utility logic. Avoid `this` context and `class`.

## 2. Type-Safe Schema Validation (TypeBox)

- **Schema Provider:** Use **TypeBox** for all JSON Schema definitions.
- **Type Integration:** Use `TypeBoxTypeProvider` for all route definitions to achieve seamless TypeScript inference from schemas.
- **Definition:** Every route must include a `schema` object covering `body`, `querystring`, `params`, or `response` where applicable.

## 3. Database Access (Kysely)

- **Query Builder:** Use Kysely for all database interactions. Strictly forbid raw SQL strings.
- **Schema Sync:** Use the generated DB type from `kysely-codegen`.
- **Injection:** Access the database via a Fastify decorator (e.g., `fastify.db`) initialized in `src/app/plugins/db.ts`.

## 4. Error Handling & Logic

- **HTTP Errors:** Use `@fastify/sensible` methods (e.g., `reply.badRequest()`, `reply.internalServerError()`).
- **Business Errors:**
  - **Location:** Centralize in `src/app/errors/business-errors.ts`.
- **Control Flow:** Use `async/await` exclusively. Do not use `reply.send()` in async handlers unless returning early; return the payload directly.

## 5. Coding Patterns

- **Module Boundaries:** Keep routes, schemas, services, and mappers focused on a single responsibility. When a backend file becomes difficult to follow, extract a helper, schema, mapper, or service module that makes the boundary clearer.