import * as ts from 'typescript'
import {
  CallExpression,
  ExpressionStatement,
  Identifier,
  StringLiteral,
} from 'typescript'
import * as Bash from '../ast/bash-ast'

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

// type NodesResolver = (
//   | ((scope: Scope) => readonly AllBashASTNodes[])
//   | AllBashASTNodes
//   )

// type NodesResolver = (
//   | ((scope: Scope) => readonly AllBashASTNodes[])
//   | AllBashASTNodes
//   )
type ResultResolver = Result | ((scope: Scope) => Result)
type Processed = {
  scopeInfo?: readonly IdentifierLookup[]
  result: Result | ((scope: Scope) => Result)
  // nodes?: readonly NodesResolver[]
  // errors?: any[]
}

type MergedScopeResults = {
  scopeInfo: readonly IdentifierLookup[]
  resultResolvers: readonly ResultResolver[]
}

export const translateTsAstToBashAst = (
  tsNodes: readonly ts.Node[],
  parentScope: Scope = new Scope({name: 'Root'}),
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
    name: parentScope.name,
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

const VISITORS: {
  [Key in Kinds]?: (node: any, scope: Scope) => Processed
} = {
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
        const lookup = scope.get(callee)
        if (!lookup) {
          return {
            errors: [
              {
                type: 'ReferenceError',
                message: `Unable to find '${callee}' in scope.`,
              },
            ],
          }
        }
        if (lookup.lookupKind === 'IMPORTED_FUNCTION') {
          const {nodes: processedArgs, errors} = translateTsAstToBashAst(
            args,
            scope,
          )
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

  // SyntaxList: (syntaxList: ts.SyntaxList) => {
  //   // TODO: need to sort by: imports, functions, vars, expressions
  //   return syntaxList
  //     .getChildren()
  //     .flatMap((child) => tsNodeToBashNode(child)) as Array<FileExpression>
  // },

  // EndOfFileToken: () => [],
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

export function processTsNode(node: ts.Node, scope: Scope): Processed {
  const syntaxKind = SyntaxKind[node.kind]
  const visitor = VISITORS[syntaxKind]
  if (!visitor) {
    return unimplementedVisitor(node)
  }
  return visitor(node, scope)
}

// NOTE: maybe it could be using 'typescript' directly as a TS plugin?
// then we could also add red squiggly marks for not implemented features, by node type in a given position!
// https://github.com/microsoft/TypeScript/wiki/Writing-a-Language-Service-Plugin
