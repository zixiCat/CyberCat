---
name: Frontend UI Standards
description: Engineering standards for the CyberCat Chatbot web app, prioritizing react-use hooks and Ant Design 6.
applyTo: 'apps/chatbot/**'
---

# Web Standards

## 1. React 19 & State Strategy

- **Hook Preference:** Avoid native React hooks (e.g., `useState`, `useEffect`) where a `react-use` alternative exists.
  - **State:** Use `useSetState` instead of `useState` for object-based state to allow partial updates.
  - **Lifecycle:** Use `useMount` and `useUnmount` instead of empty-dependency `useEffect` hooks.
  - **Utilities:** Utilize the full `react-use` suite (e.g., `useDebounce`).
- **State/Props Management:**
  - **Trigger:** Use when data is required by >=3 components in the hierarchy.
  - **Constraint:** Do not use React Context or Prop Drilling for shared state.
  - **Pattern:** Favor small, atomic stores over a single monolithic store.

## 2. UI Component Strategy (Ant Design 6)

- **Hybrid Styling:**
  - **Ant Design 6:** Mandatory for complex components: `Table`, `Modal`, `Form`, `DatePicker`, `Select`.
  - **Tailwind v4 CSS:** Use exclusively for layout (Flex/Grid), spacing, and micro-components.
  - **Spacing Standard:** Use a factor of `5` (e.g., `p-5`, `m-5`, `gap-5`) for all container spacing and layouts.
- **Icons:** Use `lucide-react` for all UI icons.
- **Typography:** Minimum font size is **14px** for readability.
- **Theming:** Default to Light Mode. Apply `dark:` utility classes for Tailwind dark mode support (e.g., `dark:text-white`).
- **Animations:** Use `motion/react` for all UI transitions; avoid raw CSS animations.

## 3. Data Fetching & API

- **API Client:** Use `@workshop/workshop-openapi` (aliased as `$api`), which is powered by `openapi-fetch` for type-safe requests generated from the OpenAPI schema.

## 4. Coding Patterns

- **Line Endings:** Enforce **LF** for all project files.
- **Components:** Functional components only, with explicit TypeScript interfaces for props.
- **File Lines:** If possible, keep each file under 300 lines to make the code easier to read and maintain.
