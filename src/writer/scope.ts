import {ASTExpression, ASTObject, DefinedReducer, ScopeContext, TraverseState} from './types'
import {ensureArray} from '../util/array'
import {defineReducer, reduceAST} from './reducers'
import {newLine} from './syntax/starter'
import {createScopeProxy} from './scope-proxy'
import {print} from './writer'

export const asObject = <T>(reduce: DefinedReducer<T>): ASTObject<T> => ({
  type: 'enhance',
  data: reduce.data,
  reduce,
})

/**
 * adds a variable to scope and prints its name
 */
export const addToScopeAndWrite = (name: string, as?: ASTExpression) =>
  asObject(
    defineReducer({
      data: {name},
      reducer: (context: TraverseState): TraverseState => {
        const {scope, parts, parent} = context
        let safeName = name
        if (as) {
          const {parts: asName} = reduceAST(ensureArray(as), {
            ...context,
            parts: [],
          })
          safeName = asName.join('') || name
        }
        let append = 0
        while (safeName in scope) {
          append++
          // we need to rename this variable
          safeName = `${name}_${append}`
        }
        return {
          ...context,
          parent,
          parts: [...parts, safeName],
          scope: createScopeProxy({
            ...scope,
            [name]: {
              ...parent,
              toString: () => safeName,
              length: safeName.length,
            },
          }),
        }
      },
    }),
  )

export const addToScopeAndReplaceUsage = (name: string, usage: ASTExpression) =>
  asObject(
    defineReducer({
      data: {name, usage},
      reducer: (context: TraverseState): TraverseState => {
        const {scope, parent} = context
        const usageText = print(usage, {...context, parts: []})
        return {
          ...context,
          scope: createScopeProxy({
            ...scope,
            [name]: {
              ...parent,
              toString: () => usageText,
              length: usageText.length,
            },
          }),
        }
      },
    })
  )

/**
 * in scopes { ... } and sub-shells ( ... ) we "fork" context
 * i.e. ignore its result down the line
 */
export const inIsolatedScope = (
  body: ASTExpression,
  scopeDescription: string,
) =>
  asObject(
    defineReducer({
      reducer: (context) => {
        const {
          indent,
          processed,
          scope,
          scopePath,
          parent,
          partsToExtract,
          parts,
        } = context
        const innerContext = reduceAST(ensureArray(body), {
          ...context,
          indent: indent + 2,
          scopePath: [...scopePath, scopeDescription],
          processed: [],
          parts: [],
          partsToExtract: [],
        })
        return {
          ...context,
          partsToExtract: [...partsToExtract, ...innerContext.partsToExtract],
          parts: [...parts, ...innerContext.parts],
          processed: [...processed, parent, ...innerContext.processed],
        }
      },
      data: {scopeDescription, body},
    }),
  )

export const extractedToRootScope = (body: ASTExpression) =>
  asObject(
    defineReducer({
      reducer: (context) => {
        const {
          indent,
          processed,
          scope,
          scopePath,
          parent,
          partsToExtract,
          parts,
        } = context
        const extractedContext = reduceAST(ensureArray(body), {
          ...context,
          indent: 0,
          parts: [],
          partsToExtract: [],
        })
        return {
          ...context,
          partsToExtract: [
            ...partsToExtract,
            // we move normal parts to extracted ones:
            ...extractedContext.parts,
            ...extractedContext.partsToExtract,
            newLine,
          ],
          parts,
          processed: extractedContext.processed,
        }
      },
      data: {body},
    }),
  )

export const scopeHelper = (context: TraverseState) =>
  ({
    ...context.scope,
    _context: context,
  } as ScopeContext)


