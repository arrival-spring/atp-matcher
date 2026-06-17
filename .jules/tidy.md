# Tidy's Journal

## Refactors

- **Consolidated shared utilities**: Moved `isValidIsoDate` to `src/utils.js` and added `splitSemicolonList` to handle semicolon-separated tag values consistently across `src/tag_comparisons.js` and potentially other modules.
- **Reduced duplication in comparison logic**: Refactored `arePhonesEqual`, `areEmailsEqual`, and `formatPhone` to use the new shared utilities and a local `getPhoneObject` helper, eliminating redundant splitting and parsing code.
- **Consolidated wildcard tag expansion**: Extracted the duplicated wildcard expansion logic (used in `src/result_processor.js` and `src/validate_spiders.js`) into a new shared utility `getExpandedTags` in `src/utils.js`.
- **Consolidated pagination logic**: Introduced `PaginationHelper` component in `src/frontend/components/Common.jsx` to unify duplicated pagination calculation logic (totalPages, effectivePage, pageData) across multiple frontend components.
