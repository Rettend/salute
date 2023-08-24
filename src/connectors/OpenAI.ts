import OpenAI, { ClientOptions } from 'openai';
import { createLLM } from ".";
import { Stream } from 'openai/streaming';

let openAIKey = '';

if (typeof process !== 'undefined' && process.env.OPENAI_KEY) {
  openAIKey = process.env.OPENAI_KEY;
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

      if (!props.stream && !(response instanceof Stream)) {
        console.log("NOT STREAM");
        for (const [i, c] of response.choices.entries()) {
          yield [i, c.text || ""];
        }
      } else if (response instanceof Stream) {
        console.log("STREAM", response);

        for await (const part of response) {
          for (const [i, c] of part.choices.entries()) {
            yield [i, c.text || ""];
          }
        }
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

  let stream = "";

  const llm = createLLM(async function* ({ prompt, ...props }) {
    try {
      const { maxTokens, topP, stopRegex, llm, ...rest } = props;
      console.log("options.stream", options.stream);
      console.log("props.stream", props.stream);
      const response = await openai.chat.completions.create(
        {
          ...options,
          ...rest,
          messages: prompt.toChatCompletion(),
          top_p: topP || options.top_p,
          max_tokens: maxTokens || options.max_tokens === null ? maxTokens : options.max_tokens,
          stream: options.stream,
        },
      );

      if (!options.stream && !(response instanceof Stream)) {
        console.log("NOT STREAM");
        for (const [i, c] of response.choices.entries()) {
          stream += c.message.content || "";
          yield [i, c.message.content || ""];
        }
      } else if (response instanceof Stream) {  
        console.log("STREAM", response);

        for await (const part of response) {
          for (const [i, c] of part.choices.entries()) {
            stream += c.delta.content || "";
            yield [i, c.delta.content || ""];
          }
        }
      }
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        console.error(error.status, error.code, error.message);
      } else {
        console.log(error);
      }
    }
  }, true);

  return { llm, stream };
};

export const gpt3 = createOpenAIChatCompletion(
  { model: "gpt-3.5-turbo" },
  { apiKey: openAIKey, dangerouslyAllowBrowser: true }
);

export const gpt4 = createOpenAIChatCompletion(
  { model: "gpt-4" },
  { apiKey: openAIKey, dangerouslyAllowBrowser: true }
);

export const davinci = createOpenAICompletion(
  { model: "text-davinci-003" },
  { apiKey: openAIKey, dangerouslyAllowBrowser: true }
);
