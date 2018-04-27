import './util/flatmap'
import Ast, * as AST from 'ts-simple-ast'
import * as ts from 'typescript'
import * as path from 'path'
import * as acorn from 'acorn'
import {
  declareVariable,
  ast,
  referenceVar,
  statement,
  ASTObject,
  comment,
  declareFunction,
  print,
  extractedToRootScope,
  astGroup,
  TraverseScope,
  ScopeContext,
} from './writer/writer'

const tsAST = new Ast()
const sourceDir = path.resolve(__dirname, '..', 'bashscript')
tsAST.addExistingSourceFiles(`${sourceDir}/example/**/*.ts`)

interface PrinterState {
  statements: Array<string>
}
type Printer = (state: PrinterState) => string

type VisitorReturn = Array<ASTObject>
// interface VisitorReturn {
//   statementsRoot: Array<string | Printer>
//   statements: Array<string | Printer>
// }
// type VisitorLazyReturn = (addToRoot: (statement: string) => void) => string
// type VisitorReturn = Array<string | VisitorLazyReturn>

const empty = {statementsRoot: [], statements: []}

function unsupportedVisitor(node: AST.Node): VisitorReturn {
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

function nodeVisitor(node: AST.Node, rootScope = true): VisitorReturn {
  switch (node.getKind()) {
    case ts.SyntaxKind.ExpressionStatement:
      return expressionVisitor(node as AST.Node<AST.ts.ExpressionStatement>)
    case ts.SyntaxKind.FunctionDeclaration:
      return functionVisitor(node as AST.FunctionDeclaration, rootScope)
    default:
      return unsupportedVisitor(node)
  }
}

const getReduceVisitorReturns = (startWith: VisitorReturn = []) => (
  list: VisitorReturn,
) => list.concat(startWith)

const reduceVisitorReturns = getReduceVisitorReturns()
const getCommentObjects = (node: AST.Node) =>
  getComments(node).map((text) => comment(text, false))

const getComments = ({compilerNode}: AST.Node) => {
  const commentPart = compilerNode
    .getFullText()
    .slice(0, compilerNode.getLeadingTriviaWidth())
  const comments: Array<acorn.Comment> = []
  acorn.parse(commentPart, {
    ranges: false,
    onComment: comments,
    allowHashBang: true,
  })
  return comments.map((comment) => `${comment.value.split('\n').join('\n#')}`)
}

const passthrough = <T>(t: T) => t

const getNameGenerator = (name: string) => <T>(
  wrapper: (t: string) => T = passthrough as (t: string) => T,
) => ({_context: {scopePath}}: ScopeContext) =>
  wrapper(`${scopePath.join('.')}.${name}`)

function functionVisitor(
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

const flatMap = <T>(nestedArray: Array<Array<T>>): Array<T> =>
  ([] as Array<T>).concat(...nestedArray)

// node.getChildrenOfKind(ts.SyntaxKind.CallExpression).
function expressionVisitor(
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

function callExpressionVisitor(node: AST.CallExpression): VisitorReturn {
  const identNode = node.getExpression()
  const argNodes = node.getArguments()
  const callable = identNode.getText()
  // TODO: map args depending on their type, i.e. passthrough StringLiteral
  const args = argNodes.map((arg) => arg.getText())
  const argCommentsList = flatMap(argNodes.map((arg) => getCommentObjects(arg)))
  const hasComments = argCommentsList.length > 0
  const argComments = hasComments ? `# ${argCommentsList.join(', ')}` : ''
  return statement`${callable} ${args.join(' ')}${argComments}`
}

function fileVisitor(node: AST.Node): VisitorReturn {
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

function transpile(file: string) {
  const example = tsAST.getSourceFile(file)

  if (!example) {
    return ''
  }

  // ordered statements in the file
  // function call is a statement, function definition is a statement, etc.
  const children = example.getChildren()
  const statements = children.map(fileVisitor).flatten(1)
  return print(statements)

  // const statements = example.getStatements()
  // return statements.map(nodeVisitor).map(
  //   visited => visited.statements.join(`\n`)
  //   // return statement.compilerNode.getChildren().map(nodeVisitor)
  // ).join(`\n`)

  // const syntaxList = example.getChildSyntaxList()

  // const childCallExpressions = example.getChildrenOfKind(ts.SyntaxKind.CallExpression);

  // // .getStatements()
  // console.log(
  //   childCallExpressions.map(s => s.getFullText())
  //   // statements.map(s => s.kind)
  // )
  // console.log(
  //   statements.map(s => s.getFullText())
  //   // statements.map(s => s.kind)
  // )
}

console.log(transpile('example.ts'))
