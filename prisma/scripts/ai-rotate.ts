/**
 * Re-seal every stored provider key under the current KEK —
 * docs/plans/byo-provider-keys.md phase 5.
 *
 *   pnpm ai:rotate status      # what is sealed under what, and what is stuck
 *   pnpm ai:rotate run --dry-run
 *   pnpm ai:rotate run
 *
 * To rotate: append a version to `AI_CREDENTIAL_KEYS`, point
 * `AI_CREDENTIAL_KEY_VERSION` at it, run this, then drop the old entry once
 * `status` reports nothing left under it. **Dropping it earlier is the one
 * unrecoverable mistake here** — a row whose key material is gone cannot be
 * opened by anyone, and its owner has to enter their key again.
 *
 * Interrupting this is safe. There is no checkpoint file because `keyVersion`
 * is the progress: what remains is a query, and it is still the right answer
 * after a crash.
 */
import { prisma } from "../../src/lib/prisma.ts";
import { KeyringError, SealError } from "../../src/lib/providerCredentials/crypto.ts";
import { loadKeyring } from "../../src/lib/providerCredentials/keyring.ts";
import { resealRow } from "../../src/lib/providerCredentials/rotate.ts";

const die = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const has = (argv: string[], name: string): boolean => argv.includes(`--${name}`);

/** Small enough to keep memory flat, large enough that the round trips vanish. */
const BATCH = 100;

/** How many unreadable rows are named individually before the list is summarised. */
const MAX_LISTED_FAILURES = 20;

const ROW_SELECT = {
  id: true,
  userId: true,
  provider: true,
  ciphertext: true,
  iv: true,
  authTag: true,
  keyVersion: true,
} as const;

async function status() {
  const keyring = loadKeyring();
  const counts = await prisma.providerCredential.groupBy({
    by: ["keyVersion"],
    _count: { _all: true },
    orderBy: { keyVersion: "asc" },
  });

  if (!counts.length) {
    console.log("No stored provider keys.");
    return;
  }

  console.log(`Current key version: ${keyring.currentVersion}`);
  console.log(`Configured versions: ${[...keyring.keys.keys()].join(", ")}\n`);
  for (const { keyVersion, _count } of counts) {
    const current = keyVersion === keyring.currentVersion;
    const openable = keyring.keys.has(keyVersion);
    const note = current
      ? "current"
      : openable
      ? "needs re-sealing"
      : "UNREADABLE — its key is not configured";
    console.log(`  version ${keyVersion}: ${_count._all} row(s)  ${note}`);
  }
}

async function run(argv: string[]) {
  const keyring = loadKeyring();
  const dryRun = has(argv, "dry-run");
  const target = keyring.currentVersion;

  let resealed = 0;
  let skipped = 0;
  let unreadable = 0;
  /** Rows that could not be re-sealed, so the loop does not see them forever. */
  const stuck: string[] = [];

  for (;;) {
    const rows = await prisma.providerCredential.findMany({
      where: {
        keyVersion: { not: target },
        ...(stuck.length ? { id: { notIn: stuck } } : {}),
      },
      select: ROW_SELECT,
      take: BATCH,
      orderBy: { id: "asc" },
    });
    if (!rows.length) break;

    for (const row of rows) {
      let sealed;
      try {
        ({ sealed } = resealRow(row, keyring));
      } catch (error) {
        // Reported, never skipped quietly. A row nobody can open is a user who
        // has to be told to re-enter their key, and it is the whole reason
        // `status` exists.
        //
        // Capped, though: the scenario that produces these is a key retired too
        // early, which produces them by the *table*, and a listing of ten
        // thousand identical lines buries the summary that says what to do.
        stuck.push(row.id);
        unreadable++;
        if (unreadable <= MAX_LISTED_FAILURES) {
          console.error(
            `  ${row.provider} key ${row.id} (user ${row.userId}) cannot be ` +
              `re-sealed: ${
                error instanceof SealError || error instanceof KeyringError
                  ? error.message
                  : error
              }`,
          );
          if (unreadable === MAX_LISTED_FAILURES) {
            console.error("  … further failures not listed individually.");
          }
        }
        continue;
      }

      if (dryRun) {
        stuck.push(row.id); // not stuck — just not written, so the loop advances
        resealed++;
        continue;
      }

      // Raw, for two reasons. The `keyVersion` in the WHERE clause is a
      // compare-and-set: if the owner replaced this key while we were working,
      // their row is already at the current version and this matches nothing,
      // so we cannot overwrite a newer secret with an older one. And Prisma's
      // `@updatedAt` would fire on a normal `update`, making every key look to
      // its owner as though it had just been replaced — a rotation should be
      // invisible to the people whose keys it touches.
      const written = await prisma.$executeRaw`
        UPDATE "ProviderCredential"
        SET "ciphertext" = ${Buffer.from(sealed.ciphertext)},
            "iv" = ${Buffer.from(sealed.iv)},
            "authTag" = ${Buffer.from(sealed.authTag)},
            "keyVersion" = ${target}
        WHERE "id" = ${row.id}::uuid AND "keyVersion" = ${row.keyVersion}
      `;

      if (written === 0) {
        // Changed underneath us — already current, by someone else's write.
        skipped++;
        stuck.push(row.id);
      } else {
        resealed++;
      }
    }
  }

  console.log(
    `${dryRun ? "Would re-seal" : "Re-sealed"} ${resealed} row(s) under ` +
      `version ${target}.`,
  );
  if (skipped) {
    console.log(`${skipped} row(s) were replaced by their owner mid-run; left alone.`);
  }
  if (unreadable > 0 && !dryRun) {
    console.error(
      `\n${unreadable} row(s) could not be re-sealed. Their owners must enter ` +
        `their key again; keep the old key version configured until you have ` +
        `decided what to do about them.`,
    );
    process.exitCode = 1;
  }
}

const [command, ...argv] = process.argv.slice(2);
const commands: Record<string, (argv: string[]) => Promise<void>> = {
  status,
  run,
};

const execute = commands[command ?? ""];
if (!execute) {
  die(
    `Usage: pnpm ai:rotate <status|run> [--dry-run]\n` +
      `  status  what is sealed under which key version\n` +
      `  run     re-seal everything under AI_CREDENTIAL_KEY_VERSION\n\n` +
      `Do not remove a key from AI_CREDENTIAL_KEYS until \`status\` shows\n` +
      `nothing left under it — a row whose key is gone cannot be recovered.`,
  );
}

execute!(argv)
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
