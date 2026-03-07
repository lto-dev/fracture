import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'esm',
    sourcemap: true,
  },
  external: [
    // Externalize peer dependencies
    '@apiquest/fracture',
  ],
  plugins: [
    // Resolve node modules
    resolve({
      preferBuiltins: true,  // Prefer Node.js built-in modules
      exportConditions: ['node', 'import', 'default'],
    }),
    // Handle JSON imports (e.g. mime-db)
    json(),
    // Convert CommonJS to ESM (for any CJS dependencies) 
    commonjs(),
    // Compile TypeScript
    typescript({
      tsconfig: './tsconfig.json',
      sourceMap: true,
      declaration: false, // We'll use tsc for declarations
      declarationMap: false,
    }),
  ],
};
