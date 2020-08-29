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
  FunctionBodyExpression,
  getChildrenRecursively,
  Parameter,
} from '../ast/bash-ast'
import {uniqBy} from 'ramda'

type Kinds = keyof typeof ts.SyntaxKind

// https://github.com/microsoft/TypeScript/issues/37574:
const SyntaxKind = Object.fromEntries(
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
  lookupKind: 'IMPORTED_FUNCTION'
  importedFrom: string
  scopeName: string
}
type FunctionIdentifierLookup = {
  name: string
  lookupKind: 'FUNCTION'
  scopeName: string
}
type VariableIdentifierLookup = {
  name: string
  lookupKind: 'VARIABLE'
  scopeName: string
}

export class Scope {
  parentScope: Scope
  name: string
  map = new Map<string, IdentifierLookup>()
  type: 'FUNCTION' | 'FILE'

  get path(): string[] {
    return this.isRoot ? [this.name] : [...this.parentScope.path, this.name]
  }

  get fullName(): string {
    return this.path.join('.')
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

  get(key: string, skipRoot = false): IdentifierLookup | undefined {
    return skipRoot && this.isRoot
      ? undefined
      : this.map.get(key) ??
          (this.isRoot ? undefined : this.parentScope.get(key))
  }

  has(key: string, skipRoot = false): boolean {
    return skipRoot && this.isRoot
      ? false
      : this.map.has(key) ??
          (this.isRoot ? undefined : this.parentScope.has(key))
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
      this.map.set(item.name, item)
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

  // TODO: is this the place for changing the name? we need original name for future references though
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
    // return translateTsAstToBashAst([expressionStatement], scope)
    return processTsNode({
      node: expressionStatement.expression,
      scope: scope,
      visitorOverrides,
    })
  },

  CallExpression: (
    callExpression: CallExpression,
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
    // TODO: probably should add @module to scope
    return {
      result: (scope: Scope): Result => {
        const lookup = scope.get(callee) ?? {
          name: callee,
          lookupKind: 'FUNCTION',
          scopeName: 'Root',
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
        const {nodes: processedArgs, errors} = translateTsAstToBashAst({
          tsNodes: args,
          scope: scope,
          visitorOverrides,
        })
        if (lookup.lookupKind === 'IMPORTED_FUNCTION') {
          const callExpression: Bash.CallExpression = {
            type: 'CallExpression',
            callee: {
              type: 'FunctionIdentifier',
              name: '@module',
            },
            args: [
              {
                type: 'StringLiteral',
                style: 'SINGLE_QUOTED',
                value: lookup.importedFrom,
              },
              {
                type: 'StringLiteral',
                style: 'SINGLE_QUOTED',
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
                style: 'SINGLE_QUOTED',
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
            style: 'SINGLE_QUOTED',
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
    const {
      nodes: initializerNodes = [],
      errors: initializerErrors = [],
    } = initializer
      ? translateTsAstToBashAst({
          tsNodes: [initializer],
          scope: parentScope,
          visitorOverrides,
        })
      : {}
    const errors = [...initializerErrors]
    const bashInitializer =
      initializerNodes.length === 0
        ? undefined
        : initializerNodes.length === 1 &&
          initializerNodes[0].type.endsWith('Literal')
        ? (initializerNodes[0] as Bash.AssignmentValue)
        : // TODO: we want special handling for this case
          undefined
    if (initializerNodes.length > 1) {
      errors.push({
        type: 'UnsupportedSyntax',
        message: `Initializer contained more than 1 node, which is not supported yet: ${initializerNodes
          .map((n) => n.type)
          .join(', ')}`,
      })
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
            initializer: bashInitializer,
          },
        ],
        errors,
      },
      scopeInfo: [
        {
          name,
          lookupKind: 'VARIABLE',
          scopeName: parentScope.name,
        },
      ],
    }
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
    const fnName = name.text
    const fnScope = new Scope({parentScope, name: fnName, type: 'FUNCTION'})
    return {
      result: (scope): Result => {
        const bashParams = translateTsAstToBashAst({
          tsNodes: parameters,
          scope: fnScope,
          visitorOverrides,
        })
        // TODO: make this check more robust:
        // if (scope.name.includes('Function:')) {
        //   return {
        //     // nodes: [
        //     //   {
        //     //
        //     //   }
        //     // ]
        //     errors: [
        //       {
        //         type: 'UnsupportedSyntax',
        //         message: `Nesting functions is not supported yet.`,
        //       },
        //     ],
        //   }
        // }
        const bashStatements = translateTsAstToBashAst({
          tsNodes: body.statements,
          scope: fnScope,
          visitorOverrides,
          // visitorOverrides: {
          //   ...visitorOverrides,
          //   FunctionDeclaration: (innerDeclaration: ts.FunctionDeclaration, _parentScope, _this) => {
          //
          //   },
          // }
        })

        const uniqByName = uniqBy<{name: string}, string>(({name}) => name)

        const {nodes, statements} = (bashStatements.nodes ?? []).reduce<{
          statements: AllBashASTNodes[]
          nodes: AllBashASTNodes[]
        }>(
          ({statements, nodes}, statement) => {
            if (statement.type !== 'FunctionDeclaration')
              return {
                statements: [...statements, statement],
                nodes,
              }

            const subFnName = statement.name.name
            // traverse all children (deep) to find all VariableIdentifiers except those inside other Functions
            const children = getChildrenRecursively(statement)
            const referencedScopedIdentifiers = uniqByName(
              children.filter(
                (
                  child,
                ): child is Bash.VariableIdentifier | Bash.FunctionIdentifier =>
                  (child.type === 'VariableIdentifier' ||
                    child.type === 'FunctionIdentifier') &&
                  // TODO: refactor scopeName to real scope with a 'scopeType' or keep depth or something
                  fnScope.has(child.name, true) &&
                  // skip references to self
                  child.name !== subFnName,
              ),
            )
            return {
              nodes: [...nodes, statement],
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
                        style: 'SINGLE_QUOTED',
                        value: 'function',
                      },
                      {
                        type: 'StringLiteral',
                        style: 'SINGLE_QUOTED',
                        value: `${fnName}.${subFnName}`,
                      },
                      ...referencedScopedIdentifiers.map((identifier) => ({
                        type: 'TemplateLiteral',
                        expressions: [
                          {
                            type: 'CallReference',
                            expression: {
                              type: 'CallExpression',
                              callee: {
                                type: 'FunctionIdentifier',
                                name: 'declare',
                              },
                              args: [
                                {
                                  type: 'StringLiteral',
                                  style: 'SINGLE_QUOTED',
                                  value: '-p',
                                },
                                {
                                  type: 'StringLiteral',
                                  style: 'SINGLE_QUOTED',
                                  value: identifier.name,
                                },
                              ],
                            },
                          },
                        ],
                        quasis: [
                          {
                            type: 'TemplateElement',
                            value: '',
                          },
                          {
                            type: 'TemplateElement',
                            value: '',
                          },
                        ],
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

        const nestedFunctionDeclarations = (bashStatements.nodes ?? []).filter(
          (statement) => statement.type === 'FunctionDeclaration',
        )

        // translate the nested function definitions:
        const bashStatementNodes = (bashStatements.nodes ?? []).map(
          (statement) => {
            if (statement.type !== 'FunctionDeclaration') {
              return statement
            }
          },
        )

        return {
          nodes: [
            {
              type: 'FunctionDeclaration',
              name: {
                type: 'FunctionIdentifier',
                name: fnName,
              },
              parameters: (bashParams.nodes ?? []) as Bash.Parameter[],
              // TODO: need to handle
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
          name: name.text,
          lookupKind: 'FUNCTION',
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
            {
              type:
                lookup.lookupKind === 'VARIABLE'
                  ? 'VariableIdentifier'
                  : 'FunctionIdentifier',
              name: lookup.name,
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
