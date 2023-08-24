import chalk from "chalk";
import OpenAI from "openai";
import { PromptElement, PromptStorage } from "./PromptStorage";
import { ChatCompletionChunk } from "openai/resources/chat";
import { Completion } from "openai/resources";

export function printChatElement(element: PromptElement) {
  if (typeof process !== 'undefined') {
    switch (element.source) {
      case "constant":
        process.stdout.write(chalk.yellow(element.content));
        break;
      case "parameter":
        process.stdout.write(chalk.bgBlue(element.content));
        break;
      case "prompt":
        process.stdout.write(element.content);
        break;
      case "llm":
        process.stdout.write(chalk.bgGreen(element.content));
        break;
    }
  }
  else {
    console.log(element.content);
  }
}

export async function* renderStream(
  gen: AsyncGenerator<PromptElement>,
  showRoles = true
) {
  let lastRole = null;

  for await (const a of gen) {
    if (a.role !== lastRole && showRoles) {
      console.log(`\n------------------ ${a.role} ------------------`);
      lastRole = a.role;
    }
    printChatElement(a);
    yield a;
  }
  console.log("\n----------------------------------------");
}

export function prettyPrintPrompt(chat: PromptStorage) {
  for (const rolePrompt of chat) {
    console.log(`----------${rolePrompt[0].role}----------\n`);
    rolePrompt.forEach((el) => printChatElement(el));
    console.log("\n");
  }
}

export function isPromise<T>(obj: any): obj is Promise<T> {
  return (
    !!obj &&
    (typeof obj === "object" || typeof obj === "function") &&
    typeof obj.then === "function"
  );
}

export function isArrayTemplateStringsArray(
  strings: any | TemplateStringsArray
): strings is TemplateStringsArray {
  return Array.isArray((strings as TemplateStringsArray).raw);
}


export function isChatCompletion(
  completion: ChatCompletionChunk
): completion is OpenAI.Chat.Completions.ChatCompletionChunk {
  return completion.choices !== undefined;
}

export function isCompletion(
  completion: Completion
): completion is OpenAI.Completions.Completion {
  return completion.choices !== undefined;
}