import * as ts from 'typescript'
import {
  CallExpression,
  ExpressionStatement,
  Identifier,
  StringLiteral,
} from 'typescript'
import * as Bash from '../ast/bash-ast'
import {
  AllBashASTNodes,
  getChildrenRecursively,
  makeCallExpression,
  makeBashSafeFunctionName,
  makeBashSafeVariableName,
} from '../ast/bash-ast'
import {uniqBy} from 'ramda'

type Kinds = keyof typeof ts.SyntaxKind

// https://github.com/microsoft/TypeScript/issues/37574:
export const SyntaxKind = Object.fromEntries(
  Object.entries(ts.SyntaxKind).reduce<[number, Kinds][]>(
    (result, [key, value]) =>
      // only sequential
      typeof value === 'number' &&
      value > (result[result.length - 1]?.[0] ?? -1)
        ? [...result, [value, (key as unknown) as Kinds]]
        : result,
    [],
  ),
)

// type Visitors = typeof VISITORS
// type ImplementedNodeTypes = {
//   [K in keyof Visitors]: Visitors[K] extends typeof unimplementedVisitor
//     ? never
//     : K
// }[keyof Visitors]
// type ImplementedVisitorNodes = Parameters<Visitors[ImplementedNodeTypes]>[0]
// type SyntaxKinds = {
//   [Key in SyntaxKind]: typeof SyntaxKind[Key]
// }

// type Kinds = Extract<typeof SyntaxKind, string>

type IdentifierLookup =
  | ImportedFunctionIdentifierLookup
  | FunctionIdentifierLookup
  | VariableIdentifierLookup
type ImportedFunctionIdentifierLookup = {
  name: string
  bashName: string
  lookupKind: 'IMPORTED_FUNCTION'
  importedFrom: string
  scopeName: string
}
type FunctionIdentifierLookup = {
  name: string
  bashName: string
  lookupKind: 'FUNCTION'
  scopeName: string
}
type VariableIdentifierLookup = {
  name: string
  bashName: string
  lookupKind: 'VARIABLE'
  scopeName: string
}

export class Scope {
  parentScope: Scope
  /**
   * a bash-sanitized name for the scope
   */
  name: string
  byTSName = new Map<string, IdentifierLookup>()
  byBashName = new Map<string, IdentifierLookup>()
  type: 'FUNCTION' | 'FILE'

  get path(): string[] {
    return this.isRoot ? [this.name] : [...this.parentScope.path, this.name]
  }

  get fullName(): string {
    return this.path.join('.')
  }

  anonymousId = 0

  getNextAnonymousId() {
    return `anonymous.${++this.anonymousId}`
  }

  constructor({
    parentScope,
    name,
    type,
  }: {
    parentScope?: Scope
    name: string
    type: 'FUNCTION' | 'FILE'
  }) {
    this.parentScope = parentScope ?? this
    this.name = name
    this.type = type
  }

  get isRoot() {
    return this.parentScope === this
  }

  get(
    key: string,
    {
      skipRoot = false,
      keyType = 'byTSName',
    }: {skipRoot?: boolean; keyType?: 'byBashName' | 'byTSName'} = {},
  ): IdentifierLookup | undefined {
    return skipRoot && this.isRoot
      ? undefined
      : this[keyType].get(key) ??
          (this.isRoot
            ? undefined
            : this.parentScope.get(key, {skipRoot, keyType}))
  }

  has(
    key: string,
    {
      skipRoot = false,
      keyType = 'byTSName',
    }: {skipRoot?: boolean; keyType?: 'byBashName' | 'byTSName'} = {},
  ): boolean {
    return skipRoot && this.isRoot
      ? false
      : this[keyType].has(key) ??
          (this.isRoot
            ? undefined
            : this.parentScope.has(key, {skipRoot, keyType}))
  }

  populate(list: readonly IdentifierLookup[]) {
    const warnings: any[] = []
    list.forEach((item) => {
      const previousItem = this.get(item.name)
      if (previousItem) {
        warnings.push({
          type: 'IdentifierShadowing',
          message: `The identifier ${item.name} (${item.lookupKind}) is shadowing another element (${previousItem.lookupKind})`,
        })
      }

      const value =
        this.type === 'FUNCTION' && item.lookupKind === 'FUNCTION'
          ? {
              ...item,
              bashName: `${this.name}.${item.bashName}`,
            }
          : item

      this.byTSName.set(value.name, value)

      this.byBashName.set(value.bashName, value)
    })
    return {warnings}
  }
}

// class Scope extends Map<string, IdentifierLookup> {
//   name: string
//   constructor({
//     entries,
//     name,
//     parentScope,
//   }: {
//     name: string
//     entries?: readonly (readonly [string, IdentifierLookup])[] | null
//     parentScope?: Scope
//   }) {
//     const mergedEntries = [
//       ...(entries ?? []),
//       ...(parentScope ? Array.from(parentScope.entries()) : []),
//     ]
//     super(mergedEntries)
//     this.name = name
//   }
// }

// const makeScope = (parentScope?: Scope) => {
//   return parentScope ? new Map(parentScope.entries()) : new Map()
// }

type Result = {
  nodes?: readonly Bash.AllBashASTNodes[]
  errors?: readonly any[]
  warnings?: readonly any[]
}

type ResultResolver = Result | ((scope: Scope) => Result)
type Processed = {
  scopeInfo?: readonly IdentifierLookup[]
  result: Result | ((scope: Scope) => Result)
}

// TODO: maybe Result and Processed should be unified and we just run it until result contains no more functions?
// i.e. we can always return either {scopeInfo, result: {nodes, errors, scopeInfo}},
// or 'result' could be a function that returns {scopeInfo, result: {nodes, errors}}
// (or a function that returns it...)
// this way we could build the scopeInfo gradually

type MergedScopeResults = {
  scopeInfo: readonly IdentifierLookup[]
  resultResolvers: readonly ResultResolver[]
}

interface TranslateTsAstToBashAstParams {
  tsNodes: readonly ts.Node[]
  scope: Scope
  visitorOverrides?: Visitors
}

export const translateTsAstToBashAst = ({
  tsNodes,
  scope,
  visitorOverrides = {},
}: TranslateTsAstToBashAstParams): Result => {
  const {scopeInfo = [], resultResolvers = []} = tsNodes.reduce(
    (merged: MergedScopeResults, node: ts.Node): MergedScopeResults => {
      const {scopeInfo = [], result} = processTsNode({
        node: node,
        scope,
        visitorOverrides,
      })
      return {
        scopeInfo: [...(merged.scopeInfo ?? []), ...scopeInfo],
        resultResolvers: [...(merged.resultResolvers ?? []), result],
      }
    },
    {} as MergedScopeResults,
  )

  const {warnings} = scope.populate(scopeInfo)

  const results: Result[] = resultResolvers.map((result) =>
    typeof result === 'function' ? result(scope) : result,
  )

  return results.reduce(
    (result: Result, {errors = [], nodes = [], warnings = []}) => ({
      errors: [...(result.errors ?? []), ...errors],
      warnings: [...(result.warnings ?? []), ...warnings],
      nodes: [...(result.nodes ?? []), ...nodes],
    }),
    {warnings} as Result,
  )
}

type Visitors = {
  [Key in Kinds]?: (
    node: any,
    parentScope: Scope,
    visitorOverrides?: Visitors,
  ) => Processed
}

const VISITORS: Visitors = {
  SourceFile: (sourceFile: ts.SourceFile, parentScope, visitorOverrides) => {
    const {nodes, errors} = translateTsAstToBashAst({
      tsNodes: sourceFile.statements,
      scope: parentScope,
      visitorOverrides,
    })
    return {
      result: {
        nodes: [
          {
            type: 'File',
            statements: nodes,
            // TODO: need to sort by: imports, functions, vars, expressions (?)
            // .getChildren()
            // .flatMap((child) => tsNodeToBashNode(child)) as Array<FileExpression>,
          } as Bash.BashFile,
        ],
        errors,
      },
    }
  },

  ImportDeclaration: (
    importDeclaration: ts.ImportDeclaration,
    scope: Scope,
  ): Processed => {
    const nodes: Bash.AllBashASTNodes[] = []
    const scopeInfo: IdentifierLookup[] = []
    const errors: any[] = []
    const {importClause, moduleSpecifier} = importDeclaration
    const importedFrom = (moduleSpecifier as StringLiteral).text
    if (importClause) {
      const {
        // default import:
        name,
        // named imports
        namedBindings,
      } = importClause
      if (name) {
        errors.push({
          type: 'UnsupportedSyntax',
          message: 'Default imports are not supported',
        })
      }
      if (namedBindings) {
        if (namedBindings.kind === ts.SyntaxKind.NamespaceImport) {
          errors.push({
            type: 'UnsupportedSyntax',
            message: 'Namespace imports are not supported',
          })
        } else {
          const {elements} = namedBindings
          elements.forEach((importSpecifier) => {
            if (importSpecifier.propertyName) {
              errors.push({
                type: 'UnsupportedSyntax',
                message: `Importing 'as' is not supported`,
              })
            }
            const elementBeingImported = importSpecifier.name.text
            scopeInfo.push({
              importedFrom,
              name: elementBeingImported,
              // TODO: need to use TS type information to infer if imported type was a const or a function
              // for now we can assume CAPITALIZED imports are variables
              lookupKind: 'IMPORTED_FUNCTION',
              // for now we don't need to makeBashSafeFunctionName(elementBeingImported) because
              // we don't support renaming yet!
              bashName: elementBeingImported,
              scopeName: scope.name,
            })
          })
        }
      }
    }
    return {
      result: {
        errors,
        nodes,
      },
      scopeInfo,
    }
  },

  ExpressionStatement: (
    expressionStatement: ExpressionStatement,
    scope: Scope,
    visitorOverrides,
  ) => {
    return processTsNode({
      node: expressionStatement.expression,
      scope,
      visitorOverrides,
    })
  },

  ReturnStatement: (statement: ts.ReturnStatement, scope, visitorOverrides) => {
    const {expression} = statement
    if (!expression) {
      return {
        result: {
          nodes: [makeCallExpression('return')],
        },
      }
    }
    // currently, just execute the return expression
    return processTsNode({
      node: expression,
      scope,
      visitorOverrides,
    })
  },

  CallExpression: (
    callExpression: ts.CallExpression,
    parentScope: Scope,
    visitorOverrides,
  ): Processed => {
    const nodes: Bash.AllBashASTNodes[] = []
    const scopeInfo: IdentifierLookup[] = []
    const errors: any[] = []

    const {expression, arguments: args} = callExpression
    if (expression.kind !== ts.SyntaxKind.Identifier) {
      return {
        result: {
          errors: [
            {
              type: 'UnsupportedSyntax',
              message: `The call must be invoked on an Identifier, but it was a ${
                SyntaxKind[expression.kind]
              }.`,
            },
          ],
        },
      }
    }
    const id = expression as Identifier
    const callee = id.text
    // TODO: probably should add @fromModule to scope
    return {
      result: (scope: Scope): Result => {
        const lookup = scope.get(callee) ?? {
          name: callee,
          lookupKind: 'FUNCTION',
          scopeName: 'Global',
        }
        // if (!lookup) {
        //   return {
        //     errors: [
        //       {
        //         type: 'ReferenceError',
        //         message: `Unable to find '${callee}' in scope.`,
        //       },
        //     ],
        //   }
        // }
        const {
          nodes: processedArgs = [],
          errors = [],
        } = translateTsAstToBashAst({
          tsNodes: args,
          scope,
          visitorOverrides,
        })
        if (lookup.lookupKind === 'IMPORTED_FUNCTION') {
          const callExpression: Bash.CallExpression = {
            type: 'CallExpression',
            callee: {
              type: 'FunctionIdentifier',
              name: '@fromModule',
            },
            args: [
              {
                type: 'StringLiteral',
                value: lookup.importedFrom,
              },
              {
                type: 'StringLiteral',
                value: lookup.name,
              },
              // ... now remaining other args
              ...(processedArgs as Bash.CallExpressionArgument[]),
            ],
          }
          return {
            nodes: [callExpression],
            errors,
          }
        } else if (lookup.lookupKind === 'FUNCTION') {
          const callExpression: Bash.CallExpression = {
            type: 'CallExpression',
            callee: {
              type: 'FunctionIdentifier',
              name: lookup.name,
            },
            args: [
              // ... now remaining other args
              ...(processedArgs as Bash.CallExpressionArgument[]),
            ],
          }
          return {
            nodes: [callExpression],
            errors,
          }
        } else if (lookup.lookupKind === 'VARIABLE') {
          const callExpression: Bash.CallExpression = {
            type: 'CallExpression',
            callee: {
              type: 'FunctionIdentifier',
              name: '@callVar',
            },
            args: [
              {
                type: 'StringLiteral',
                value: lookup.name,
                // TODO: support calling imported variables
              },
              // ... now remaining other args
              ...(processedArgs as Bash.CallExpressionArgument[]),
            ],
          }
          return {
            nodes: [callExpression],
            errors,
          }
        }
        return {}
      },
    }
  },

  StringLiteral: (literal: ts.StringLiteral) => {
    return {
      result: {
        nodes: [
          {
            type: 'StringLiteral',

            value: literal.text,
          },
        ],
      },
    }
  },

  NumericLiteral: (literal: ts.NumericLiteral) => {
    return {
      result: {
        nodes: [
          {
            type: 'NumericLiteral',
            value: literal.text,
          },
        ],
      },
    }
  },

  VariableStatement: (
    statement: ts.VariableStatement,
    parentScope,
    visitorOverrides,
  ) => {
    const {declarationList} = statement
    return {
      result: translateTsAstToBashAst({
        tsNodes: declarationList.declarations,
        scope: parentScope,
        visitorOverrides,
      }),
    }
  },

  VariableDeclaration: (
    declaration: ts.VariableDeclaration,
    parentScope,
    visitorOverrides,
  ) => {
    const {name: nameIdentifier, initializer} = declaration

    if (initializer && SyntaxKind[initializer.kind] === 'ArrowFunction') {
      return VISITORS.FunctionDeclaration!(
        {...initializer, name: nameIdentifier},
        parentScope,
        visitorOverrides,
      )
    }

    const {
      nodes: initializerNodes = [],
      errors: initializerErrors = [],
    } = initializer
      ? translateTsAstToBashAst({
          tsNodes: [initializer],
          // TODO: likely a new scope that doesn't infect this one
          scope: parentScope,
          visitorOverrides,
        })
      : {}
    const errors = [...initializerErrors]
    if (initializerNodes.length > 1) {
      errors.push({
        type: 'UnsupportedSyntax',
        message: `Initializer contained more than 1 node, which is not supported yet: ${initializerNodes
          .map((n) => n.type)
          .join(', ')}`,
      })
    }

    let [bashInitializer] = initializerNodes

    if (bashInitializer?.type === 'CallExpression') {
      // wrap a CallExpression in a CallReference when in initializer position
      bashInitializer = {
        type: 'CallReference',
        quoted: true,
        expression: bashInitializer,
      } as Bash.CallReference
    }

    if (nameIdentifier.kind !== ts.SyntaxKind.Identifier) {
      errors.push({
        type: 'UnsupportedSyntax',
        message: `Identifier is an unsupported kind: ${
          SyntaxKind[nameIdentifier.kind]
        }`,
      })
      return {result: {errors}}
    }
    const {text: name} = nameIdentifier
    return {
      result: {
        nodes: [
          {
            type: 'VariableDeclaration',
            identifier: {
              type: 'VariableIdentifier',
              name,
            },
            initializer: bashInitializer as Bash.AssignmentValue,
          },
        ],
        errors,
      },
      scopeInfo: [
        {
          name,
          lookupKind: 'VARIABLE',
          scopeName: parentScope.name,
          bashName: makeBashSafeVariableName(name),
        },
      ],
    }
  },

  ArrowFunction: (
    arrowFn: ts.ArrowFunction,
    scope: Scope,
    visitorOverrides,
  ) => {
    return VISITORS.FunctionDeclaration!(
      {...arrowFn, name: {text: scope.getNextAnonymousId()}},
      scope,
      visitorOverrides,
    )
  },

  FunctionDeclaration: (
    functionDeclaration: ts.FunctionDeclaration,
    parentScope: Scope,
    visitorOverrides,
  ): Processed => {
    const {name, body, parameters} = functionDeclaration
    const errors: any[] = []
    if (!name) {
      errors.push({
        type: 'IncompleteSyntax',
        message: `Missing name for: ${SyntaxKind[functionDeclaration.kind]}`,
      })
    }
    if (!body) {
      errors.push({
        type: 'IncompleteSyntax',
        message: `Missing body for: ${SyntaxKind[functionDeclaration.kind]}`,
      })
    }
    if (!name || !body) return {result: {errors}}
    const originalFnName = name.text
    const bashFnName = makeBashSafeFunctionName(originalFnName)
    const fnScope = new Scope({parentScope, name: bashFnName, type: 'FUNCTION'})
    return {
      result: (): Result => {
        const bashParams = translateTsAstToBashAst({
          tsNodes: parameters,
          scope: fnScope,
          visitorOverrides,
        })
        const bashStatements = translateTsAstToBashAst({
          tsNodes: body.statements,
          scope: fnScope,
          visitorOverrides,
        })

        const uniqByName = uniqBy<{name: string}, string>(({name}) => name)

        const {
          nodes: nestedFunctionDeclarations,
          statements: bashStatementNodes,
        } = (bashStatements.nodes ?? []).reduce<{
          statements: AllBashASTNodes[]
          nodes: AllBashASTNodes[]
        }>(
          ({statements, nodes}, statement) => {
            if (statement.type !== 'FunctionDeclaration') {
              return {
                statements: [...statements, statement],
                nodes,
              }
            }
            const subFnBashName = statement.name.name
            const subFnLookup = fnScope.get(subFnBashName, {
              keyType: 'byBashName',
            })!
            const subFnActualBashName = subFnLookup.bashName
            // traverse all children (deep) to find all VariableIdentifiers except those inside other Functions
            const children = getChildrenRecursively(statement)
            const referencedScopedIdentifiers = uniqByName(
              children.filter(
                (
                  child,
                ): child is Bash.VariableIdentifier | Bash.FunctionIdentifier =>
                  (child.type === 'VariableIdentifier' ||
                    child.type === 'FunctionIdentifier') &&
                  fnScope.has(child.name, {
                    skipRoot: true,
                    keyType: 'byBashName',
                  }) &&
                  // skip references to self
                  child.name !== subFnActualBashName,
              ),
            )
            return {
              nodes: [
                ...nodes,
                {
                  ...statement,
                  name: {
                    ...statement.name,
                    name: subFnActualBashName,
                  },
                  statements: [
                    ...referencedScopedIdentifiers.map((identifier, index) => ({
                      type: 'CallExpression',
                      callee: {
                        type: 'FunctionIdentifier',
                        name: 'eval',
                      },
                      args: [
                        {
                          type: 'VariableReference',
                          quoted: true,
                          identifier: {
                            type: 'VariableIdentifier',
                            name: String(index + 1),
                          },
                        },
                      ],
                    })),
                    ...referencedScopedIdentifiers.map(() => ({
                      type: 'CallExpression',
                      callee: {
                        type: 'FunctionIdentifier',
                        name: 'shift',
                      },
                      args: [],
                    })),
                    ...statement.statements,
                  ],
                } as Bash.FunctionDeclaration,
              ],
              statements: [
                ...statements,
                {
                  type: 'VariableDeclaration',
                  identifier: {
                    type: 'VariableIdentifier',
                    name: '__declaration',
                  },
                  initializer: {
                    type: 'ArrayLiteral',
                    elements: [
                      {
                        type: 'StringLiteral',
                        value: 'function',
                      },
                      {
                        type: 'StringLiteral',
                        value: subFnActualBashName,
                      },
                      ...referencedScopedIdentifiers.map((identifier) => ({
                        type: 'CallReference',
                        quoted: true,
                        expression: {
                          type: 'CallExpression',
                          callee: {
                            type: 'FunctionIdentifier',
                            name: 'declare',
                          },
                          args: [
                            {
                              type: 'StringLiteral',
                              value: '-p',
                            },
                            {
                              type: 'StringLiteral',
                              value: identifier.name,
                            },
                          ],
                        },
                      })),
                    ],
                  },
                } as Bash.VariableDeclaration,
              ],
            }
          },
          {statements: [], nodes: []} as {
            statements: Bash.FunctionBodyExpression[]
            nodes: AllBashASTNodes[]
          },
        )

        // the function might have been renamed, so we use the name from scope
        const fnLookup = fnScope.get(originalFnName)!

        return {
          nodes: [
            {
              type: 'FunctionDeclaration',
              name: {
                type: 'FunctionIdentifier',
                name: fnLookup.bashName,
              },
              parameters: (bashParams.nodes ?? []) as Bash.Parameter[],
              statements: bashStatementNodes as Bash.FunctionBodyExpression[],
            },
            ...nestedFunctionDeclarations,
          ],
          errors: [
            ...(bashParams.errors ?? []),
            ...(bashStatements.errors ?? []),
          ],
        }
      },
      scopeInfo: [
        {
          scopeName: parentScope.name,
          name: originalFnName,
          lookupKind: 'FUNCTION',
          bashName: bashFnName,
        },
      ],
    }
  },

  Identifier: (identifier: ts.Identifier, parentScope) => {
    return {
      result: (scope) => {
        const lookup = scope.get(identifier.text)
        if (!lookup) {
          return {
            errors: [
              {
                type: 'ReferenceError',
                message: `Unable to find '${identifier.text}' in scope.`,
              },
            ],
          }
        }
        return {
          nodes: [
            lookup.lookupKind === 'VARIABLE'
              ? {
                  type: 'VariableReference',
                  quoted: true,
                  identifier: {
                    type: 'VariableIdentifier',
                    name: lookup.bashName,
                  },
                }
              : {
                  type: 'FunctionIdentifier',
                  name: lookup.bashName,
                },
          ],
        }
      },
    }
  },

  // Parameter: (parameter: ts.ParameterDeclaration) => {
  //   // TODO
  //   return {result: {}}
  // },
}

function unimplementedVisitor(node: ts.Node): Processed {
  // throw new Error(`Visitor for ${SyntaxKind[node.kind]} is not supported yet`)
  // console.log(`Visitor for ${SyntaxKind[node.kind]} is not supported yet`)
  return {
    result: {
      errors: [
        {
          type: 'UnsupportedSyntax',
          message: `Visitor for ${SyntaxKind[node.kind]} is not supported yet`,
        },
      ],
    },
    scopeInfo: [],
  }
}
// .filter(([key, value]) => !Number.isNaN(Number(key)))

interface ProcessTsNodeParams {
  node: ts.Node
  scope: Scope
  visitorOverrides?: Visitors
}

export function processTsNode({
  node,
  scope,
  visitorOverrides = {},
}: ProcessTsNodeParams): Processed {
  const syntaxKind = SyntaxKind[node.kind]
  const visitor = visitorOverrides[syntaxKind] ?? VISITORS[syntaxKind]
  if (!visitor) {
    return unimplementedVisitor(node)
  }
  return visitor(node, scope)
}

// NOTE: maybe it could be using 'typescript' directly as a TS plugin?
// then we could also add red squiggly marks for not implemented features, by node type in a given position!
// https://github.com/microsoft/TypeScript/wiki/Writing-a-Language-Service-Plugin
