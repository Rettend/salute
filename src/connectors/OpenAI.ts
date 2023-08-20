import {
  Configuration,
  ConfigurationParameters,
  CreateChatCompletionRequest,
  CreateCompletionRequest,
  OpenAIApi,
} from "openai";
import { createLLM } from ".";

let openAIKey = '';

if (typeof process !== 'undefined' && process.env.OPENAI_KEY) {
  openAIKey = process.env.OPENAI_KEY;
}

export async function* parseOpenAIStream(
  stream: NodeJS.ReadableStream
): AsyncGenerator<[number, string], void> {
  let content = "";
  for await (const chunk of stream) {
    console.log("chunk", chunk);
    content += chunk.toString();
    console.log("content", content);
    while (content.indexOf("\n") !== -1) {
      if (content.indexOf("\n") === -1) break;
      const nextRow = content.slice(0, content.indexOf("\n") + 1);
      content = content.slice(content.indexOf("\n") + 2);
      const data = nextRow.replace("data: ", "");

      if (data.trim() === "[DONE]") return;
      const json = JSON.parse(data);
      if (!Array.isArray(json.choices)) break;
      for (const choice of json.choices) {
        if (choice?.delta?.content) {
          console.log("text", choice?.delta?.content.toString());
          yield [choice.index, choice?.delta?.content.toString()];
        }
        if (choice.text) yield [choice.index, choice.text.toString()];
      }
    }
  }
}

export const createOpenAICompletion = (
  options: CreateCompletionRequest,
  openAIConfig?: ConfigurationParameters
) => {
  const configuration = new Configuration({
    apiKey: openAIKey || openAIConfig?.apiKey,
    ...openAIConfig,
  });

  const openAIApi = new OpenAIApi(configuration);

  return createLLM(async function* ({ prompt, ...props }) {
    try {
      const { maxTokens, topP, stopRegex, llm, ...rest } = props;
      const response = await openAIApi.createCompletion(
        {
          ...options,
          ...rest,
          prompt: prompt.toString(),
          top_p: topP || options.top_p,
          max_tokens: maxTokens || options.max_tokens,
          stream: props.stream || undefined,
        },
        { responseType: props.stream ? "stream" : undefined }
      );

      if (!props.stream) {
        for (const [i, c] of response.data.choices.entries()) {
          yield [i, c.text || ""];
        }
      } else {
        const stream = response.data as unknown as NodeJS.ReadableStream;

        yield* parseOpenAIStream(stream);
      }
    } catch (e: any) {
      throw e.response;
    }
  }, false);
};

export const createOpenAIChatCompletion = (
  options: Omit<CreateChatCompletionRequest, "messages" | "stream" | "stop">,
  openAIConfig?: ConfigurationParameters
) => {
  const configuration = new Configuration({
    apiKey: openAIKey || openAIConfig?.apiKey,
    ...openAIConfig,
  });

  const openAIApi = new OpenAIApi(configuration);

  return createLLM(async function* ({ prompt, ...props }) {
    try {
      const { maxTokens, topP, stopRegex, llm, ...rest } = props;
      const response = await openAIApi.createChatCompletion(
        {
          ...options,
          ...rest,
          messages: prompt.toChatCompletion(),
          top_p: topP || options.top_p,
          max_tokens: maxTokens || options.max_tokens,
          stream: props.stream || undefined,
        },
        { responseType: props.stream ? "stream" : undefined }
      );
      if (!props.stream) {
        for (const [i, c] of response.data.choices.entries()) {
          yield [i, c.message?.content || ""];
        }
      } else {
        const stream = response.data as unknown as NodeJS.ReadableStream;
        yield* parseOpenAIStream(stream);
        console.log("stream", stream);
      }
    } catch (e: any) {
      console.log(e);
      console.log(e.response);
      throw e.response;
    }
  }, true);
};

export const gpt3 = (apiKey: string) => createOpenAIChatCompletion(
  { model: "gpt-3.5-turbo" },
  { apiKey: openAIKey || apiKey }
);

export const gpt4 = (apiKey: string) => createOpenAIChatCompletion(
  { model: "gpt-4" },
  { apiKey: openAIKey || apiKey }
);

export const davinci = (apiKey: string) => createOpenAICompletion(
  { model: "text-davinci-003" },
  { apiKey: openAIKey || apiKey }
);
