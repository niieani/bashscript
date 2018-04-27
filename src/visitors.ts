import * as AST from 'ts-simple-ast'
import {extractedToRootScope} from './writer/scope'
import {getNameGenerator} from './util/visitor'
import * as ts from 'typescript'
import {flatmapSimple} from './util/flatmap-simple'
import {getCommentObjects} from './util/ast'
import {ASTObject} from './writer/types'
import {
  declareFunction,
  declareVariable,
  referenceVar,
} from './writer/syntax/parts'
import {comment} from './writer/syntax/comment'
import {ast, statement} from './writer/statement'

export type VisitorReturn = Array<ASTObject>

export function unsupportedVisitor(node: AST.Node): VisitorReturn {
  return [
    ...getCommentObjects(node),
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

export function nodeVisitor(node: AST.Node, rootScope = true): VisitorReturn {
  switch (node.getKind()) {
    case ts.SyntaxKind.ExpressionStatement:
      return expressionVisitor(node as AST.Node<AST.ts.ExpressionStatement>)
    case ts.SyntaxKind.FunctionDeclaration:
      return functionVisitor(node as AST.FunctionDeclaration, rootScope)
    default:
      return unsupportedVisitor(node)
  }
}

export function functionVisitor(
  node: AST.FunctionDeclaration,
  rootScope = true,
): VisitorReturn {
  // const body = node.getBody() as AST.Block | undefined
  // if (!body) return empty
  const name = node.getName()
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
    .flatten(1)

  const getNameFromScope = getNameGenerator(name)

  const functionStatements = [
    ...getCommentObjects(node),
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
    : ast`${extractedToRootScope(functionStatements)}${getNameFromScope(
        (name) => comment(`function declaration extracted, see: ${name}`),
      )}`
}

export function expressionVisitor(
  node: AST.Node<AST.ts.ExpressionStatement>,
): VisitorReturn {
  const expression = node.getChildAtIndex(0)!
  // console.log(expression)
  switch (expression.getKind()) {
    case ts.SyntaxKind.CallExpression:
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
  const argComments = hasComments ? `# ${argCommentsList.join(', ')}` : ''
  return statement`${callable} ${args.join(' ')}${argComments}`
}

export function fileVisitor(node: AST.Node): VisitorReturn {
  switch (node.getKind()) {
    case ts.SyntaxKind.EndOfFileToken:
      return []
    case ts.SyntaxKind.SyntaxList:
    default:
      const list = node as AST.SyntaxList
      return list
        .getChildren()
        .map((node) => nodeVisitor(node, true))
        .flatten(1)
  }
}
