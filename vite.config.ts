import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const isProd = mode === 'production';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    esbuild: {
      // Strip dev-only noise from the production bundle. console.error/warn are
      // kept so real failures still surface in the browser.
      pure: isProd ? ['console.log', 'console.debug', 'console.info'] : [],
      legalComments: 'none',
    },
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      sourcemap: false,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // Split the big vendors out of the entry chunk so the browser can
          // fetch them in parallel and keep them cached across deploys.
          manualChunks(id) {
            /*
             * Vite's virtual helper modules must be pinned to a chunk that is
             * always loaded. They are not under node_modules, so left to its
             * own devices Rollup colocates `preload-helper` with the largest
             * dynamic chunk — which was vendor-spline. Every other chunk then
             * had to statically import that 4.5 MB file just to reach the
             * helper, and Vite emitted a <link rel="modulepreload"> for it,
             * defeating the lazy loading entirely.
             */
            if (id.startsWith('\0vite/') || id.includes('vite/preload-helper') ||
                id.includes('vite/modulepreload-polyfill')) {
              return 'vendor-react';
            }

            if (!id.includes('node_modules')) return;

            if (id.includes('@splinetool')) return 'vendor-spline';
            if (id.includes('/three/') || id.includes('@react-three')) return 'vendor-three';
            if (id.includes('monaco')) return 'vendor-monaco';
            if (id.includes('/firebase/') || id.includes('@firebase')) return 'vendor-firebase';
            if (id.includes('/motion') || id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('socket.io')) return 'vendor-socket';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('@google/gen')) return 'vendor-genai';
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router') ||
              id.includes('/scheduler/')
            ) {
              return 'vendor-react';
            }
            return 'vendor';
          },
        },
      },
    },
  };
});
