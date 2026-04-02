---
name: Frontend UI Standards
description: Common standards for React frontend code. Use when editing components, hooks, styling, state management, routing, or frontend-to-backend integration.
applyTo: 'apps/chatbot/**'
---

# Web Standards

## 1. React 19 & Feature State

- Do not introduce new `useState`, just use `useSetState` from `react-use` as the default local state hook.
- Use `zustand` for shared local feature state and global app state. Prefer a small store over React Context for mutable state that spans multiple components.
- Keep using `react-use` lifecycle helpers such as `useMount` and `useUnmount` when they simplify setup and cleanup.
- Keep state close to the feature. When state is shared inside one feature, colocate a focused `zustand` store with that feature instead of lifting state into distant parents.
- Do not add new broad React Context layers for feature state. Reuse existing top-level providers only for infrastructure concerns, not mutable feature state.
- Follow React 19 patterns already present in the app, including `useEffectEvent` where event handlers need stable closures.

## 2. UI Component Strategy (Ant Design 6)

- **Hybrid Styling:**
  - **Ant Design 6:** Mandatory for complex components: `Table`, `Modal`, `Form`, `DatePicker`, `Select`. Don't use any the following components: `Col`, `Row`, `Card`, `Badge`. For simple components, prefer Tailwind v4 CSS, if you see the above components that can be replaced with Tailwind, please replace them with Tailwind v4 CSS.
  - **Tailwind v4 CSS:** Use exclusively for layout (Flex/Grid), spacing, and micro-components.
  - **Spacing Standard:** Use a factor of `5` (e.g., `p-5`, `m-5`, `gap-5`) for all container spacing and layouts.
- **Icons:** Use `lucide-react` for all UI icons.
- **Typography:** Minimum font size is **14px** for readability.
- **Theming:** Default to Light Mode. Apply `dark:` utility classes for Tailwind dark mode support (e.g., `dark:text-white`).
- **Animations:** Use `motion/react` for all UI transitions; avoid raw CSS animations.

## 3. Desktop Bridge & Backend Calls

- The frontend runs inside the desktop shell and talks to Python through Qt WebChannel, not through a shared OpenAPI client.
- Treat `window.backend` as the primary backend boundary. Guard for its absence during startup and retry only where the existing app already does so.
- Keep QWebChannel setup centralized at the app level. Feature modules should consume the established `window.backend` surface instead of reinitializing the bridge.
- Optional desktop features should be enabled from a dedicated settings toggle, hidden from feature-specific navigation when off, and treated as unavailable unless the backend feature flag is enabled.
- Serialize structured payloads explicitly across the bridge and parse JSON carefully at the boundary.
- Do not invent `fetch`, Axios, or generated API clients for frontend-to-service calls unless the project architecture changes first.

## 4. Coding Patterns

- **Components:** Functional components only, with explicit TypeScript interfaces for public props.
- **Feature Structure:** Prefer small, focused components, hooks, and stores. When a file becomes difficult to follow, extract a sub-component, hook, or feature-local helper that clarifies responsibility and keeps state close to the feature.
