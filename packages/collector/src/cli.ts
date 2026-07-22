#!/usr/bin/env node

import { runCli } from "./command";

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);

if (!Number.isInteger(nodeMajor) || nodeMajor < 22) {
  process.stderr.write("Tetraforce Collector requires Node.js 22 or newer.\n");
  process.exitCode = 1;
} else {
  process.exitCode = await runCli(process.argv.slice(2));
}
