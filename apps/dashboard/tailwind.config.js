/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        'pulse-dim': {
          '0%, 100%': { opacity: '0.4' },
          '50%':       { opacity: '0.7' },
        },
        'orb-breathe': {
          '0%, 100%': { transform: 'scale(0.85)' },
          '50%':       { transform: 'scale(1.15)' },
        },
        'ring-out': {
          '0%':   { transform: 'scale(1)',   opacity: '0.3' },
          '100%': { transform: 'scale(1.5)', opacity: '0'   },
        },
        'dot-bob': {
          '0%, 100%': { transform: 'scale(1)'   },
          '50%':       { transform: 'scale(1.4)' },
        },
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)'    },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%':   { opacity: '0', transform: 'translateY(40px)' },
          '100%': { opacity: '1', transform: 'translateY(0)'    },
        },
        'reveal-type': {
          'from': { clipPath: 'inset(0 100% 0 0)' },
          'to':   { clipPath: 'inset(0 0% 0 0)'   },
        },
      },
      animation: {
        'pulse-dim':   'pulse-dim 3s ease infinite',
        'orb-breathe': 'orb-breathe 1.4s ease-in-out infinite',
        'ring-out':    'ring-out 2s ease-out infinite',
        'dot-bob':     'dot-bob 0.6s ease infinite',
        'fade-up':     'fade-up 0.3s ease-out forwards',
        'fade-in':     'fade-in 0.4s ease-out forwards',
        'slide-up':    'slide-up 0.4s ease-out forwards',
        'reveal-type': 'reveal-type 0.5s steps(18, end) forwards',
      },
    },
  },
  plugins: [],
}
