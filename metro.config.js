const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// The reader runs inside a WebView; its bundled page is shipped as an asset.
config.resolver.assetExts.push('html', 'webjs');

module.exports = config;
