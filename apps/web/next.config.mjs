import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // typedRoutes desactivado de momento: el sidebar y otros componentes mapean
  // rutas desde arrays (string genérico), incompatible con RouteImpl<string>.
  // Reactivar cuando todas las rutas referenciadas existan y los componentes
  // usen literales o `as Route`.
  transpilePackages: ['@castellar/ui', '@castellar/api-contracts', '@castellar/i18n'],
};

export default withNextIntl(nextConfig);
