/**
 * it would be nice to have a unified api for accessing children and descendents
 * instead of writing directly, it would be nice to have an: .unfold API
 * which simply returns a writer after unfolding
 * instead of having separate writing types, like 'root'/'here'
 * maybe it could be better to wrap a part of output into RootScope
 * then you'd have:
 * return [
 *  rootToken`function ${identifier('hello') {}},
 *  ...lineTokens`declare ${identifier('var')}=${escape`${content}`} ${comment`awesome`}`,
 *  ...lineTokens`function ${identifier('boom')} {`,
 *  ...lineTokens`${Indent(2)`${body}`}`,
 *  ...lineTokens`}`,
 * ]`
 */
interface Node {
  print(): string | {root: string; node: string}
}
interface Statement extends Node {}
interface RootNode {
  concat(node: Statement): RootNode
  print(): string
}
const RootNode = (...statements: Array<Statement>): RootNode => {
  const uniqueNames = new Set<string>()

  const print = () => {
    let output = ''
    statements.reduce((api: RootNode, statement) => {
      return api.concat(statement)
      // statement.print()
    }, api)
    // .join('\n')
    return output
  }

  const concat = (...moreStatements: Array<Statement>) =>
    RootNode(...statements, ...moreStatements)

  const api: RootNode = {
    print,
    concat,
  }

  return api
}
