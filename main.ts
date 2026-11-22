// GHOSTLINE — hand-in program (Node 22, standard library only).
// Copies game/ and screenshots/ into the output directory and writes
// /output/dossier.json with buildDossier from vendor/makefun-game.ts.
// Deterministic: the output directory is created if needed, files are copied
// in sorted path order, and nothing time-dependent is written.
import { buildDossier } from "./vendor/makefun-game.ts";
import {
  cpSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
const root = new URL(".", import.meta.url).pathname;

function copyTreeSorted(srcDir: string, dstDir: string): void {
  mkdirSync(dstDir, { recursive: true });
  const entries = readdirSync(srcDir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    const src = join(srcDir, entry.name);
    const dst = join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyTreeSorted(src, dst);
    } else if (entry.isFile()) {
      cpSync(src, dst);
    }
  }
}

mkdirSync(outDir, { recursive: true });

copyTreeSorted(join(root, "game"), join(outDir, "game"));
copyTreeSorted(join(root, "screenshots"), join(outDir, "screenshots"));

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, "dossier.json"), dossier);
console.log(`GHOSTLINE wrote ${outDir} (dossier.json ${dossier.length} bytes)`);
