# Tidy's Journal

## Refactors

- **Consolidated shared utilities**: Moved `isValidIsoDate` to `src/utils.js` and added `splitSemicolonList` to handle semicolon-separated tag values consistently across `src/tag_comparisons.js` and potentially other modules.
- **Reduced duplication in comparison logic**: Refactored `arePhonesEqual`, `areEmailsEqual`, and `formatPhone` to use the new shared utilities and a local `getPhoneObject` helper, eliminating redundant splitting and parsing code.
