import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        danger: {
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
        },
        success: {
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        emergency: {
          bg: '#991b1b', // High-contrast Red for Emergency Banner
          text: '#ffffff',
        },
      },
      minHeight: {
        touch: '48px', // WCAG minimum 48px touch target
      },
      minWidth: {
        touch: '48px',
      },
    },
  },
  plugins: [],
};

export default config;
