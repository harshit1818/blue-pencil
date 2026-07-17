import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'build/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'src/**/*.jsx', 'test/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node, ...globals.browser }
    }
  },
  {
    // JSX components read via <Foo/> aren't seen as "used" by no-unused-vars
    // without this rule from eslint-plugin-react.
    files: ['src/renderer/**/*.{js,jsx}'],
    plugins: { react },
    rules: { 'react/jsx-uses-vars': 'error' }
  },
  {
    files: ['src/renderer/**/*.{js,jsx}'],
    ...reactHooks.configs.flat['recommended-latest']
  }
]
