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
type ASTExpression = ScopeContextToAST | ASTResolvedExpression | Array<ScopeContextToAST | ASTResolvedExpression>
type ASTList = Array<ASTExpression>

type ASTType =
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

const last = <T>(array: Array<T>): T | undefined => array.slice().reverse()[0]
const isBeginningOfLine = (context: TraverseState) => {
  const token = last(context.parts)
  return !token || token === newLine
}

const ensureStarter = ({_context: context}: ScopeContext) =>
  (context.indent > 0 && isBeginningOfLine(context)) ? starter : ''

const comment = (comment : string, withSpace = true): ASTObject<{comment: string}> => ({
  reduce: defaultReduce,
  type: 'comment',
  parts: [
    ensureStarter,
    `#${withSpace ? ' ' : ''}${comment}`,
    terminator,
  ],
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
  ...parts: Array<ASTExpression | undefined>,
): Array<ASTObject> => (
  parts.every(part => typeof part !== 'function')
    ? combineAlternate(
        Array.from(strings),
        parts.flatten(1) as Array<string | ASTObject>
      )
      .filter(node => node !== undefined && (!shouldTreatAsPureText(node) || node.length > 0))
      .map(coerceStringToAST)
    : [
      astGroup(
        ({_context: context}) => ensureASTObject(
          combineAlternate(
            Array.from(strings).map(coerceStringToAST),
            parts
              .filter(part => typeof part !== 'undefined')
              .map((part) => ensureASTObject(part!, context))
          ),
          context,
        )
      )
    ]
  )

const statement = (
  strings: TemplateStringsArray,
  ...parts: Array<ASTExpression | undefined>,
): Array<ASTObject> => {
  const applied = ast(strings, ...parts)
  const [first, ...rest] = applied
  const [last] = rest.reverse()
  return [
    ...(first && first.type !== 'starter' ? [starter] : []),
    ...applied,
    ...(last && last.type !== 'terminator' ? [terminator] : []),
  ]
}

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

/**
 * adds a variable to scope and prints its name
 */
const addToScope = (name: string) => defineReducer({
  data: {name},
  reducer: ({scope, parts, parent, ...context}: TraverseState): TraverseState => {
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
  enhance(addToScope(name)),
  initializer,
)

const inIsolatedScope = (body: ASTExpression, scopeDescription: string) => defineReducer({
  reducer: (context) => {
    const {
      indent, processed, scope, scopePath, parent, partsToExtract, parts
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
      }
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

type FunctionAST = {name: string, body: ASTExpression}
const declareFunction = ({name, body}: FunctionAST): ASTObject<FunctionAST> => ({
  type: 'function',
  data: {name, body},
  reduce: defaultReduce,
  parts: statement`function ${enhance(addToScope(name))} {
${enhance(inIsolatedScope(body, name))}
}`
})

const enhance = <T>(reduce: DefinedReducer<T>): ASTObject<T> => ({
  type: 'enhance',
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

const shouldTreatAsPureText = (textOrAST: ASTObject | string): textOrAST is string =>
  typeof textOrAST === 'string' || textOrAST.hasOwnProperty('toString')

const coerceStringToAST = <T>(textOrAST: ASTObject<T> | string) =>
  shouldTreatAsPureText(textOrAST) ? raw(textOrAST) : textOrAST

const ensureASTObject = (node : ASTExpression, context : TraverseState): ASTObject =>
  Array.isArray(node)
    ? astGroup(...node.flatten(100).map(coerceStringToAST))
    : typeof node === 'function'
      ? ensureASTObject(node(scopeHelper(context)), context)
      : coerceStringToAST(node)

// const ast : ASTList = [
//   comment(`hello`),
// ]

interface TraverseState {
  parts: Array<string>
  partsToExtract: Array<string>
  processed: Array<ASTObject>
  scopePath: Array<string>
  parent: ASTObject
  indent: number,
  scope: {
    [variableName: string]: (ASTObject & {toString(): string, length: number} | undefined),
  }
}

const astRoot: ASTObject<NoData> = {
  type: 'root',
  data: {},
  reduce: (ctx) => ctx,
}

const createScopeProxy = (scope: TraverseState['scope'] = {}) => new Proxy(
  scope,
  {
    get: function(target, property, receiver): ASTObject & {toString(): string, length: number} {
      if (property in target) {
        return target[property]!
      }
      // workaround for jest:
      if (property === 'getMockName') return (() => 'Scope') as any
      if (property === 'mock') return {calls: []} as any

      return {
        type: 'unknown',
        data: {},
        length: property.toString().length,
        reduce: (context) => context,
        parts: [],
        toString: () => property.toString(),
      }
    }
  }
)

const emptyContext: TraverseState = {
  parts: [],
  partsToExtract: [],
  processed: [],
  scopePath: [],
  scope: createScopeProxy(),
  parent: astRoot,
  indent: 0,
}

const isSkipType = (type: ASTType) => {
  switch (type) {
    case 'enhance':
    case 'group':
      return true
    default:
      return false
  }
}

const reduceAST = (ast : ASTList, {parent: astParent, ...context} : TraverseState = emptyContext): TraverseState =>
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
    {...context, parent: astParent}
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

  test('function declaration', () => {
    expect(
      print([
        declareFunction({
          name: 'example',
          body: statement`echo "this is awesome"`,
        }),
      ])
    ).toMatchSnapshot()
  })

  test('access the AST type of declared function', () => {
    expect(
      print([
        declareFunction({
          name: 'setMood',
          body: [
            declareVariable('mood', raw('$1')),
            comment('this will be a recursive call'),
            ({setMood}) => statement`${setMood} "awesome, because it's a ${setMood && setMood.type}"`,
          ],
        }),
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
