import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  format: 'esm',
  platform: 'node',
  target: 'node18',
  // Externalize peerDependencies and Node.js built-ins
  external: [
    '@apiquest/fracture',
    // Node.js built-in modules (got depends on these)
    'http',
    'https',
    'http2',
    'net',
    'tls',
    'stream',
    'util',
    'url',
    'zlib',
    'events',
    'buffer',
    'querystring',
    'dns',
    'fs',
    'path',
  ],
  minify: false,
  sourcemap: true,
});

console.log('✓ Built plugin-http');
