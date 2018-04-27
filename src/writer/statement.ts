import {ASTExpression, ASTList, ASTObject, TraverseState} from './types'
import {starter} from './syntax/starter'
import {terminator} from './syntax/terminator'
import {reduceAST} from './writer'
import {combineAlternate} from '../util/array'
import {
  coerceStringToAST,
  ensureASTObject,
  shouldTreatAsPureText,
} from './context'

export const astGroup = (
  ...children: ASTList
): ASTObject<{children: ASTList}> => ({
  type: 'group',
  data: {children},
  reduce: (context: TraverseState): TraverseState =>
    reduceAST(children, context),
})

/**
 * Template string for creating AST from nodes/strings and functions
 */
export const ast = (
  strings: TemplateStringsArray,
  ...parts: Array<ASTExpression | undefined>
): Array<ASTObject> =>
  parts.every((part) => typeof part !== 'function')
    ? combineAlternate(Array.from(strings), parts.flatten(1) as Array<
        string | ASTObject
      >)
        .filter(
          (node) =>
            node !== undefined &&
            (!shouldTreatAsPureText(node) || node.length > 0),
        )
        .map(coerceStringToAST)
    : [
        astGroup(({_context: context}) =>
          ensureASTObject(
            combineAlternate(
              Array.from(strings).map(coerceStringToAST),
              parts
                .filter((part) => typeof part !== 'undefined')
                .map((part) => ensureASTObject(part!, context)),
            ),
            context,
          ),
        ),
      ]

/**
 * a template string literal function for writing complete expressions
 */
export const statement = (
  strings: TemplateStringsArray,
  ...parts: Array<ASTExpression | undefined>
): Array<ASTObject> => {
  const applied = ast(strings, ...parts)
  const [first, ...rest] = applied
  const [last] = rest.reverse()
  return [
    ...(first && first.type !== 'starter' ? [starter] : []),
    ...applied,
    ...(last && last.type !== 'terminator' ? [terminator] : []),
  ]
}
