/**
 * The dependency sets a generated repository is built from.
 *
 * They live in one file because they answer one question — what does this kind
 * of package need — and because a peer that is declared in the library and
 * missing here is a project that installs cleanly and fails at boot. That is
 * how `@turystack/react-i18n` and `@turystack/nestjs-context` went missing from
 * the generated apps for as long as they did.
 */

export const ROOT_TURYSTACK = [
  '@turystack/backend-config',
  '@turystack/proof-mode-gates',
] as const

export const EXCEPTIONS_TURYSTACK = [
  '@turystack/exceptions',
] as const

export const DATABASE_TURYSTACK = [
  '@turystack/exceptions',
  '@turystack/nestjs-database',
] as const

export const IDENTITY_TURYSTACK = [
  '@turystack/entity',
  '@turystack/fields',
  '@turystack/nestjs-database',
  '@turystack/nestjs-iam',
] as const

export const API_TURYSTACK = [
  '@turystack/entity',
  '@turystack/exceptions',
  '@turystack/fields',
  '@turystack/nestjs-config',
  '@turystack/nestjs-context',
  '@turystack/nestjs-database',
  '@turystack/nestjs-iam',
  '@turystack/nestjs-oauth',
  '@turystack/nestjs-server',
  '@turystack/nestjs-social-auth',
  '@turystack/query-dsl',
] as const

export const WEB_TURYSTACK = [
  '@turystack/fields',
  '@turystack/react-hooks',
  // A peer of @turystack/react-web: without it the first label a screen renders
  // fails to resolve.
  '@turystack/react-i18n',
  '@turystack/react-icons',
  '@turystack/react-web',
] as const

export const ROOT_DEV = {
  '@biomejs/biome': '2.5.4',
  typescript: '^7.0.2',
} as const

export const BACKEND_PACKAGE_DEV = {
  '@types/node': '^24.0.0',
  typescript: '^7.0.2',
} as const

export const TEST_DEV = {
  '@vitest/coverage-v8': '^4.0.0',
  vitest: '^4.0.0',
} as const

export const DATABASE_DEPENDENCIES = {
  'drizzle-orm': '>=0.44.0',
  pg: '^8.0.0',
  uuidv7: '^1.2.1',
} as const

export const DATABASE_DEV = {
  '@types/pg': '^8.0.0',
  dotenv: '^17.0.0',
  'drizzle-kit': '^0.31.0',
} as const

export const API_DEPENDENCIES = {
  '@nestjs/common': '^11.0.0',
  '@nestjs/core': '^11.0.0',
  '@nestjs/platform-express': '^11.0.0',
  '@nestjs/swagger': '^11.0.0',
  '@scalar/nestjs-api-reference': '^1.0.0',
  express: '^5.0.0',
  'nestjs-zod': '^5.0.0',
  'reflect-metadata': '^0.2.0',
  rxjs: '^7.8.0',
  zod: '^4.4.3',
  ...DATABASE_DEPENDENCIES,
} as const

export const API_DEV = {
  '@nestjs/testing': '^11.0.0',
  '@types/express': '^5.0.0',
  '@types/node': '^24.0.0',
  '@types/supertest': '^6.0.0',
  supertest: '^7.0.0',
  'tsc-alias': '^1.8.0',
  tsx: '^4.0.0',
  typescript: '^7.0.2',
  ...TEST_DEV,
} as const

export const WEB_DEPENDENCIES = {
  '@hookform/resolvers': '^5.4.3',
  '@tanstack/react-query': '^5.101.4',
  '@tanstack/react-router': '^1.170.18',
  react: '^19.2.7',
  'react-dom': '^19.2.7',
  'react-hook-form': '^7.83.0',
  zod: '^4.4.3',
} as const

export const WEB_DEV = {
  '@kubb/cli': '^4.39.2',
  '@kubb/core': '^4.39.2',
  '@kubb/plugin-client': '^4.39.2',
  '@kubb/plugin-oas': '^4.39.2',
  '@kubb/plugin-react-query': '^4.39.2',
  '@kubb/plugin-ts': '^4.39.2',
  '@kubb/plugin-zod': '^4.39.2',
  '@tailwindcss/vite': '^4.3.3',
  '@tanstack/router-cli': '^1.166.12',
  '@tanstack/router-plugin': '^1.168.23',
  '@testing-library/react': '^16.3.2',
  '@testing-library/user-event': '^14.6.1',
  '@types/react': '^19.2.17',
  '@types/react-dom': '^19.2.3',
  '@vitejs/plugin-react': '^6.0.4',
  '@vitest/coverage-v8': '^4.1.10',
  dotenv: '^17.3.1',
  jsdom: '^29.1.1',
  tailwindcss: '^4.3.3',
  typescript: '^7.0.2',
  vite: '^8.1.5',
  vitest: '^4.1.10',
} as const

// This package is typechecked twice, once through the API config and once
// through the web one, so it carries both configs' ambient type libraries:
// `node` for the first, `vite/client` for the second. Neither is imported by
// anything in `src` — they are asked for by `types`, and a missing one stops
// `tsc` at TS2688 before it reads a line of the client registry.
export const OAUTH_CLIENTS_DEV = {
  '@types/react': '^19.2.17',
  vite: '^8.1.5',
  ...BACKEND_PACKAGE_DEV,
} as const

export const OAUTH_CLIENTS_PEER = {
  react: '>=19',
} as const
