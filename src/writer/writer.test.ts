
type ScopeContext = {
  _context: TraverseState
} & TraverseState['scope']
type ContextToString = (context : ScopeContext) => ASTResolvedExpression

interface ASTObject<T = any> {
  type: ASTType
  data: T
  reduce: (context: TraverseState) => TraverseState
  parts?: Array<ASTExpression>
  // children?: Array<ASTExpression>
  // toString?: () => string,
}
type ASTResolvedExpression = string | ASTObject | Array<string | ASTObject>
type ASTExpression = ContextToString | ASTResolvedExpression
type ASTList = Array<ASTExpression>

type ASTType =
  | 'root'
  | 'comment'
  | 'comment-inline'
  | 'declaration'
  | 'raw'
  | 'terminator'
  | 'starter'
  | 'lazy'
  | 'group'

// ? do we mark start of content flow (terminated by \n) vs inline content (a; b;)?
const starter: ASTObject = {
  type: 'starter',
  data: {},
  reduce(context) {
    const {processed, parts} = context
    return {
      // @ts-ignore blocked on Microsoft/TypeScript/pull/13288
      ...context,
      processed: [...processed, this],
    }
  }
}

const findLastIndex = <T>(
  predicate: (value: T, index: number, obj: T[]) => boolean,
) => (arr: ReadonlyArray<T>) => {
  const result = arr.slice().reverse().findIndex(predicate)
  return result >= 0
    ? arr.length - 1 - result
    : result
}
const newLine = '\n'
const semi = '; '
const lastStarterAt = findLastIndex(({type}: ASTObject) => type === 'starter')
const lastTerminatorAt = findLastIndex(({type}: ASTObject) => type === 'terminator')
const contentSincePreviousTerminator = ({processed} : TraverseState) => {
  const previousTerminatorIndex = lastTerminatorAt(processed)
  return previousTerminatorIndex >= 0
    ? processed.slice(previousTerminatorIndex)
    : processed
}

type CommentData = {comment: string}
type NoData = {}

const getInlineComments = (objects: Array<ASTObject>) =>
  objects.filter(obj => obj.type === 'comment-inline') as Array<ASTObject<CommentData>>

function terminatorReduce(this: ASTObject<NoData>, context: TraverseState): TraverseState {
  const {processed, parts} = context
  const sinceLastTerminator = contentSincePreviousTerminator(context)
  const comments = getInlineComments(sinceLastTerminator)
  const commentText = `# ${comments.map(({data: {comment: text}}) => text).join(' | ')}`

  return {
    // @ts-ignore blocked on Microsoft/TypeScript/pull/13288
    ...context,
    processed: [...processed, this],
    parts: comments.length
      ? [...parts, newLine, commentText] : [...parts, newLine],
  }
}

const terminator : ASTObject<NoData> = ({
  type: 'terminator',
  data: {},
  reduce: terminatorReduce,
})

const comment = (comment : string): ASTObject<{comment: string}> => ({
  reduce: defaultReduce,
  type: 'comment',
  parts: [`#${comment}`, terminator],
  data: {comment},
})

/**
 * Combines two arrays by alternating their indicies
 * combineAlternate([a, b, c], [1, 2, 3]) === [a, 1, b, 2, c, 3]
 */
const combineAlternate = <T, Y>(
  arr1 : Array<T>,
  arr2 : Array<Y>,
  noLengthCheck = false,
  flipOrder = false,
): Array<T | Y> =>
  (noLengthCheck || arr1.length >= arr2.length)
    ? arr1.reduce(
        (combined, arr1value, index) => (index < arr2.length)
          ? [...combined, ...(flipOrder ? [arr2[index], arr1value] : [arr1value, arr2[index]])]
          : [...combined, arr1value],
        [] as Array<T | Y>,
      )
    : combineAlternate(arr2, arr1, true, true)

const statement = (
  strings: TemplateStringsArray,
  ...parts: Array<ASTObject<any> | string>,
) => combineAlternate(Array.from(strings), parts)
  .map(coerceStringToAST)
  .concat(terminator)

// const x = statement`declare ${variable}=${initializer}`

// comment helper:
// _COMMENT_=
// echo ${_COMMENT_# here is your comment}

function defaultReduce(this: ASTObject, context: TraverseState): TraverseState {
  const {processed, ...nextContext} = reduceAST(this.parts || [], context)
  // @ts-ignore blocked on Microsoft/TypeScript/pull/13288
  return {
    ...nextContext,
    processed: [...processed, this],
  }
}

// in scopes { ... } and subshells ( ... ) we "fork" context
// i.e. ignore its result down the line
type DeclarationData = {variable: ASTObject, initializer: ASTObject | undefined}

type Reducer = (context: TraverseState) => TraverseState
type DefinedReducer<T> = Reducer & {data: T}

const defineReducer = <T>({reducer, data}: {
  reducer: (context: TraverseState) => TraverseState,
  data: T,
}) => Object.assign(reducer, {data})

const addToScope = (name: string) => defineReducer({
  data: {name},
  reducer: ({scope, parts, ...context}: TraverseState): TraverseState => {
    let safeName: string = name
    let append = 0
    while (safeName in scope) {
      append++
      // we need to rename this variable
      safeName = `${name}_${append}`
    }
    return {
      ...context,
      parts: [...parts, safeName],
      scope: {
        ...scope,
        [name]: {...scope.parent, toString: () => safeName},
      },
    }
  },
})

const declare = (
  variable : ASTObject<any>,
  initializer? : ASTObject<any>,
): ASTObject<DeclarationData> => ({
  parts: initializer
    ? statement`declare ${variable}=${initializer}`
    : statement`declare ${variable}`,
  type: 'declaration',
  data: {variable, initializer},
  reduce: defaultReduce,
})

const declareVariable = (
  name : string,
  initializer? : ASTObject<any>,
): ASTObject<DeclarationData> => declare(
  lazy(addToScope(name)),
  initializer,
)

const lazy = <T>(reduce: DefinedReducer<T>): ASTObject<T> => ({
  type: 'lazy',
  data: reduce.data,
  reduce,
})

const raw = (text : string): ASTObject<{text: string}> => ({
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
})

const scopeHelper = (context : TraverseState) => ({
  ...context.scope,
  _context: context,
} as ScopeContext)

const coerceStringToAST = <T>(textOrAST: ASTObject<T> | string) =>
  typeof textOrAST === 'string' ? raw(textOrAST) : textOrAST

const astGroup = (...children: Array<ASTObject>): ASTObject<{children: Array<ASTObject>}> => ({
  type: 'group',
  data: {children},
  reduce: function reduce(context: TraverseState): TraverseState {
    return reduceAST(children, context)
  },
})

const ensureASTObject = (node : ASTExpression, context : TraverseState): ASTObject =>
  Array.isArray(node)
    ? astGroup(...node.map(coerceStringToAST))
    : typeof node === 'function'
      ? ensureASTObject(node(scopeHelper(context)), context)
      : coerceStringToAST(node)

// const ast : ASTList = [
//   comment(`hello`),
// ]

interface TraverseState {
  parts: Array<string>
  processed: Array<ASTObject>
  scopePath: Array<string>
  parent: ASTObject
  scope: {
    [variableName: string]: ASTObject & {toString(): string},
  }
}

const astRoot: ASTObject<NoData> = {
  type: 'root',
  data: {},
  reduce: (ctx) => ctx,
}

const emptyContext: TraverseState = {
  parts: [], processed: [], scopePath: [], scope: {}, parent: astRoot,
}

const reduceAST = (ast : ASTList, context : TraverseState = emptyContext): TraverseState =>
  ast.reduce(
    (context : TraverseState, node) => ensureASTObject(
      node,
      context,
    ).reduce(context),
    context
  )

const print = (ast : ASTList, context : TraverseState = emptyContext) =>
  reduceAST(ast, context).parts.join('')

describe('writer', () => {
  test('comment', () => {
    expect(
      print([
        comment('testing')
      ])
    ).toMatchSnapshot()
  })

  test('terminator', () => {
    expect(
      print([
        terminator
      ])
    ).toMatchSnapshot()
  })

  test('declaration', () => {
    expect(
      print([
        declareVariable('hello', raw('test'))
      ])
    ).toMatchSnapshot()
  })

  test('statement', () => {
    expect(
      print(
        statement`echo test`
      )
    ).toMatchSnapshot()
  })

  test('statement with raw', () => {
    expect(
      print(
        statement`echo ${raw('raw test')}`
      )
    ).toMatchSnapshot()
  })

  test('scope is populated by variables', () => {
    expect(
      print([
        declareVariable('example'),
        ({example}) => statement`echo ${example}`,
      ])
    ).toMatchSnapshot()
  })

})

describe('ast', () => {
  test('comment', () => {
    expect(
      reduceAST([comment('testing')])
    ).toMatchSnapshot()
  })
})

describe('utils', () => {
  test('combineAlternate', () => {
    expect(
      combineAlternate(['a', 'b', 'c'], [1, 2, 3])
    ).toMatchObject(['a', 1, 'b', 2, 'c', 3])
  })
})
