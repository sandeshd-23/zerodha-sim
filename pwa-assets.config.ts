import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// `npm run icons` regenerates public/icons/* from public/icons/logo.svg
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0.1, resizeOptions: { background: '#387ed1' } },
    apple: { ...minimal2023Preset.apple, padding: 0.1, resizeOptions: { background: '#387ed1' } },
  },
  images: ['public/icons/logo.svg'],
});
