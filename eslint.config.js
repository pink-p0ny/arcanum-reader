// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // reader-web is vendored foliate-js plus a plain-JS bridge bundled for the WebView; assets holds its output.
    ignores: ['dist/*', 'reader-web/**', 'assets/**', 'scripts/**', '.expo/**'],
  },
]);
