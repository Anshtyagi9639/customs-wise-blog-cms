import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Uploaded images are served from the local uploads folder at their stored size; there is no image optimiser
      // in this prototype (production would use the image host's sized URLs).
      "@next/next/no-img-element": "off",
      // Plain links are used on purpose: every screen reloads from the store, so what is shown is always what is saved.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "data/**"]),
]);

export default eslintConfig;
