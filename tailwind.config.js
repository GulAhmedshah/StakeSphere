/**
 * This content block contains the configuration for both `tailwind.config.js` and the global `index.css`.
 * In a real project, these would be two separate files.
 */

// FILE: tailwind.config.js

const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        primary: '#6366f1',    // Indigo 500
        secondary: '#8b5cf6',  // Violet 500
        accent: '#d946ef',     // Fuchsia 500
      },
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      animation: {
        'pulse-slow': 'pulse-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'pulse-slow': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.7 },
        }
      },
      screens: {
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
    },
  },
  plugins: [],
};


// FILE: frontend/src/index.css
/*
 In your project, create this file at `frontend/src/index.css` 
 and import it in your main entry file (e.g., `frontend/src/index.js`)
*/

@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom CSS Variables for Theming */
@layer base {
  :root {
    --color-primary: 63 66 241;   /* #6366f1 */
    --color-secondary: 139 92 246; /* #8b5cf6 */
    --color-accent: 217 70 239;  /* #d946ef */

    --color-background-start: 15 23 42; /* slate-900 */
    --color-background-end: 30 41 59; /* slate-800 */

    --color-text: 226 232 240; /* slate-200 */
    --color-text-muted: 148 163 184; /* slate-400 */
  }
}

/* Global Styles */
@layer base {
  html, body, #root {
    @apply min-h-screen bg-slate-900 text-slate-200;
    font-family: 'Inter', sans-serif;
  }

  body {
    @apply bg-gradient-to-br from-slate-900 to-slate-800;
  }

  /* Style interactive elements */
  input, textarea, select {
    @apply bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 w-full;
    @apply focus:outline-none focus:ring-2 focus:ring-primary/80 focus:border-primary/50 transition-all duration-200;
  }

  a {
    @apply text-primary hover:text-indigo-400 transition-colors duration-200;
  }
}

/* Custom Components Layer */
@layer components {
  /* Button Styles */
  .btn {
    @apply px-6 py-2.5 rounded-lg font-semibold text-white shadow-md transition-all duration-300 ease-in-out;
    @apply focus:outline-none focus:ring-4 focus:ring-opacity-50;
  }

  .btn-primary {
    @apply btn bg-primary hover:bg-indigo-500 focus:ring-indigo-400;
  }

  .btn-secondary {
    @apply btn bg-secondary hover:bg-violet-500 focus:ring-violet-400;
  }

  /* Card Style with Glassmorphism */
  .card {
    background-color: rgba(30, 41, 59, 0.5); /* bg-slate-800/50 */
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    @apply border border-slate-700/50 rounded-2xl shadow-lg p-6;
  }
}

/* Custom Utilities Layer */
@layer utilities {
  .gradient-text {
    @apply bg-gradient-to-r from-primary to-accent;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  
  /* For responsive design: center content */
  .container-responsive {
     @apply container mx-auto px-4 sm:px-6 lg:px-8;
  }
}
