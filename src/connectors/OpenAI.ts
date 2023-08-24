import OpenAI, { ClientOptions } from 'openai';
import { createLLM } from ".";
import { Stream } from 'openai/streaming';
import { isChatCompletion, isCompletion } from '../helpers';
import { ChatCompletionChunk } from 'openai/resources/chat';
import { Completion } from 'openai/resources';

let openAIKey = '';

if (typeof process !== 'undefined' && process.env.OPENAI_KEY) {
  openAIKey = process.env.OPENAI_KEY;
}

export async function* parseOpenAIStream(
  stream: Stream<ChatCompletionChunk> | Stream<Completion>,
  isChat: boolean
): AsyncGenerator<[number, string], void> {
  let content = "";
  for await (const chunk of stream) {
    console.log("chunk", chunk);
    content += chunk.choices
    console.log("content", content);
    while (content.indexOf("\n") !== -1) {
      if (content.indexOf("\n") === -1) break;
      const nextRow = content.slice(0, content.indexOf("\n") + 1);
      content = content.slice(content.indexOf("\n") + 2);
      const data = nextRow.replace("data: ", "");
      console.log("data", data);

      if (data.trim() === "[DONE]") return;
      const json = JSON.parse(data);
      if (isChat && isChatCompletion(json)) {
        console.log("choices", json.choices);
        for (const choice of json.choices) {
          if (choice.delta?.content) {
            console.log("choice.delta.content", choice.delta.content);
            yield [choice.index, choice.delta.content];
          }
        }
      } else if (!isChat && isCompletion(json)) {
        const choice = json.choices[0];
        if (choice.text) {
          yield [choice.index, choice.text];
        }
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

  return createLLM(async function* ({ prompt, ...props }) {
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
          yield [i, c.message.content || ""];
        }
      } else if (response instanceof Stream) {  
        console.log("STREAM", response);

        for await (const part of response) {
          for (const [i, c] of part.choices.entries()) {
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
