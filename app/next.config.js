/** @type {import('next').NextConfig} */
const nextConfig = {
  swcMinify: false, // Desactivar minificación con SWC
  webpack(config) {
    config.optimization.minimize = false; // Desactivar minificación de Webpack (Terser)
    return config;
  },
};

module.exports = nextConfig;