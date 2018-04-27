import {ASTExpression, ASTObject, NoData, TraverseState} from './types'
import {createScopeProxy, scopeHelper} from './scope'
import {raw} from './syntax/parts'
import {astGroup} from './statement'

export const shouldTreatAsPureText = (
  textOrAST: ASTObject | string,
): textOrAST is string =>
  typeof textOrAST === 'string' || textOrAST.hasOwnProperty('toString')

export const coerceStringToAST = <T>(textOrAST: ASTObject<T> | string) =>
  shouldTreatAsPureText(textOrAST) ? raw(textOrAST) : textOrAST

export const ensureASTObject = (
  node: ASTExpression,
  context: TraverseState = emptyContext,
): ASTObject =>
  Array.isArray(node)
    ? astGroup(...node.flatten(100).map(coerceStringToAST))
    : typeof node === 'function'
      ? ensureASTObject(node(scopeHelper(context)), context)
      : coerceStringToAST(node)

export const astRoot: ASTObject<NoData> = {
  type: 'root',
  data: {},
  reduce: (ctx) => ctx,
}

export const emptyContext: TraverseState = {
  parts: [],
  partsToExtract: [],
  processed: [],
  scopePath: [],
  scope: createScopeProxy(),
  parent: astRoot,
  indent: 0,
}
