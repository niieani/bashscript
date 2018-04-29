import {ASTExpression, ASTObject, DeclarationData, FunctionAST, VariableData, TraverseScope, TraverseState} from '../types'
import {defaultReduce} from '../reducers'
import {starter} from './starter'
import {ast, statement} from '../statement'
import {addToScopeAndWrite, inIsolatedScope} from '../scope'

export const declare = (
  variable: ASTExpression,
  initializer?: ASTExpression,
): ASTObject<DeclarationData> => ({
  parts: initializer !== undefined
    ? statement`declare ${variable}=${initializer}`
    : statement`declare ${variable}`,
  type: 'declaration',
  data: {variable, initializer},
  reduce: defaultReduce,
})

export const declareVariable = (
  name: string,
  initializer?: ASTExpression,
): ASTObject<DeclarationData> => declare(addToScopeAndWrite(name), initializer)

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
  parts: statement`function ${addToScopeAndWrite(name, as)} {
${inIsolatedScope(body, name)}${starter}}`,
})

/* WIP:
const functionCall = ({
  name,
  args,
  comments,
}) => ({
  type: 'call',
  data: {name, args, comments},
  reduce: defaultReduce,
  parts: statement`${(ctx) => ctx[name] || name} ${args}${comments && ` # ${comments}`}`
})
*/