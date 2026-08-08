# @turystack/cli

Local-first scaffolding for Turystack applications. The available generators
create standalone NestJS APIs and React web applications.

## Installation

```bash
npx @turystack/cli create api my-api
```

No install step: the CLI runs straight from the registry. The sections
below cover running it from a local checkout and the non-interactive flags.

## Use from the Turystack source repository

```bash
pnpm --dir cli build
node cli/dist/index.js create api my-api --local-root .
node cli/dist/index.js create web my-web --local-root .
```

The API flow builds multi-audience APIs one audience at a time, shows
the current audience list, provides visual selection for the package manager
and optional capabilities, previews derived dependencies, and asks for
confirmation before writing the project.

The default mode writes Turystack dependencies as local `file:` specs. This
keeps the generated API connected to local packages while allowing the chosen
package manager to resolve NestJS peer dependencies in the generated
application's context.

Every generated project is formatted with Biome before the CLI finishes. This
also happens with `--skip-install`; the CLI carries its own formatter for that
case.

The generator also creates `.env` and `.env.example`. PostgreSQL, Valkey, and
Elasticsearch receive ready local Docker values; deterministic resource names
derive from the project name. IAM receives a random secret only in the ignored
`.env`, while `.env.example` keeps a safe placeholder.

Each selected API surface receives one temporary, versioned smoke-test
controller. It returns a default response and contains no service injection or
business-domain scaffolding.

The web flow creates React, Vite, TanStack Router, the Turystack frontend
libraries, every canonical source folder tracked with `.gitkeep`, and the
complete API setup with OpenAPI, Kubb, React Query, `api/`, and generated
`~sdk/`. The wizard asks whether the app consumes a specific API audience. The
only initial product screen is `src/routes/index.tsx`, rendering the centered
Welcome Turystack state; no fake feature, layout, sidebar, or auth flow is
implemented.

## Run the published CLI

```bash
# npm / npx
npx @turystack/cli create api my-api

# pnpm
pnpm dlx @turystack/cli create api my-api

# Yarn
yarn dlx @turystack/cli create api my-api

# Bun
bunx @turystack/cli create api my-api
```

## Source organization

CLI operations are grouped by their command path. `src/index.ts` only routes
execution; API and web generators live under `src/commands/create/{type}/`
with their own arguments, prompts, types, template, runner, and tests.

## Non-interactive examples

```bash
# Single-audience API
node cli/dist/index.js create api my-api \
  --yes \
  --local-root .

# Multi-audience API with optional modules
node cli/dist/index.js create api my-api \
  --yes \
  --format multi-audience \
  --audiences admin,app \
  --package-manager npm \
  --modules database,logger,cache,iam \
  --local-root .

# Published package versions
node cli/dist/index.js create api my-api \
  --yes \
  --registry

# React web app using the default auth audience
node cli/dist/index.js create web my-web \
  --yes \
  --local-root .

# Web app consuming one API audience
node cli/dist/index.js create web my-web \
  --yes \
  --audience customer \
  --openapi-url http://localhost:3000/api/v1/customer/openapi \
  --api-base-url http://localhost:3000 \
  --local-root .
```

Run `node cli/dist/index.js --help` for all options.

## Documentation

Options, API reference and examples:

**https://tury.dev/libs/cli**


## Development

```bash
pnpm install
pnpm typecheck
pnpm check
pnpm test
pnpm build
```
