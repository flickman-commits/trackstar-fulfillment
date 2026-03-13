/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // Brand Colors
        'off-white': '#F6F5F2',
        'off-black': '#121212',
        'border-gray': '#E5E5E5',
        'subtle-gray': '#FAFAFA',
        'success-green': '#4CAF50',
        'warning-amber': '#F59E0B',
        // Legacy aliases (for gradual migration)
        'turbo-beige': '#F6F5F2',
        'turbo-blue': '#121212',
        'turbo-black': '#121212',
        // System Colors
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))'
        },
        'color-1': 'hsl(var(--color-1))',
        'color-2': 'hsl(var(--color-2))',
        'color-3': 'hsl(var(--color-3))',
        'color-4': 'hsl(var(--color-4))',
        'color-5': 'hsl(var(--color-5))'
      },
      borderRadius: {
        lg: '8px',
        md: '6px',
        sm: '4px',
        DEFAULT: '6px',
        none: '0',
      },
      letterSpacing: {
        tight: '-0.033em',
      },
      fontSize: {
        'heading-xl': ['32px', { lineHeight: '1.2', fontWeight: '700' }],
        'heading-lg': ['24px', { lineHeight: '1.3', fontWeight: '700' }],
        'heading-md': ['20px', { lineHeight: '1.4', fontWeight: '600' }],
        'heading-sm': ['18px', { lineHeight: '1.4', fontWeight: '600' }],
        'body': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
      },
      animation: {
        'wave-pulse': 'wave-pulse 4s ease-in-out infinite',
        rainbow: 'rainbow var(--speed, 2s) infinite linear',
        'rainbow-border': 'rainbow-border 2s linear infinite',
      },
      keyframes: {
        'wave-pulse': {
          '0%, 100%': {
            opacity: 0.4
          },
          '50%': {
            opacity: 0.7
          }
        },
        rainbow: {
          '0%': {
            'background-position': '0%'
          },
          '100%': {
            'background-position': '200%'
          }
        },
        'rainbow-border': {
          '0%': {
            'border-image-source': 'linear-gradient(45deg, #ff0000, #ff7300, #fffb00, #48ff00, #00ffd5, #002bff, #7a00ff, #ff00c8, #ff0000)',
            'border-image-slice': '1'
          },
          '100%': {
            'border-image-source': 'linear-gradient(225deg, #ff0000, #ff7300, #fffb00, #48ff00, #00ffd5, #002bff, #7a00ff, #ff00c8, #ff0000)',
            'border-image-slice': '1'
          }
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      backgroundImage: {
        'dots-pattern': 'radial-gradient(transparent 1px, white 1px)',
        'dots-pattern-dark': 'radial-gradient(transparent 1px, rgb(0 0 0) 1px)'
      }
    }
  },
  plugins: [
    require("tailwindcss-animate"),
    function({ addUtilities }) {
      addUtilities({
        '.rainbow-glow': {
          'box-shadow': `
            0 0 20px rgba(255, 0, 0, 0.03),
            0 0 40px rgba(255, 127, 0, 0.03),
            0 0 60px rgba(255, 255, 0, 0.03),
            0 0 80px rgba(0, 255, 0, 0.03),
            0 0 100px rgba(0, 127, 255, 0.03),
            0 0 120px rgba(127, 0, 255, 0.03)
          `
        }
      })
    },
    require("@tailwindcss/typography")
  ],
} 