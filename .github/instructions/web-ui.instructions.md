---
name: Frontend UI Standards
description: Common standards for React frontend code. Use when editing components, hooks, styling, state management, routing, or frontend-to-backend integration.
applyTo: "apps/web/**"
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
  - **Ant Design 6:** Mandatory for complex components: `Table`, `Modal`, `Form`, `DatePicker`, `Select`. Don't use any the following components: `Col`, `Row`, `Card`, `Badge`. For simple components, prefer Tailwind v4 CSS, if you see the above components in existing files, please replace them with Tailwind v4 CSS.
  - **Tailwind v4 CSS:** Use exclusively for layout (Flex/Grid), spacing, and micro-components.
  - **Ant Design Style Overrides:** When adjusting styles on Ant Design components, first prefer Tailwind utility strings through `className`. If a component exposes `classNames`, check the supported slot keys and use Tailwind utilities there for targeted overrides, for example:

    ```tsx
    classNames={{
      label: 'flex items-center',
    }}
    ```

  - **Spacing Standard:** Use a factor of `5` (e.g., `p-5`, `m-5`, `gap-5`) for all container spacing and layouts.

- **Icons:** Use `lucide-react` for all UI icons.
- **Typography:** Minimum font size is **14px** for readability.
- **Theming:** Default to Light Mode. Apply `dark:` utility classes for Tailwind dark mode support (e.g., `dark:text-white`).
- **Animations:** Use `motion/react` for all UI transitions; avoid raw CSS animations.

## 4. Coding Patterns

- **Components:** Functional components only, with explicit TypeScript interfaces for public props.
- **Feature Structure:** Prefer small, focused components, hooks, and stores. When a file becomes difficult to follow, extract a sub-component, hook, or feature-local helper that clarifies responsibility and keeps state close to the feature.

## 5. Browser Validation

- After implementing frontend changes, use the browser tools to verify the primary user flow yourself before finishing whenever the relevant app can be run locally.
- For changes that affect routing, forms, tables, authentication, uploads, or other interactive behavior, validate the real interaction in the browser instead of relying on code inspection alone.
- When the required app or URL is already open in the VS Code integrated browser, reuse that existing page instead of opening a duplicate tab unless the task needs a separate clean session.