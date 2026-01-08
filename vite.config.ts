import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { douyinApiPlugin } from './vite.api';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [douyinApiPlugin(), react()],
      define: {
        'process.env.YUNWU_API_KEY': JSON.stringify(env.YUNWU_API_KEY || ''),
        'process.env.YUNWU_BASE_URL': JSON.stringify(env.YUNWU_BASE_URL || ''),
        'process.env.YUNWU_MODEL': JSON.stringify(env.YUNWU_MODEL || ''),
        'process.env.YUNWU_TEMPERATURE': JSON.stringify(env.YUNWU_TEMPERATURE || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
