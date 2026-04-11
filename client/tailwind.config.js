/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'whatsapp-green': '#25D366',
      },
      // ✅ Added animation for footer text
      keyframes: {
        'slide-loop': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' }
        }
      },
      animation: {
        'slide-loop': 'slide-loop 15s linear infinite'
      },
      // ✅ Added background size utilities
      backgroundSize: {
        'zoom-in': '280px',
        'zoom-in-mobile': '220px',
      }
    },
  },
  plugins: [],
}
