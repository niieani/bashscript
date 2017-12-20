import {combineAlternate, findLastIndex, last} from './util'

export type ScopeContext = {
  _context : TraverseState
} & TraverseScope
export type ScopeContextToAST<T = any> = (context : ScopeContext) => ASTResolvedExpression<T>

export interface ASTObject<T = any> {
  type : ASTType
  data : T
  reduce : (context : TraverseState) => TraverseState
  parts? : Array<ASTExpression>
}

export type ASTResolvedExpression<T = any> = string | ASTObject<T> | Array<string | ASTObject>
export type ASTExpression =
  | ScopeContextToAST
  | ASTResolvedExpression
  | Array<ScopeContextToAST | ASTResolvedExpression>
export type ASTList = Array<ASTExpression>
export type ASTType =
  | 'root'
  | 'comment'
  | 'comment-inline'
  | 'declaration'
  | 'raw'
  | 'terminator'
  | 'starter'
  | 'enhance'
  | 'group'
  | 'function'
  | 'unknown'
  | 'variable'

export type CommentData = {comment : string}
export type NoData = {}

// ? do we mark start of content flow (terminated by \n) vs inline content (a; b;)?
export const starter : ASTObject<NoData> = {
  type: 'starter',
  data: {},
  reduce(context) : TraverseState {
    const {processed, parts, indent} = context
    return {
      ...context,
      parts: indent ? [...parts, ''.padStart(indent)] : parts,
      processed: [...processed, this],
    }
  },
}

export const newLine = '\n'
export const semi = '; '
export const lastStarterAt = findLastIndex(({type} : ASTObject) => type === 'starter')
export const lastTerminatorAt = findLastIndex(({type} : ASTObject) => type === 'terminator')
export const contentSincePreviousTerminator = ({processed} : TraverseState) => {
  const previousTerminatorIndex = lastTerminatorAt(processed)
  return previousTerminatorIndex >= 0
    ? processed.slice(previousTerminatorIndex)
    : processed
}

export const getInlineComments = (objects : Array<ASTObject>) =>
  objects.filter(obj => obj.type === 'comment-inline') as Array<ASTObject<CommentData>>

export function terminatorReduce(
  this : ASTObject<NoData>,
  context : TraverseState,
) : TraverseState {
  const {processed, parts} = context
  const sinceLastTerminator = contentSincePreviousTerminator(context)
  const comments = getInlineComments(sinceLastTerminator)
  const commentText = `# ${comments.map(({data: {comment: text}}) => text).join(' | ')}`

  return {
    ...context,
    processed: [...processed, this],
    parts: comments.length
      ? [...parts, newLine, commentText] : [...parts, newLine],
  }
}

export const terminator : ASTObject<NoData> = (
  {
    type: 'terminator',
    data: {},
    reduce: terminatorReduce,
  }
)

export const isBeginningOfLine = (context : TraverseState) => {
  const token = last(context.parts)
  return !token || token === newLine
}

export const ensureStarter = ({_context: context} : ScopeContext) => (
  context.indent > 0 && isBeginningOfLine(context)
) ? starter : ''

export const comment = (comment : string, withSpace = true) : ASTObject<{comment : string}> => (
  {
    reduce: defaultReduce,
    type: 'comment',
    parts: [
      ensureStarter,
      `#${withSpace ? ' ' : ''}${comment}`,
      terminator,
    ],
    data: {comment},
  }
)

export const astGroup = (...children : ASTList) : ASTObject<{children : ASTList}> => (
  {
    type: 'group',
    data: {children},
    reduce: function reduce(context : TraverseState) : TraverseState {
      return reduceAST(children, context)
    },
  }
)

/**
 * Template string for creating AST from nodes/strings and functions
 */
export const ast = (
  strings : TemplateStringsArray,
  ...parts : Array<ASTExpression | undefined>,
) : Array<ASTObject> => (
  parts.every(part => typeof part !== 'function')
    ? combineAlternate(
    Array.from(strings),
    parts.flatten(1) as Array<string | ASTObject>,
    )
    .filter(node => node !== undefined && (
      !shouldTreatAsPureText(node) || node.length > 0
    ))
    .map(coerceStringToAST)
    : [
      astGroup(
        ({_context: context}) => ensureASTObject(
          combineAlternate(
            Array.from(strings).map(coerceStringToAST),
            parts
              .filter(part => typeof part !== 'undefined')
              .map((part) => ensureASTObject(part!, context)),
          ),
          context,
        ),
      ),
    ]
)

export const statement = (
  strings : TemplateStringsArray,
  ...parts : Array<ASTExpression | undefined>,
) : Array<ASTObject> => {
  const applied = ast(strings, ...parts)
  const [first, ...rest] = applied
  const [last] = rest.reverse()
  return [
    ...(
      first && first.type !== 'starter' ? [starter] : []
    ),
    ...applied,
    ...(
      last && last.type !== 'terminator' ? [terminator] : []
    ),
  ]
}

export function defaultReduce(this : ASTObject, context : TraverseState) : TraverseState {
  const {processed, ...nextContext} = reduceAST(this.parts || [], context)
  return {
    ...nextContext,
    processed: [...processed, this],
  }
}

export type DeclarationData = {variable : ASTExpression, initializer : ASTExpression | undefined}
export type Reducer = (context : TraverseState) => TraverseState
export type DefinedReducer<T> = Reducer & {data : T}
export const defineReducer = <T>({reducer, data} : {
  reducer : (context : TraverseState) => TraverseState,
  data : T,
}) => Object.assign(reducer, {data})
/**
 * adds a variable to scope and prints its name
 */
export const addToScope = (name : string) => defineReducer({
  data: {name},
  reducer: ({scope, parts, parent, ...context} : TraverseState) : TraverseState => {
    let safeName = name
    let append = 0
    while (safeName in scope) {
      append++
      // we need to rename this variable
      safeName = `${name}_${append}`
    }
    return {
      ...context,
      parent,
      parts: [...parts, safeName],
      scope: createScopeProxy({
        ...scope,
        [name]: {
          ...parent,
          toString: () => safeName,
          length: safeName.length,
        },
      }),
    }
  },
})

export const declare = (
  variable : ASTExpression,
  initializer? : ASTExpression,
) : ASTObject<DeclarationData> => (
  {
    parts: initializer
      ? statement`declare ${variable}=${initializer}`
      : statement`declare ${variable}`,
    type: 'declaration',
    data: {variable, initializer},
    reduce: defaultReduce,
  }
)

export const declareVariable = (
  name : string,
  initializer? : ASTExpression,
) : ASTObject<DeclarationData> => declare(
  enhance(addToScope(name)),
  initializer,
)

/**
 * in scopes { ... } and sub-shells ( ... ) we "fork" context
 * i.e. ignore its result down the line
 */
export const inIsolatedScope = (body : ASTExpression, scopeDescription : string) => defineReducer({
  reducer: (context) => {
    const {
      indent, processed, scope, scopePath, parent, partsToExtract, parts,
    } = context
    const innerContext = reduceAST(
      [body],
      {
        indent: indent + 2,
        scope,
        scopePath: [...scopePath, scopeDescription],
        processed: [],
        parts: [],
        partsToExtract: [],
        parent,
      },
    )
    return {
      ...context,
      partsToExtract: [...partsToExtract, ...innerContext.partsToExtract],
      parts: [...parts, ...innerContext.parts],
      processed: [...processed, parent, ...innerContext.processed],
    }
  },
  data: {scopeDescription, body},
})

export type FunctionAST = {name : string, body : ASTExpression}
export const declareFunction = ({name, body} : FunctionAST) : ASTObject<FunctionAST> => (
  {
    type: 'function',
    data: {name, body},
    reduce: defaultReduce,
    parts: statement`function ${enhance(addToScope(name))} {
${enhance(inIsolatedScope(body, name))}
}`,
  }
)

export const enhance = <T>(reduce : DefinedReducer<T>) : ASTObject<T> => (
  {
    type: 'enhance',
    data: reduce.data,
    reduce,
  }
)

export const raw = (text : string) : ASTObject<{text : string}> => (
  {
    reduce: function reduce({processed, parts, ...context}) {
      return {
        ...context,
        processed: [...processed, this],
        parts: [...parts, text],
      }
    },
    parts: [text],
    data: {text},
    type: 'raw',
  }
)

export type VariableData = {name : string | number}
export const referenceVar = (name : string | number) : ASTObject<VariableData> => ({
  type: 'variable',
  parts: [ast`\${${name.toString()}}`],
  data: {name},
  reduce: defaultReduce,
})

export const scopeHelper = (context : TraverseState) => (
  {
    ...context.scope,
    _context: context,
  } as ScopeContext
)

export const shouldTreatAsPureText = (textOrAST : ASTObject | string) : textOrAST is string =>
  typeof textOrAST === 'string' || textOrAST.hasOwnProperty('toString')

export const coerceStringToAST = <T>(textOrAST : ASTObject<T> | string) =>
  shouldTreatAsPureText(textOrAST) ? raw(textOrAST) : textOrAST

export const ensureASTObject = (node : ASTExpression, context : TraverseState = emptyContext) : ASTObject =>
  Array.isArray(node)
    ? astGroup(...node.flatten(100).map(coerceStringToAST))
    : typeof node === 'function'
    ? ensureASTObject(node(scopeHelper(context)), context)
    : coerceStringToAST(node)

export interface TraverseScope {
  [variableName : string] : (ASTObject & {toString() : string, length : number} | undefined),
}

export interface TraverseState {
  parts : Array<string>
  partsToExtract : Array<string>
  processed : Array<ASTObject>
  scopePath : Array<string>
  parent : ASTObject
  indent : number,
  scope : TraverseScope,
}

export const astRoot : ASTObject<NoData> = {
  type: 'root',
  data: {},
  reduce: (ctx) => ctx,
}

export const createScopeProxy = (scope : TraverseScope = {}) => new Proxy(
  scope,
  {
    get: function (
      target,
      property,
      receiver,
    ) : ASTObject & {toString() : string, length : number} {
      if (property in target) {
        return target[property]!
      }
      // workaround for jest:
      if (property === 'getMockName') return (
        () => 'Scope'
      ) as any
      if (property === 'mock') return {calls: []} as any

      return {
        type: 'unknown',
        data: {},
        length: property.toString().length,
        reduce: (context) => context,
        parts: [],
        toString: () => property.toString(),
      }
    },
  },
)

export const emptyContext : TraverseState = {
  parts: [],
  partsToExtract: [],
  processed: [],
  scopePath: [],
  scope: createScopeProxy(),
  parent: astRoot,
  indent: 0,
}

export const isSkipType = (type : ASTType) => {
  switch (type) {
    case 'enhance':
    case 'group':
      return true
    default:
      return false
  }
}

export const reduceAST = (
  ast : ASTList,
  {parent: astParent, ...context} : TraverseState = emptyContext,
) : TraverseState =>
  ast.reduce(
    (context : TraverseState, node) => {
      const parent = ensureASTObject(
        node,
        context,
      )
      const parentSkipType = isSkipType(parent.type) ? context.parent : parent
      const newContext = parent.reduce({...context, parent: parentSkipType})
      return {...newContext, parent: astParent}
    },
    {...context, parent: astParent},
  )

export const print = (ast : ASTList, context : TraverseState = emptyContext) =>
  reduceAST(ast, context).parts.join('')
