// Tailwind v4 wraps all styles in @layer. Phones with an old browser (Chrome older than 99) ignore the whole
// stylesheet and show an unstyled page; the cascade-layers plugin rewrites the layers so they work everywhere.
const config = {
  plugins: ["@tailwindcss/postcss", "@csstools/postcss-cascade-layers"],
};

export default config;
