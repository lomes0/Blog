/**
 * Set, list and remove a user's own AI provider keys —
 * docs/plans/byo-provider-keys.md phase 2.
 *
 *   pnpm ai:key set you@example.com --provider anthropic     # reads the key from stdin
 *   echo "$KEY" | pnpm ai:key set you@example.com --provider google
 *   pnpm ai:key list you@example.com
 *   pnpm ai:key remove you@example.com --provider anthropic
 *
 * A script as well as a route, for the same reason `mcp:token` is a script: a
 * deployment has to be able to seed a credential without a browser, and local
 * development should not need the settings UI to exist before AI works. The UI
 * is phase 3; this is not a substitute for it.
 *
 * **The key is read from stdin by default and there is no `--key` flag.** An
 * argument would be in the shell history of whoever ran it and in the `ps`
 * output of everyone on the machine, which is a poor way to handle a secret
 * whose whole point is that it is encrypted at rest.
 */
import { AI_PROVIDERS, providerRequiresKey } from "../../src/lib/ai/types.ts";
import type { AIProviderType } from "../../src/lib/ai/types.ts";
import { verifyProviderKey } from "../../src/lib/ai/verifyKey.ts";
import {
  deleteCredential,
  listCredentials,
  saveCredential,
} from "../../src/lib/providerCredentials/index.ts";
import { findUserByRef } from "../../src/repositories/user.ts";

const die = (message: string): never => {
  console.error(message);
  process.exit(1);
};

/** `--provider anthropic` */
function flag(argv: string[], name: string): string | undefined {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
}

const has = (argv: string[], name: string): boolean =>
  argv.includes(`--${name}`);

async function userIdFor(ref: string | undefined): Promise<string> {
  if (!ref) die("Name a user: an id or an email.");
  const user = await findUserByRef(ref!);
  if (!user) die(`No user matches "${ref}".`);
  return user!.id;
}

function providerFrom(argv: string[]): AIProviderType {
  const spec = flag(argv, "provider");
  if (!spec) die(`--provider is required. One of: ${AI_PROVIDERS.join(", ")}`);
  if (!(AI_PROVIDERS as readonly string[]).includes(spec!)) {
    die(`Unknown provider "${spec}". One of: ${AI_PROVIDERS.join(", ")}`);
  }
  const provider = spec as AIProviderType;
  if (!providerRequiresKey(provider)) {
    die(
      `${provider} takes no API key — it is configured by this deployment ` +
        `(OLLAMA_API_URL).`,
    );
  }
  return provider;
}

/** Everything on stdin, trimmed. Refuses an interactive terminal with no pipe. */
async function readSecret(): Promise<string> {
  if (process.stdin.isTTY) {
    console.error("Paste the key and press Ctrl-D:");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const secret = Buffer.concat(chunks).toString("utf8").trim();
  if (!secret) die("No key on stdin.");
  return secret;
}

async function set(argv: string[]) {
  const userId = await userIdFor(argv[0]);
  const provider = providerFrom(argv);
  const apiKey = await readSecret();

  if (has(argv, "no-verify")) {
    console.warn("Skipping the provider check (--no-verify).");
  } else {
    const verification = await verifyProviderKey(provider, apiKey);
    if (!verification.ok) {
      die(
        verification.reason === "rejected"
          ? `${provider} rejected that key: ${verification.message}`
          : `Could not check the key against ${provider}: ${verification.message}\n` +
            `Nothing was saved. Pass --no-verify to store it unchecked.`,
      );
    }
  }

  const summary = await saveCredential({
    userId,
    provider,
    apiKey,
    verifiedAt: has(argv, "no-verify") ? null : new Date(),
  });
  console.log(
    `Saved ${summary.provider} key ending ${summary.last4}. It is encrypted ` +
      `at rest and there is no command to print it back.`,
  );
}

async function list(argv: string[]) {
  const userId = await userIdFor(argv[0]);
  const credentials = await listCredentials(userId);
  if (!credentials.length) {
    console.log("No provider keys.");
    return;
  }
  for (const credential of credentials) {
    console.log(
      `${credential.provider.padEnd(10)}  ••••${credential.last4}  ` +
        `added ${credential.createdAt.toISOString()}  ` +
        `last used ${credential.lastUsedAt?.toISOString() ?? "never"}`,
    );
  }
}

async function remove(argv: string[]) {
  const userId = await userIdFor(argv[0]);
  const provider = providerFrom(argv);
  const removed = await deleteCredential(userId, provider);
  console.log(
    removed
      ? `Removed the ${provider} key.`
      : `There was no ${provider} key to remove.`,
  );
}

const [command, ...argv] = process.argv.slice(2);
const commands: Record<string, (argv: string[]) => Promise<void>> = {
  set,
  list,
  remove,
};

const run = commands[command ?? ""];
if (!run) {
  die(
    `Usage: pnpm ai:key <set|list|remove> …\n` +
      `  set <user> --provider <${AI_PROVIDERS.join("|")}> [--no-verify]\n` +
      `    the key is read from stdin, never from an argument\n` +
      `  list <user>\n` +
      `  remove <user> --provider <name>`,
  );
}

run!(argv)
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
