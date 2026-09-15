// PostCSS pipeline that Tailwind requires: it turns the @tailwind directives
// in globals.css into real CSS, then autoprefixer adds vendor prefixes.
/** @type {import('postcss-load-config').Config} */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
