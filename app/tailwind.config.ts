import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "var(--brand-navy)",
          accent: "var(--brand-accent)",
          "accent-hover": "var(--brand-accent-hover)",
          "accent-muted": "var(--brand-accent-muted)",
        },
        surface: {
          page: "var(--surface-page)",
          card: "var(--surface-card)",
          muted: "var(--surface-muted)",
          header: "var(--surface-header)",
        },
        border: {
          DEFAULT: "var(--border-default)",
          muted: "var(--border-muted)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          inverse: "var(--text-inverse)",
        },
        semantic: {
          success: "var(--color-success)",
          "success-bg": "var(--color-success-bg)",
          warning: "var(--color-warning)",
          "warning-bg": "var(--color-warning-bg)",
          error: "var(--color-error)",
          "error-bg": "var(--color-error-bg)",
          info: "var(--color-info)",
          "info-bg": "var(--color-info-bg)",
        },
      },
      fontSize: {
        "display-lg": ["1.875rem", { lineHeight: "2.25rem", fontWeight: "700" }],
        "display-sm": ["1.5rem", { lineHeight: "2rem", fontWeight: "600" }],
        label: ["0.75rem", { lineHeight: "1rem", fontWeight: "600", letterSpacing: "0.05em" }],
        body: ["0.875rem", { lineHeight: "1.25rem" }],
        caption: ["0.75rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        header: "var(--shadow-header)",
      },
    },
  },
  plugins: [],
};

export default config;
