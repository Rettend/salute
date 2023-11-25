import type { ClientOptions } from 'openai'
import OpenAI from 'openai'
import { Stream } from 'openai/streaming'
import { createLLM } from '.'
import { storage } from '~/logic'

export function createOpenAICompletion(options: Omit<OpenAI.Completions.CompletionCreateParams, 'prompt'>,
  openAIConfig?: ClientOptions) {
  const openai = new OpenAI({
    apiKey: openAIConfig?.apiKey,
    ...openAIConfig,
  })

  return createLLM(async function* ({ prompt, ...props }) {
    try {
      const { maxTokens, topP, stopRegex, llm, ...rest } = props
      const response = await openai.completions.create(
        {
          ...options,
          ...rest,
          prompt: prompt.toString(),
          top_p: topP || options.top_p,
          max_tokens: maxTokens || options.max_tokens,
          stream: props.stream || undefined,
        },
      )

      if (!props.stream && !(response instanceof Stream)) {
        console.log('NOT STREAM')
        for (const [i, c] of response.choices.entries()) {
          storage.value.translation += c.text || ''
          yield [i, c.text || '']
        }
      }
      else if (response instanceof Stream) {
        console.log('STREAM', response)

        for await (const part of response) {
          for (const [i, c] of part.choices.entries()) {
            storage.value.translation += c.text || ''
            yield [i, c.text || '']
          }
        }
      }
    }
    catch (error) {
      if (error instanceof OpenAI.APIError)
        console.error(error.status, error.code, error.message)
      else
        console.log(error)
    }
  }, false)
}

export function createOpenAIChatCompletion(options: Omit<OpenAI.Chat.CompletionCreateParams, 'messages'>,
  openAIConfig?: ClientOptions) {
  const openai = new OpenAI({
    apiKey: openAIConfig?.apiKey,
    ...openAIConfig,
  })

  let step = 0

  return createLLM(async function* ({ prompt, ...props }) {
    try {
      const { maxTokens, topP, stopRegex, llm, ...rest } = props

      const response = await openai.chat.completions.create(
        {
          ...options,
          ...rest,
          messages: prompt.toChatCompletion(),
          top_p: topP || options.top_p,
          max_tokens: maxTokens || options.max_tokens === null ? maxTokens : options.max_tokens,
          stream: options.stream,
        },
      )

      if (!options.stream && !(response instanceof Stream)) {
        console.log('NOT STREAM')
        for (const [i, c] of response.choices.entries()) {
          if (step === 0) {
            storage.value.definition += c.message.content || ''
          }
          else if (step === 1) {
            storage.value.translation += c.message.content || ''
          }
          else if (step === 2) {
            storage.value.definitionTranslated += c.message.content || ''
          }
          else if (step === 3) {
            // sentencesStorage.value.push({
            //   sentence: c.message.content || '',
            // })
          }
          yield [i, c.message.content || '']
          step += 1
        }
      }
      else if (response instanceof Stream) {
        console.log('STREAM', response)

        for await (const part of response) {
          for (const [i, c] of part.choices.entries()) {
            if (step === 0) {
              storage.value.definition += c.delta.content || ''
            }
            else if (step === 1) {
              storage.value.definition += c.delta.content || ''
            }
            else if (step === 2) {
              storage.value.definitionTranslated += c.delta.content || ''
            }
            else if (step === 3) {
              // sentencesStorage.value.push({
              //   sentence: c.message.content || '',
              // })
            }

            yield [i, c.delta.content || '']
            step += 1
          }
        }
      }
    }
    catch (error) {
      if (error instanceof OpenAI.APIError)
        console.error(error.status, error.code, error.message)
      else
        console.log(error)
    }
  }, true)
}
