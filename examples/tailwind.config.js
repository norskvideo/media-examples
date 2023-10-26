/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["**/*.{html,js,ejs}", "./node_modules/flowbite/**/*.js"],
  darkMode: "media",
  theme: {
    extend: {},
  },
  corePlugins: {
    aspectRatio: false,
  },
  plugins: [require("@tailwindcss/aspect-ratio"), require("flowbite/plugin")],
};
