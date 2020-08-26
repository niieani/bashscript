import * as ts from 'typescript'
import {
  CallExpression,
  ExpressionStatement,
  Identifier,
  StringLiteral,
  SyntaxKind,
} from 'typescript'
import {AllBashASTNodes, BashFile, FileExpression} from '../ast/bash-ast'

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
type Kinds = keyof typeof SyntaxKind

type IdentifierLookup =
  | ImportedFunctionIdentifierLookup
  | FunctionIdentifierLookup
  | VariableIdentifierLookup
type ImportedFunctionIdentifierLookup = {
  name: string
  lookupKind: 'IMPORTED_FUNCTION'
  importedFrom: string
}
type FunctionIdentifierLookup = {
  name: string
  lookupKind: 'FUNCTION'
}
type VariableIdentifierLookup = {
  name: string
  lookupKind: 'VARIABLE'
}

type Scope = Map<string, IdentifierLookup>

const makeScope = (parentScope?: Scope) => {
  return parentScope ? new Map(parentScope.entries()) : new Map()
}

type Processed = {
  scopeInfo: readonly IdentifierLookup[]
  nodes: readonly (
    | ((scope: Scope) => readonly AllBashASTNodes[])
    | AllBashASTNodes
  )[]
  errors: any[]
}

const toNodeToBashWithMeta = (a): Processed => {}

const VISITORS: {
  [Key in Kinds]?: (node: any) => AllBashASTNodes[]
} = {
  SourceFile: (sourceFile: ts.SourceFile): BashFile[] => {
    const {scopeInfo, nodes, errors} = sourceFile.statements.reduce(
      (statement, result) => {
        const {scopeInfo, nodes, errors} = toNodeToBashWithMeta(statement)
        return {
          scopeInfo: [...result.scopeInfo, ...scopeInfo],
          nodes: [...result.nodes, ...nodes],
          errors: [...result.errors, ...errors],
        }
      },
      {scopeInfo: [], nodes: [], errors: []},
    )

    const result = nodes.flatMap((node) =>
      typeof node === 'function' ? node(scopeInfo) : node,
    )

    return [
      {
        type: 'File',
        statements: sourceFile// TODO: need to sort by: imports, functions, vars, expressions (?)
        .statements
          // .getChildren()
          .flatMap((child) => tsNodeToBashNode(child)) as Array<FileExpression>,
      },
    ]
  },

  ImportDeclaration: (
    importDeclaration: ts.ImportDeclaration,
  ): AllBashASTNodes[] => {
    const result: AllBashASTNodes[] = []
    const {importClause, moduleSpecifier} = importDeclaration
    const importingFrom = (moduleSpecifier as StringLiteral).text
    if (importClause) {
      const {
        // default import:
        name,
        // named imports
        namedBindings,
      } = importClause
      if (name) {
        result.push({
          type: 'UnsupportedSyntax',
          message: 'Default imports are not supported',
        })
      }
      if (namedBindings) {
        if (namedBindings.kind === SyntaxKind.NamespaceImport) {
          result.push({
            type: 'UnsupportedSyntax',
            message: 'Namespace imports are not supported',
          })
        } else {
          const {elements} = namedBindings
          elements.forEach((importSpecifier) => {
            if (importSpecifier.propertyName) {
              result.push({
                type: 'UnsupportedSyntax',
                message: `Importing 'as' is not supported`,
              })
            }
            const elementBeingImported = importSpecifier.name.text
          })
        }
      }
    }
    return result
  },

  ExpressionStatement: (expressionStatement: ExpressionStatement) => {
    return tsNodeToBashNode(expressionStatement.expression)
  },

  CallExpression: (callExpression: CallExpression) => {
    const {expression, arguments: args} = callExpression
    if (expression.kind === SyntaxKind.Identifier) {
      const id = expression as Identifier
      const callee = id.text
      return (scope: Scope) => {
        const lookup = scope.get(callee)
        if (!lookup) {
          return {
            type: 'ReferenceError',
            message: `Unable to find '${callee}' in scope.`,
          }
        }
        // TODO: need to use TS type information to infer if imported type was a const or a function
        // for now we can assume CAPITALIZED imports are variables
        // lookup.lookupKind
      }
    }
  },

  // SyntaxList: (syntaxList: ts.SyntaxList) => {
  //   // TODO: need to sort by: imports, functions, vars, expressions
  //   return syntaxList
  //     .getChildren()
  //     .flatMap((child) => tsNodeToBashNode(child)) as Array<FileExpression>
  // },

  EndOfFileToken: () => [],
  // ArrayLiteral: writeArrayLiteral,
}

function unimplementedVisitor(node: ts.Node): AllBashASTNodes[] {
  // throw new Error(`Visitor for ${SyntaxKind[node.kind]} is not supported yet`)
  console.log(`Visitor for ${SyntaxKind[node.kind]} is not supported yet`)
  return []
}

export function tsNodeToBashNode(node: ts.Node): AllBashASTNodes[] {
  const syntaxKind = SyntaxKind[node.kind] as Kinds
  const visitor = VISITORS[syntaxKind]
  if (!visitor) {
    return unimplementedVisitor(node)
  }
  return visitor(node)
}

// NOTE: maybe it could be using 'typescript' directly as a TS plugin?
// then we could also add red squiggly marks for not implemented features, by node type in a given position!
// https://github.com/microsoft/TypeScript/wiki/Writing-a-Language-Service-Plugin
