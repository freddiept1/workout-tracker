// Generates the app icons from public/icon.svg. Run `npm run icons` after changing the SVG.
import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config';

// The SVG is already a full-bleed square with the artwork inside the safe zone, so no extra padding.
export default defineConfig({
  preset: {
    ...preset,
    transparent: { ...preset.transparent, padding: 0 },
    maskable: { ...preset.maskable, padding: 0 },
    apple: { ...preset.apple, padding: 0 }
  },
  images: ['public/icon.svg']
});
