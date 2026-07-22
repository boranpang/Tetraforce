import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

export async function discoverJsonlFiles(root: string) {
  try {
    const files: string[] = [];
    await walk(root, files);
    files.sort();
    return { detected: true, files };
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      return { detected: false, files: [] };
    }
    throw error;
  }
}

export async function readJsonLines(
  file: string,
  receive: (record: unknown) => void
) {
  const lines = createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  for await (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    let record: unknown;
    try {
      record = JSON.parse(line) as unknown;
    } catch {
      // Partially-written JSONL records are ignored locally.
      continue;
    }
    receive(record);
  }
}

async function walk(directory: string, files: string[]): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(entryPath);
    }
  }
}

function hasCode(error: unknown, code: string) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}
