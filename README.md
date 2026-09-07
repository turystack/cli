# @turystack/cli

Local-first scaffolding for Turystack products. It creates monorepos, and only
monorepos: a product with one API and a product with six apps have the same
tree, because a domain is a package either way.

## Quick start

```bash
npx @turystack/cli create acme
cd acme
pnpm install
pnpm docker:up
pnpm db:generate && pnpm db:migrate
pnpm dev
```

That repository already signs people in. The API comes up on `:3000` and the
sign-in application on `:3100`.

## What `create` produces

```text
apps/api          the API, its auth audience, and the authorization server
apps/auth         the sign-in application — every auth screen in the repository
domains/identity  the person, and how they prove it
packages/
├── exceptions    @repo/exceptions — the product's one error catalogue
├── database      @repo/database — schema, relations, migrations
├── ui            @repo/ui — the design, as one stylesheet
└── oauth-clients @repo/oauth-clients — who may sign a person in
```

Nothing here is a placeholder waiting to be replaced. `domains/identity` stores
real people, hashes real passwords and links real provider accounts; the auth
routes complete a real Authorization Code + PKCE flow.

## Growing the repository

```bash
turystack add audience admin    # an API surface and the app that consumes it
turystack add domain order      # domains/order — @repo/order
turystack skills                # the Turystack skills, into .claude/skills
```

`add audience` is one command because an audience and an application are one
decision. It writes `/api/v1/admin`, creates `apps/admin`, registers the OAuth
client in `packages/oauth-clients`, adds `ADMIN_ORIGIN` to the root `.env`, and
wires the controller, the origin and the OpenAPI project into the API.

The application it creates contains **no authentication code**. One line in
`src/routes/__root.tsx` is the whole integration:

```tsx
<AuthProvider client="admin">
```

## Sources: local or published

The default writes Turystack dependencies as local `file:` specs, which keeps a
generated repository connected to a checkout while its package manager still
resolves peer dependencies in the generated app's own context.

```bash
# from a Turystack checkout
pnpm --dir cli build
node cli/dist/index.js create acme --local-root .

# published versions instead
node cli/dist/index.js create acme --registry
```

Every generated package is formatted with Biome before the CLI finishes —
backend packages with the backend config, frontend ones with the frontend
config. This happens with `--skip-install` too; the CLI carries its own
formatter for that case.

## Non-interactive

```bash
node cli/dist/index.js create acme --yes --local-root .
node cli/dist/index.js add audience admin --yes --port 3001 --local-root .
node cli/dist/index.js add domain order --yes --local-root .
```

Run `node cli/dist/index.js --help` for all options.

## pnpm only

`pnpm-workspace.yaml` is what the law detects a Turystack repository by, and
supporting four package managers would mean four workspace layouts, of which
three would never be exercised.

## Source organization

`src/index.ts` only routes. `src/workspace/` holds what every command needs —
workspace discovery, the package table, env merging, Biome config resolution.
`src/commands/create/templates/` holds one module per generated package, and
`src/commands/add/` holds the commands that grow an existing repository.

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
