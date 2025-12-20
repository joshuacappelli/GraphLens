/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,ts,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        main: {
          dark: '#222831',
          light: '#31363F',
          base: '#24273A',
          mantle: '#1E2030',
          crust: '#181926',
        }
      }
    }
  }
}

