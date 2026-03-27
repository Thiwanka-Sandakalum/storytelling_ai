/** @type {import('tailwindcss').Config} */
export default {
     content: [
          "./index.html",
          "./src/**/*.{js,ts,jsx,tsx}",
     ],
     darkMode: "class",
     theme: {
          extend: {
               colors: {
                    "primary": "#c799ff",
                    "primary-container": "#bc87fe",
                    "primary-dim": "#ba85fb",
                    "secondary": "#4af8e3",
                    "secondary-dim": "#33e9d5",
                    "background": "#0e0c20",
                    "surface": "#0e0c20",
                    "surface-container-low": "#131027",
                    "surface-container": "#19162f",
                    "surface-container-high": "#1f1c37",
                    "surface-container-highest": "#25223f",
                    "surface-variant": "#25223f",
                    "surface-bright": "#2b2848",
                    "surface-dim": "#0e0c20",
                    "surface-container-lowest": "#000000",
                    "on-background": "#e7e2ff",
                    "on-surface": "#e7e2ff",
                    "on-surface-variant": "#aca8c3",
                    "outline": "#76738c",
                    "outline-variant": "#48455c",
                    "error": "#ff6e84",
               },
               fontFamily: {
                    "headline": ["Newsreader", "serif"],
                    "body": ["Inter", "sans-serif"],
                    "label": ["Inter", "sans-serif"],
                    "display": ["Playfair Display", "serif"],
               },
               borderRadius: {
                    "xl": "0.75rem",
                    "2xl": "1rem",
                    "3xl": "1.5rem",
               },
               animation: {
                    "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                    "wave": "wave 1.2s ease-in-out infinite",
               },
               keyframes: {
                    wave: {
                         '0%, 100%': { height: '8px' },
                         '50%': { height: '32px' },
                    }
               },
               boxShadow: {
                    "cosmic": "0 0 40px rgba(199, 153, 255, 0.06)",
                    "ignite": "0 0 20px rgba(199, 153, 255, 0.4)",
               },
               textShadow: {
                    "glow": "0 0 20px rgba(199, 153, 255, 0.3)",
               }
          },
     },
     plugins: [],
}
