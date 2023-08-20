import OpenAI, { ClientOptions } from 'openai';
import { createLLM } from ".";
import { Stream } from 'openai/streaming';

let openAIKey = '';

if (typeof process !== 'undefined' && process.env.OPENAI_KEY) {
  openAIKey = process.env.OPENAI_KEY;
}

let openAIKey = '';

if (typeof process !== 'undefined' && process.env.OPENAI_KEY) {
  openAIKey = process.env.OPENAI_KEY;
}

export async function* parseOpenAIStream(
  stream: NodeJS.ReadableStream
): AsyncGenerator<[number, string], void> {
  let content = "";
  for await (const chunk of stream) {
    content += chunk.toString();
    while (content.indexOf("\n") !== -1) {
      if (content.indexOf("\n") === -1) break;
      const nextRow = content.slice(0, content.indexOf("\n") + 1);
      content = content.slice(content.indexOf("\n") + 2);
      const data = nextRow.replace("data: ", "");

      if (data.trim() === "[DONE]") return;
      const json = JSON.parse(data);
      if (!Array.isArray(json.choices)) break;
      for (const choice of json.choices) {
        if (choice?.delta?.content)
          yield [choice.index, choice?.delta?.content.toString()];
        if (choice.text) yield [choice.index, choice.text.toString()];
      }
    }
  }
}

export const createOpenAICompletion = (
  options: Omit<OpenAI.Completions.CompletionCreateParams, "prompt">,
  openAIConfig?: ClientOptions
) => {

  const openai = new OpenAI({
    apiKey: openAIKey || openAIConfig?.apiKey,
    ...openAIConfig,
  });

  return createLLM(async function* ({ prompt, ...props }) {
    try {
      const { maxTokens, topP, stopRegex, llm, ...rest } = props;
      const response = await openai.completions.create(
        {
          ...options,
          ...rest,
          prompt: prompt.toString(),
          top_p: topP || options.top_p,
          max_tokens: maxTokens || options.max_tokens,
          stream: props.stream || undefined,
        },
      );

      if (!props.stream && response instanceof Stream) {
        for await (const part of response) {
          for (const [i, choice] of part.choices.entries()) {
            yield [i, choice.text];
          }
        }
      } else {
        const stream = response as unknown as NodeJS.ReadableStream;

        yield* parseOpenAIStream(stream);
      }
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        console.error(error.status, error.code, error.message);
      } else {
        console.log(error);
      }
    }
  }, false);
};

export const createOpenAIChatCompletion = (
  options: Omit<OpenAI.Chat.CompletionCreateParams, "messages">,
  openAIConfig?: ClientOptions
) => {

  const openai = new OpenAI({
    apiKey: openAIKey || openAIConfig?.apiKey,
    ...openAIConfig,
  });

  return createLLM(async function* ({ prompt, ...props }) {
    try {
      const { maxTokens, topP, stopRegex, llm, ...rest } = props;
      const response = await openai.chat.completions.create(
        {
          ...options,
          ...rest,
          messages: prompt.toChatCompletion(),
          top_p: topP || options.top_p,
          max_tokens: maxTokens || options.max_tokens === null ? maxTokens : options.max_tokens,
          stream: props.stream || undefined,
        },
      );

      if (!props.stream && response instanceof Stream) {
        for await (const part of response) {
          for (const [i, choice] of part.choices.entries()) {
            yield [i, choice.delta.content as string];
          }
        }
      } else {
        const stream = response as unknown as NodeJS.ReadableStream;
        yield* parseOpenAIStream(stream);
      }
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        console.error(error.status, error.code, error.message);
      } else {
        console.log(error);
      }
    }
  }, true);
};

export const gpt3 = createOpenAIChatCompletion(
  { model: "gpt-3.5-turbo" },
  { apiKey: openAIKey }
);

export const gpt4 = createOpenAIChatCompletion(
  { model: "gpt-4" },
  { apiKey: openAIKey }
);

export const davinci = createOpenAICompletion(
  { model: "text-davinci-003" },
  { apiKey: openAIKey }
);
