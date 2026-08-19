import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': projectDirectory,
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        output: {
          // Keep large, infrequently changing libraries out of the application
          // entry chunk. This changes only asset boundaries; module behavior,
          // storage keys, and runtime feature loading remain unchanged.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@google/genai')) return 'vendor-ai';
            if (id.includes('motion')) return 'vendor-motion';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('mammoth')) return 'vendor-docx';
            if (id.includes('jszip')) return 'vendor-zip';
            if (id.includes('lz-string')) return 'vendor-compression';
            return 'vendor';
          },
        },
      },
    },
  };
});
