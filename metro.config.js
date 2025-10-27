const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Agrega 'wasm' a la lista de extensiones de assets que Metro debe reconocer.
// Esto asegura que los archivos WebAssembly se empaqueten correctamente para la web.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

module.exports = config;
