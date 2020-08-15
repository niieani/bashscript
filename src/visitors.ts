import * as AST from 'ts-morph'
import {
  addToScopeAndReplaceUsage,
  addToScopeAndWrite,
  extractedToRootScope,
} from './writer/scope'
import {getNameGenerator} from './util/visitor'
import {flatmapSimple} from './util/flatmap-simple'
import {getCommentObjects, getComments} from './util/ast'
import {ASTExpression, ASTObject} from './writer/types'
import {
  declareFunction,
  declareVariable,
  referenceVar,
} from './writer/syntax/parts'
import {comment} from './writer/syntax/comment'
import {ast, statement} from './writer/statement'
import {newLine} from './writer/syntax/starter'

export type VisitorReturn = Array<ASTObject>

export function unsupportedVisitor(node: AST.Node): VisitorReturn {
  return [
    // ...getCommentObjects(node),
    ...node
      .getText()
      .split('\n')
      .map((line) =>
        comment(
          `<unsupported> ${line.padEnd(40, ' ')} # ${node.getKindName()}`,
        ),
      ),
  ]
}

export function commentVisitor(node: AST.Node): VisitorReturn {
  // return [...getCommentObjects(node)]
  return [
    // ...getCommentObjects(node),
    ...node
      .getText()
      .split('\n')
      .map((line) => comment(line)),
  ]
}

export function genericNodeVisitor(
  node: AST.Node,
  rootScope = true,
): VisitorReturn {
  switch (node.getKind()) {
    case AST.SyntaxKind.ExpressionStatement:
      return expressionVisitor(node as AST.Node<AST.ts.ExpressionStatement>)
    case AST.SyntaxKind.FunctionDeclaration:
      return functionVisitor(node as AST.FunctionDeclaration, rootScope)
    case AST.SyntaxKind.VariableStatement:
      return variableStatementVisitor(node as AST.VariableStatement)
    case AST.SyntaxKind.ImportDeclaration:
      return importDeclarationVisitor(node as AST.ImportDeclaration)
    case AST.SyntaxKind.MultiLineCommentTrivia:
    case AST.SyntaxKind.SingleLineCommentTrivia:
      return commentVisitor(node)
    default:
      return unsupportedVisitor(node)
  }
}

export let nodeVisitor = genericNodeVisitor

export const setNodeVisitor = (
  visitor: (node: AST.Node, rootScope?: boolean) => VisitorReturn,
) => {
  nodeVisitor = visitor
}

export function functionVisitor(
  node: AST.FunctionDeclaration,
  rootScope = true,
): VisitorReturn {
  // const body = node.getBody() as AST.Block | undefined
  // if (!body) return empty
  const name = node.getName()
  if (!name) return []
  const paramNodes = node.getParameters()
  const params = paramNodes.map((param, index) => {
    const name = param.getName() || '_'
    const type = param.getType()
    // console.log(type.getText())

    return declareVariable(name, referenceVar(index + 1))
    // return `local ${name}="$${index+1}"`
  })
  const innerStatements = node.getStatements()
  const transformedStatements = innerStatements
    .map((node) => nodeVisitor(node, false))
    .flat(1)

  const getNameFromScope = getNameGenerator(name)

  const functionStatements = [
    // ...getCommentObjects(node),
    declareFunction({
      name,
      as: rootScope ? name : getNameFromScope(),
      body: [...params, ...transformedStatements],
    }),
    // `${name}() {`,
    // ...transformedDeclaration.statements.map(s => `  ${s}`),
    // '}',
  ]

  return rootScope
    ? functionStatements
    : ast`${extractedToRootScope(
        functionStatements,
      )}${getNameFromScope((name) =>
        comment(`function declaration extracted, see: ${name}`),
      )}`
}

export function expressionVisitor(
  node: AST.Node<AST.ts.ExpressionStatement>,
): VisitorReturn {
  const expression = node.getChildAtIndex(0)!
  // console.log(expression)
  switch (expression.getKind()) {
    case AST.SyntaxKind.CallExpression:
      return [
        ...getCommentObjects(node),
        ...callExpressionVisitor(expression as AST.CallExpression),
      ]
    // const callExpr = expression as AST.CallExpression
    default:
      return unsupportedVisitor(node)
  }
}

export function callExpressionVisitor(node: AST.CallExpression): VisitorReturn {
  const identNode = node.getExpression()
  const argNodes = node.getArguments()
  const callable = identNode.getText()
  // TODO: map args depending on their type, i.e. passthrough StringLiteral
  const args = argNodes.map((arg) => arg.getText())
  const argCommentsList = flatmapSimple(
    argNodes.map((arg) => getCommentObjects(arg)),
  )
  const hasComments = argCommentsList.length > 0
  const argComments = hasComments ? ` # ${argCommentsList.join(', ')}` : ''
  const argsRaw = args.join(' ')
  // TODO: functionCall({})
  return statement`${(ctx) => ctx[callable] || callable}${
    argsRaw.length ? ` ${argsRaw}` : ''
  }${argComments}`
}

export function fileVisitor(node: AST.Node): VisitorReturn {
  switch (node.getKind()) {
    case AST.SyntaxKind.EndOfFileToken:
      return []
    case AST.SyntaxKind.SyntaxList:
    default:
      const list = node as AST.SyntaxList
      return list
        .getChildren()
        .map((node) => nodeVisitor(node, true))
        .flat(1)
  }
}

export function importDeclarationVisitor(
  node: AST.ImportDeclaration,
): VisitorReturn {
  // return unsupportedVisitor(node)
  const importFrom = node.getModuleSpecifierValue()
  const importedMembers = node.getNamedImports()
  return importedMembers
    .map((member) => {
      const name = member.getName()
      return addToScopeAndReplaceUsage(name, `@module "${importFrom}" ${name}`)
    })
    .flat(1)

  // return importedMembers.map((member) => {
  //   const name = member.getName()
  //   return statement`${addToScopeAndReplaceUsage(name, `@module "${importFrom}" ${name}`)}`
  // }).flat(1)
}

export function variableStatementVisitor(
  node: AST.VariableStatement,
): VisitorReturn {
  const list = node.getDeclarationList()
  const declarations = list.getDeclarations()
  return declarations.map((declaration) => {
    const name = declaration.getName()
    const initializer = declaration.getInitializer()
    let value: ASTExpression | undefined = undefined
    if (initializer) {
      switch (initializer.getKind()) {
        case AST.SyntaxKind.StringLiteral:
          value = initializer.getText()
          break
        default:
          value = comment(
            `Unsupported initializer type: ${initializer.getKindName()}`,
          )
          break
      }
    }
    return declareVariable(name, value)
  })
}

// AST
