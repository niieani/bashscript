import {
  ASTExpression,
  ASTObject,
  DeclarationData,
  FunctionAST,
  VariableData,
} from '../types'
import {defaultReduce} from '../writer'
import {starter} from './starter'
import {ast, statement} from '../statement'
import {addToScope, inIsolatedScope} from '../scope'

export const raw = (text: string): ASTObject<{text: string}> => ({
  reduce: function reduce({processed, parts, ...context}) {
    return {
      ...context,
      processed: [...processed, this],
      parts: [...parts, text],
    }
  },
  parts: [text],
  data: {text},
  type: 'raw',
})

export const declare = (
  variable: ASTExpression,
  initializer?: ASTExpression,
): ASTObject<DeclarationData> => ({
  parts: initializer
    ? statement`declare ${variable}=${initializer}`
    : statement`declare ${variable}`,
  type: 'declaration',
  data: {variable, initializer},
  reduce: defaultReduce,
})

export const declareVariable = (
  name: string,
  initializer?: ASTExpression,
): ASTObject<DeclarationData> => declare(addToScope(name), initializer)

export const referenceVar = (
  name: string | number,
): ASTObject<VariableData> => ({
  type: 'variable',
  parts: [ast`\${${name.toString()}}`],
  data: {name},
  reduce: defaultReduce,
})

export const declareFunction = ({
  name,
  body,
  as,
}: FunctionAST): ASTObject<FunctionAST> => ({
  type: 'function',
  data: {name, body, as},
  reduce: defaultReduce,
  parts: statement`function ${addToScope(name, as)} {
${inIsolatedScope(body, name)}${starter}}`,
})
