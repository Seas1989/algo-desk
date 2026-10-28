import { defineConfig } from 'vite';

// 用相对 base，产物可直接丢到 GitHub Pages 的 /<repo>/ 子路径下
export default defineConfig({
  base: './',
  server: { port: 5180 },
  build: { outDir: 'dist', assetsDir: 'assets' },
});
