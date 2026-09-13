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
  - **Ant Design 6 by Default:** Use an Ant Design component whenever an appropriate component exists, including simple controls such as `Button`, `Input`, `Checkbox`, `Radio`, `Switch`, `Tooltip`, and `Dropdown`. Ant Design is mandatory for complex components such as `Table`, `Modal`, `Form`, `DatePicker`, and `Select`.
  - **Disallowed Ant Design Components:** Do not use `Col`, `Row`, `Card`. Build those specific layout or presentation patterns with Tailwind instead.
  - **Tailwind v4 CSS:** Use Tailwind for layout (Flex/Grid), spacing, responsive behavior, and small custom presentation elements that Ant Design does not support. Do not recreate an existing Ant Design control with a native element and Tailwind classes.
  - **Ant Design Style Overrides:** When adjusting styles on Ant Design components, first prefer Tailwind utility strings through `className`. If a component exposes `classNames`, check the supported slot keys and use Tailwind utilities there for targeted overrides, for example:

    ```tsx
    classNames={{
      label: 'flex items-center',
    }}
    ```

  - **Spacing Standard:** Use a factor of `5` (e.g., `p-5`, `m-5`, `gap-5`) for all container spacing and layouts.

- **Icons:** Use `lucide-react` for all UI icons.
- **Typography:** Minimum font size is **14px** for readability.
- **Theming:** Wrap the application with Ant Design's `ConfigProvider` and customize global design through its `theme` tokens. The primary brand color is `#b26ce8`; define it as the global `colorPrimary` seed token and let Ant Design derive component states from it. Do not override primary Ant Design controls with unrelated hard-coded accent colors. Default to Light Mode. Apply `dark:` utility classes for Tailwind dark mode support (e.g., `dark:text-white`).
- **Animations:** Use `motion/react` for all UI transitions; avoid raw CSS animations.

## 4. Coding Patterns

- **Components:** Functional components only, with explicit TypeScript interfaces for public props.
- **Feature Structure:** Prefer small, focused components, hooks, and stores. When a file becomes difficult to follow, extract a sub-component, hook, or feature-local helper that clarifies responsibility and keeps state close to the feature.

## 5. Browser Validation

- After implementing frontend changes, use the browser tools to verify the primary user flow yourself before finishing whenever the relevant app can be run locally.
- For changes that affect routing, forms, tables, authentication, uploads, or other interactive behavior, validate the real interaction in the browser instead of relying on code inspection alone.
- When the required app or URL is already open in the VS Code integrated browser, reuse that existing page instead of opening a duplicate tab unless the task needs a separate clean session.