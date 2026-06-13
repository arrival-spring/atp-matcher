# Tidy's Journal - Architectural Debt

## Recurring "Code Smells"

- **Duplicated ATP Tag Filtering:** The logic to filter out internal ATP properties (starting with `@` or `nsi_id`) is duplicated in `src/result_processor.js` and `src/main.js`. This should be a shared utility.
- **Missing Browser Globals:** Frontend files in `src/frontend/` trigger ESLint errors for `window` and `document` because browser globals are not enabled in `eslint.config.js`.

## Style Guide Exceptions

- None discovered yet.

## Failed Refactors

- **Automated Frontend Tidy:** Attempting to automatically silence "unused" `h` and `Fragment` imports in JSX files broke the frontend, as these are implicitly used by JSX compilation. Manual intervention or better ESLint rules (like `react/jsx-uses-react`) are needed, or simply enabling the `jsx: true` option in ESLint config and using a plugin that understands Preact/React.
