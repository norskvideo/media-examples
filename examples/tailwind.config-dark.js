/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["**/*.{html,js,ejs}", "./node_modules/flowbite/**/*.js"],
  darkMode: "class",
  theme: {
    extend: {},
  },
  corePlugins: {
    aspectRatio: false,
  },
  plugins: [require("@tailwindcss/aspect-ratio"), require("flowbite/plugin")],
};
