import next from "eslint-config-next";

const config = [
  ...next,
  {
    // Export estático: el estado que depende de localStorage/token sólo puede leerse tras montar
    // (en servidor no existe), por eso se inicializa en efectos. Patrón intencional.
    rules: { "react-hooks/set-state-in-effect": "off", "react-hooks/refs": "off" },
  },
  { ignores: ["out/**", ".next/**", "node_modules/**", "public/sw.js"] },
];
export default config;
