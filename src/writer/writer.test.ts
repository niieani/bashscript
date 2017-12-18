import '../util/flatmap'

type ScopeContext = {
  _context: TraverseState
} & TraverseState['scope']
type ScopeContextToAST<T = any> = (context : ScopeContext) => ASTResolvedExpression<T>

interface ASTObject<T = any> {
  type: ASTType
  data: T
  reduce: (context: TraverseState) => TraverseState
  parts?: Array<ASTExpression>
}

type ASTResolvedExpression<T = any> = string | ASTObject<T> | Array<string | ASTObject>
type ASTExpression = ScopeContextToAST | ASTResolvedExpression
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
const starter: ASTObject<NoData> = {
  type: 'starter',
  data: {},
  reduce(context): TraverseState {
    const {processed, parts, indent} = context
    return {
      ...context,
      parts: indent ? [...parts, ''.padStart(indent)] : parts,
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

// const prepareStatement = (nodes: Array<string | ASTObject>) => nodes
//   .filter(node => !isPureText(node) || node.length > 0)
//   .map(coerceStringToAST)
//   .concat(terminator)

// const resolvedStatement = (
//   strings: TemplateStringsArray,
//   ...parts: Array<ASTResolvedExpression>
// ) =>
//   prepareStatement(
//     combineAlternate(
//       Array.from(strings),
//       parts.flatten(1) as Array<string | ASTObject>
//     )
//   )

// const a = astGroup()

// const flattenObjectsReducer = (
//   strings: TemplateStringsArray,
//   ...parts: Array<ASTResolvedExpression>
// ) => (context: TraverseState) => ensureASTObject(
//   combineAlternate(Array.from(strings), parts.map((part) => ensureASTObject(part, context)))
//     .filter(node => !isPureText(node) || node.length > 0)
//     .map(coerceStringToAST)
//     .concat(terminator),
//   context,
// )

// const flattenedObjects = defineReducer({
//   reducer: flattenObjectsReducer(),
//   data:
// })

    // const x = [].flatMap(())
// const flattenPossible
// .map((part) => ensureASTObject(part))

// const statement = (
//   strings: TemplateStringsArray,
//   ...parts: Array<ASTObject<any> | string>,
// ) => combineAlternate(Array.from(strings), parts)
//   .filter(node => !isPureText(node) || node.length > 0)
//   .map(coerceStringToAST)
//   .concat(terminator)

const astGroup = (...children: ASTList): ASTObject<{children: ASTList}> => ({
  type: 'group',
  data: {children},
  reduce: function reduce(context: TraverseState): TraverseState {
    return reduceAST(children, context)
  },
})

/**
 * Template string for creating AST from nodes/strings and functions
 */
const ast = (
  strings: TemplateStringsArray,
  ...parts: Array<ASTExpression>,
): Array<ASTObject> => (
  parts.every(part => typeof part !== 'function')
    ? combineAlternate(
        Array.from(strings),
        parts.flatten(1) as Array<string | ASTObject>
      )
      .filter(node => !isPureText(node) || node.length > 0)
      .map(coerceStringToAST)
    : [
      astGroup(
        ({_context: context}) => ensureASTObject(
          combineAlternate(
            Array.from(strings).map(coerceStringToAST),
            parts.map((part) => ensureASTObject(part, context))
          ),
          context,
        )
      )
    ]
  )

const statement = (
  strings: TemplateStringsArray,
  ...parts: Array<ASTExpression>,
): Array<ASTObject> => ast(strings, ...parts).concat(terminator)

// const x = statement`declare ${variable}=${initializer}`

// comment helper:
// _COMMENT_=
// echo ${_COMMENT_# here is your comment}

function defaultReduce(this: ASTObject, context: TraverseState): TraverseState {
  const {processed, ...nextContext} = reduceAST(this.parts || [], context)
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
    let safeName = name
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
        [name]: {...scope.parent, toString: () => safeName, length: safeName.length},
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

const declareFunction = ({name, body}: {name: string, body: ASTExpression}) => ({
  type: 'function',
  parts: statement`function ${name} {
${body}
}`
})

const ex = statement`declare ${({name}) => name}`

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

const isPureText = (textOrAST: ASTObject | string): textOrAST is string =>
  typeof textOrAST === 'string' || textOrAST.hasOwnProperty('toString')

const coerceStringToAST = <T>(textOrAST: ASTObject<T> | string) =>
  isPureText(textOrAST) ? raw(textOrAST) : textOrAST

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
  indent: number,
  scope: {
    [variableName: string]: ASTObject & {toString(): string, length: number},
  }
}

const astRoot: ASTObject<NoData> = {
  type: 'root',
  data: {},
  reduce: (ctx) => ctx,
}

const emptyContext: TraverseState = {
  parts: [], processed: [], scopePath: [], scope: {}, parent: astRoot,
  indent: 0,
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

  test('conflicting variable names are renamed', () => {
    expect(
      print([
        declareVariable('example'),
        ({example}) => statement`echo ${example}`,
        declareVariable('example'),
        ({example}) => statement`echo ${example}`, // will be example_1
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

  describe('ensureASTObject', () => {
    test('[] => group', () => {
      expect(
        ensureASTObject([], emptyContext)
      ).toHaveProperty('type', 'group')
    })
    test('[text] => group with one raw node', () => {
      const result = ensureASTObject(['text'], emptyContext)
      expect(result).toHaveProperty('type', 'group')
      expect(result.data).toHaveProperty('children')
      expect(result.data.children).toHaveLength(1)
      expect(result.data.children[0]).toHaveProperty('type', 'raw')
    })
    test('text => one raw node', () => {
      const result = ensureASTObject('text', emptyContext)
      expect(result).toHaveProperty('type', 'raw')
      expect(result.data).toHaveProperty('text')
      expect(result.data.text).toBe('text')
    })
    test('() => [text] => group with one raw node', () => {
      const result = ensureASTObject(() => ['text'], emptyContext)
      expect(result).toHaveProperty('type', 'group')
      expect(result.data).toHaveProperty('children')
      expect(result.data.children).toHaveLength(1)
      expect(result.data.children[0]).toHaveProperty('type', 'raw')
    })
    test('() => text => one raw node', () => {
      const result = ensureASTObject(() => 'text', emptyContext)
      expect(result).toHaveProperty('type', 'raw')
      expect(result.data).toHaveProperty('text')
      expect(result.data.text).toBe('text')
    })
    test('() => statement => 2 nodes', () => {
      const result = ensureASTObject(() => statement`text`, emptyContext)
      expect(result).toHaveProperty('type', 'group')
      expect(result.data).toHaveProperty('children')
      expect(result.data.children).toHaveLength(2)
    })
  })
})

describe('utils', () => {
  test('combineAlternate', () => {
    expect(
      combineAlternate(['a', 'b', 'c'], [1, 2, 3])
    ).toMatchObject(['a', 1, 'b', 2, 'c', 3])
  })
})
