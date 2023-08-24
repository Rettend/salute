import type { EventEmitter } from 'eventemitter3'
import merge from 'ts-deepmerge'
import type { PromptElement, PromptStorage, Roles } from '../PromptStorage'
import type { LLMCompletionFn } from '../connectors'
import { isPromise } from '../helpers'

export interface Outputs {
  [key: string]: string | string[] | Outputs | Outputs[]
}

export interface Context {
  role: Roles
  currentLoopId?: string
  outputAddress: string[]
  leafId: (string | number)[]
  llm: { completion: LLMCompletionFn; isChat: boolean }
  stream?: boolean
}

export interface Queue {
  [key: string]: any[]
}

export interface State {
  loops: { [key: string]: false | number }
  queue: Queue
}

export interface ActionProps<Parameters, O extends Outputs> {
  events: EventEmitter<any, any>
  context: Readonly<Context>
  state: State
  params: Parameters
  outputs: O
  currentPrompt: PromptStorage
  nextString: string | undefined
}

export type Action<Parameters, O extends Outputs, Return = void> = (
  props: ActionProps<Parameters, O>
) => AsyncGenerator<PromptElement, Return>

export function createAction<Parameters = any, O extends Outputs = any>(
  generator: (
    props: ActionProps<Parameters, O>
  ) => AsyncGenerator<PromptElement, void, unknown>,
  updateProps: (
    props: ActionProps<Parameters, O>
  ) => ActionProps<Parameters, O> = props => props,
): Action<Parameters, O> {
  return function (props) {
    return generator(updateProps(props))
  }
}

export type TemplateActionBasicInput =
  | string
  | number
  | null
  | AsyncGenerator<PromptElement, void>
export type TemplateActionInput<Parameters, O extends Outputs> =
  | ((
    props: ActionProps<Parameters, O>
  ) =>
  | TemplateActionInput<Parameters, O>
  | Promise<TemplateActionInput<Parameters, O>>)
  | TemplateActionBasicInput
  | Action<Parameters, O>
  | TemplateActionInput<Parameters, O>[]

export async function* runActions<Parameters, O extends Outputs>(
  action: TemplateActionInput<Parameters, O>,
  props: ActionProps<Parameters, O>,
): AsyncGenerator<PromptElement, void, unknown> {
  const { context } = props

  const element = typeof action === 'function' ? action(props) : action

  if (element === null)
    return

  if (Array.isArray(element)) {
    for (const [index, _element] of element.entries()) {
      yield * runActions(_element, {
        ...props,
        context: { ...context, leafId: [...context.leafId, index] },
      })
    }
  }
  else if (typeof element === 'number' || typeof element === 'string') {
    yield {
      content: `${element}`,
      source: typeof action === 'function' ? 'parameter' : 'constant',
      role: context.role,
    }
  }
  else if (typeof element === 'function') {
    yield * runActions(element, props)
  }
  else if (isPromise<TemplateActionInput<Parameters, O>>(element)) {
    const resolvedElement = await element
    yield * runActions(resolvedElement, props)
  }
  else {
    yield * element
  }
}

export function runTemplateActions<Parameters, O extends Outputs>({
  inputs,
  strings,
}: {
  strings: TemplateStringsArray
  inputs: TemplateActionInput<Parameters, O>[]
}) {
  return async function* generator({
    context,
    currentPrompt,
    nextString,
    ...rest
  }: ActionProps<Parameters, O>) {
    for (let i = 0; i < strings.length; i++) {
      if (strings[i]) {
        yield currentPrompt.getElement({
          content: strings[i],
          source: 'prompt',
          role: context.role,
        })
      }

      if (inputs[i] === undefined)
        continue

      yield * runActions(inputs[i], {
        ...rest,
        context,
        currentPrompt,
        nextString: strings[i + 1],
      })
    }
  }
}

export type TemplateAction<Parameters, O extends Outputs> = (
  strings: TemplateStringsArray,
  ...inputs: TemplateActionInput<Parameters, O>[]
) => Action<Parameters, O>

export function createNewContext<Parameters, O extends Outputs>(
  getContext: () => Partial<Context>,
): TemplateAction<Parameters, O> {
  return function (
    strings: TemplateStringsArray,
    ...inputs: TemplateActionInput<Parameters, O>[]
  ) {
    const _strings = strings.map(s => s.replace(/\n\s+/g, '\n'))

    return createAction(
      runTemplateActions({
        strings: _strings as unknown as TemplateStringsArray,
        inputs,
      }),
      props => ({
        ...props,
        context: merge(props.context, getContext()) as Context,
      }),
    )
  }
}
