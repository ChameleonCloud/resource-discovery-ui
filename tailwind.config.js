/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#9ad61a",
          info: "#239ff0",
          success: "#74a93c",
          danger: "#ff0000",
        },
        link: {
          DEFAULT: "#4564E2",
          hover: "#2844B9",
        },
        grey: {
          dark: "#494949",
          DEFAULT: "#7e7e7e",
          med: "#aaaaaa",
          light: "#e5e5e5",
          lighter: "#f2f2f2",
        },
      },
    },
  },
  plugins: [],
};
