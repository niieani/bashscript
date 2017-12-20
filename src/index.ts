import Ast, * as AST from 'ts-simple-ast'
import * as ts from 'typescript'
import * as path from 'path'
import * as acorn from 'acorn'
import {declareVariable, ast, referenceVar} from './writer/writer'

const tsAST = new Ast()
const sourceDir = path.resolve(__dirname, '..', 'bashscript')
tsAST.addExistingSourceFiles(`${sourceDir}/example/**/*.ts`)

interface PrinterState {
  statements: Array<string>
}
type Printer = (state: PrinterState) => string

interface VisitorReturn {
  statementsRoot: Array<string | Printer>
  statements: Array<string | Printer>
}
// type VisitorLazyReturn = (addToRoot: (statement: string) => void) => string
// type VisitorReturn = Array<string | VisitorLazyReturn>

const empty = {statementsRoot: [], statements: []}

function unsupportedVisitor(node: AST.Node): VisitorReturn {
  return {
    statementsRoot: [],
    statements: [
      ...getComments(node),
      ...node.getText()
        .split('\n')
        .map(line => `# <unsupported> ${line.padEnd(40, ' ')} # ${node.getKindName()}`),
    ],
  }
}

function nodeVisitor(node: AST.Node): VisitorReturn {
  switch (node.getKind()) {
    case ts.SyntaxKind.ExpressionStatement:
      return expressionVisitor(node as AST.Node<ts.ExpressionStatement>)
    case ts.SyntaxKind.FunctionDeclaration:
      return functionVisitor(node as AST.FunctionDeclaration)
    default:
      return unsupportedVisitor(node)
  }
}

const getReduceVisitorReturns = (
  startWith: VisitorReturn = {statementsRoot: [], statements: []}
) => (
  list: Array<VisitorReturn>
) => list.reduce((merged, {statementsRoot, statements}) => ({
  statementsRoot: [...merged.statementsRoot, ...statementsRoot],
  statements: [...merged.statements, ...statements],
}), startWith)

const reduceVisitorReturns = getReduceVisitorReturns()
const getComments = ({compilerNode}: AST.Node) => {
  const commentPart = compilerNode.getFullText().slice(0, compilerNode.getLeadingTriviaWidth())
  const comments : Array<acorn.Comment> = []
  acorn.parse(commentPart, {ranges: false, onComment: comments, allowHashBang: true})
  return comments.map(comment => `#${comment.value.split('\n').join('\n#')}`)
}

function functionVisitor(node: AST.FunctionDeclaration): VisitorReturn {
  // const body = node.getBody() as AST.Block | undefined
  // if (!body) return empty
  const name = node.getName()
  const paramNodes = node.getParameters()
  const params = paramNodes.map((param, index) => {
    const name = param.getName() || '_'
    const type = param.getType()
    // console.log(type.getText())

    // return declareVariable(name, referenceVar(1))
    return `local ${name}="$${index+1}"`
  })
  const innerStatements = node.getStatements()
  const transformedDeclarations = innerStatements
    .map(nodeVisitor)
  const transformedDeclaration = getReduceVisitorReturns({statementsRoot: [], statements: params})(transformedDeclarations)
  return {
    ...transformedDeclaration,
    statements: [
      ...getComments(node),
      `${name}() {`,
      ...transformedDeclaration.statements.map(s => `  ${s}`),
      '}',
    ]
  }
}

const flatMap = <T>(nestedArray: Array<Array<T>>) : Array<T> =>
  ([] as Array<T>).concat(...nestedArray)

// node.getChildrenOfKind(ts.SyntaxKind.CallExpression).
function expressionVisitor(node: AST.Node<ts.ExpressionStatement>): VisitorReturn {
  const expression = node.getChildAtIndex(0)!
  // console.log(expression)
  switch (expression.getKind()) {
    case ts.SyntaxKind.CallExpression:
      const callExpr = expression as AST.CallExpression
      const identNode = callExpr.getExpression()
      const argNodes = callExpr.getArguments()
      const callable = identNode.getText()
      // TODO: map args depending on their type, i.e. passthrough StringLiteral
      const args = argNodes.map(arg => arg.getText())
      const argCommentsList = flatMap(argNodes.map(arg => getComments(arg)))
      const hasComments = argCommentsList.length > 0
      const argComments = hasComments ? `# ${argCommentsList.join(', ')}` : ''
      return {statementsRoot: [], statements: [
        ...getComments(node),
        `${callable} ${args.join(' ')}${argComments}`
      ]}
    default:
      return unsupportedVisitor(node)
  }
}

function fileVisitor(node: AST.Node): VisitorReturn {
  switch (node.getKind()) {
    case ts.SyntaxKind.EndOfFileToken:
      return {statementsRoot: [], statements: []}
    case ts.SyntaxKind.SyntaxList:
    default:
      const list = node as AST.SyntaxList
      debugger
      return reduceVisitorReturns(
        list.getChildren().map(nodeVisitor)
      )
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
  const {statements, statementsRoot} = reduceVisitorReturns(
    children.map(fileVisitor)
  )
  const transpiled = [...statementsRoot, ...statements]
    .reduce(
      (statements, statement) =>
      [...statements, typeof statement === 'string' ? statement : statement({statements})],
    [] as Array<string>
  )
  return transpiled.join('\n')

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
