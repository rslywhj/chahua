# Wetty Chat Mobile (Frontend)

This is a Progressive Web Application (PWA) that supports desktop, mobile platforms
It uses Ionic Framework v8 and React with Redux as store management and axios as API client

## UI Design

This application should have more or less a native iOS application feel.
For forms / list / input design try to follow iOS native settings app.
Use Ionic Components when applicable, only when native ionic component can't fit our need then design custom styling

## Style Customization

- Use a scss module when possible
- Avoid using inline styles unless it needs to be computed on the fly

## Localization

- This project uses `lingui` for localization (i18n) support.
- When writing UI code that include user visible text, we should use `t` or `Trans` when ever applicable.

## Structuring

- Use clean structure, create a component to abstract reusable / complex component
- Do not create huge monolitic page components that becomes a maintance nightmare
- Use Ionic component when it fits, avoid reinventing the wheel and keep style consistent

## Feature Gating

- New user-visible features should have an explicit flag in `src/features.ts`.
- Gate every frontend entry point for the feature, including buttons, menu items, message actions, routes, and desktop modal branches.
- Prefer default-enabled gates for completed features and default-disabled gates for staged rollout or internal-only features.

## Lint

After making changes, run `npm run verify` and ensure it passes.
`npm run verify` covers both `npm run lint` and `npm run typecheck`.
