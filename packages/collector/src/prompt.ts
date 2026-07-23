import { createInterface } from "node:readline/promises";

export type CollectorPrompt = {
  confirm(message: string): Promise<boolean>;
  readDeviceCode(message: string): Promise<string>;
};

export function createTerminalPrompt(): CollectorPrompt {
  return {
    async confirm(message) {
      const answer = await ask(`${message} [y/N] `);
      return answer.trim().toLowerCase() === "y";
    },
    async readDeviceCode(message) {
      return ask(`${message}: `);
    }
  };
}

async function ask(message: string) {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  try {
    return await prompt.question(message);
  } finally {
    prompt.close();
  }
}
