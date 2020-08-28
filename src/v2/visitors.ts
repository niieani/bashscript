import * as ts from 'typescript'
import {
  CallExpression,
  ExpressionStatement,
  Identifier,
  StringLiteral,
} from 'typescript'
import * as Bash from '../ast/bash-ast'
import {FunctionBodyExpression, Parameter} from '../ast/bash-ast'

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

class Scope extends Map<string, IdentifierLookup> {
  name: string
  constructor({
    entries,
    name,
    parentScope,
  }: {
    name: string
    entries?: readonly (readonly [string, IdentifierLookup])[] | null
    parentScope?: Scope
  }) {
    const mergedEntries = [
      ...(entries ?? []),
      ...(parentScope ? Array.from(parentScope.entries()) : []),
    ]
    super(mergedEntries)
    this.name = name
  }
}

// const makeScope = (parentScope?: Scope) => {
//   return parentScope ? new Map(parentScope.entries()) : new Map()
// }

type Result = {
  nodes?: readonly Bash.AllBashASTNodes[]
  errors?: readonly any[]
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

export const translateTsAstToBashAst = (
  tsNodes: readonly ts.Node[],
  parentScope: Scope = new Scope({name: 'Root'}),
  childScopeName: string = `${parentScope.name}.Child`,
): Result => {
  const {scopeInfo = [], resultResolvers = []} = tsNodes.reduce(
    (merged: MergedScopeResults, node: ts.Node): MergedScopeResults => {
      const {scopeInfo = [], result} = processTsNode(node, parentScope)
      return {
        scopeInfo: [...(merged.scopeInfo ?? []), ...scopeInfo],
        resultResolvers: [...(merged.resultResolvers ?? []), result],
      }
    },
    {} as MergedScopeResults,
  )
  // TODO: is this the place for changing the name? we need original name for future references though
  const scope = new Scope({
    name: childScopeName,
    entries: scopeInfo.map((element) => [element.name, element]),
  })
  const results: Result[] = resultResolvers.map((result) =>
    typeof result === 'function' ? result(scope) : result,
  )
  return results.reduce(
    (result: Result, {errors = [], nodes = []}) => ({
      errors: [...(result.errors ?? []), ...errors],
      nodes: [...(result.nodes ?? []), ...nodes],
    }),
    {} as Result,
  )
}

type Visitors = {
  [Key in Kinds]?: (node: any, scope: Scope) => Processed
}

const VISITORS: Visitors = {
  SourceFile: (sourceFile: ts.SourceFile) => {
    const {nodes, errors} = translateTsAstToBashAst(
      sourceFile.statements,
      new Scope({name: 'File'}),
    )
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
  ) => {
    // return translateTsAstToBashAst([expressionStatement], scope)
    return processTsNode(expressionStatement.expression, scope)
  },

  CallExpression: (callExpression: CallExpression, scope: Scope): Processed => {
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
        const {nodes: processedArgs, errors} = translateTsAstToBashAst(
          args,
          scope,
        )
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

  VariableStatement: (statement: ts.VariableStatement, scope) => {
    const {declarationList} = statement
    return {
      result: translateTsAstToBashAst(declarationList.declarations, scope),
    }
  },

  VariableDeclaration: (declaration: ts.VariableDeclaration, scope) => {
    const {name: nameIdentifier, initializer} = declaration
    const {
      nodes: initializerNodes = [],
      errors: initializerErrors = [],
    } = initializer ? translateTsAstToBashAst([initializer], scope) : {}
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
          scopeName: scope.name,
        },
      ],
    }
  },

  FunctionDeclaration: (
    functionDeclaration: ts.FunctionDeclaration,
    parentScope: Scope,
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
    return {
      result: (scope): Result => {
        const bashParams = translateTsAstToBashAst(
          parameters,
          scope,
          `Function:${fnName}`,
        )
        // TODO: make this check more robust:
        if (scope.name.includes('Function:')) {
          return {
            // nodes: [
            //   {
            //
            //   }
            // ]
            errors: [
              {
                type: 'UnsupportedSyntax',
                message: `Nesting functions is not supported yet.`,
              },
            ],
          }
        }
        const bashStatements = translateTsAstToBashAst(
          body.statements,
          scope,
          `Function:${fnName}`,
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
              statements: (bashStatements.nodes ??
                []) as Bash.FunctionBodyExpression[],
            },
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

export function processTsNode(
  node: ts.Node,
  scope: Scope,
  visitorOverrides: Visitors = {},
): Processed {
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
