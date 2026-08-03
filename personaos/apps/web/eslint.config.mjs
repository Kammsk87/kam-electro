import baseConfig from "../../eslint.config.mjs";
import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...baseConfig,
  ...nextVitals,
  {
    ignores: ["next-env.d.ts"]
  }
];

export default config;
