/**
 * Thin wrapper around react-i18next's useTranslation.
 *
 * All components should import from here rather than directly from
 * react-i18next, providing a single choke-point for future customization
 * (e.g. namespace defaults, interpolation overrides).
 */
export { useTranslation } from "react-i18next";
