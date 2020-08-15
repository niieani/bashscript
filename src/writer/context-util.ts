import {ASTExpression, ASTList, ASTObject, TraverseState} from './types'
import {raw} from './syntax/raw'
import {reduceAST} from './reducers'
import {emptyContext} from './context'
import {scopeHelper} from './scope'

export const shouldTreatAsPureText = (
  textOrAST: ASTObject | string,
): textOrAST is string =>
  typeof textOrAST === 'string' || textOrAST.hasOwnProperty('toString')

export const coerceStringToAST = <T extends ASTExpression>(
  textOrAST: T,
): T extends string ? ASTObject<{text: string}> : T =>
  // @ts-ignore not sure what's going on here, but it works:
  shouldTreatAsPureText(textOrAST) ? raw(textOrAST) : textOrAST

export const astGroup = (
  ...children: ASTList
): ASTObject<{children: ASTList}> => ({
  type: 'group',
  data: {children},
  reduce: (context: TraverseState): TraverseState =>
    reduceAST(children, context),
})

export const ensureASTObject = (
  node: ASTExpression,
  context: TraverseState = emptyContext,
): ASTObject =>
  Array.isArray(node)
    ? astGroup(...node.flat(100).map(coerceStringToAST))
    : typeof node === 'function'
    ? ensureASTObject(node(scopeHelper(context)), context)
    : coerceStringToAST(node)
