import {map, pipe} from 'ramda'

export class Program {
  statements = []
}

// export class FunctionStatement {
//   bodyStatements = []
// }

/** declare x=y */
// export class VariableDeclaration {
//   readonly : boolean
// }
interface Output {
  root: string
  here: string
}
interface Node {
  write(): Output
}
interface CommandNode extends Node {}
interface StringLiteral extends Node {}
interface NumberLiteral extends Node {}

enum VariableDeclarationFlags {
  integer = 'i',
  array = 'a',
  dictionary = 'A',
  string = '',
}

function VariableDeclaration({
  name,
  readonly = false,
  initializer = undefined,
  type = 'string',
}: {
  name: string
  readonly?: boolean
  initializer?: CommandNode | StringLiteral | NumberLiteral | string | undefined
  type?: 'string' | 'integer' | 'array' | 'dictionary'
}) {
  const anyFlags = readonly || type !== 'string'
  const write = writer`declare ${anyFlags && '-'}${readonly && 'r'}${
    VariableDeclarationFlags[type]
  } ${name}${initializer && `=`}${initializer}`
}

const empty: Output = {here: '', root: ''}
const reduceOutput = (list: Array<Output>) =>
  list.reduce(
    ({here: mergedHere, root: mergedRoot}, {here, root}) => ({
      here: `${mergedHere}${here}`,
      root: `${mergedRoot}${root}`,
    }),
    empty,
  )

const reduceRootOutput = (list: Array<Output>) =>
  list.reduce((reducedRoot, {root}) => `${reducedRoot}${root}`, '')

const writeNode = (node: Node | string | undefined | false) =>
  typeof node === 'object' ? node.write() : {here: node || '', root: ''}

const writeNodes = pipe(map(writeNode), reduceOutput)

const Identifier = (name: string) => {
  const decorate = (decorator: (name: string) => string) => decorator(name)
}

const FunctionStatement = ({}) => {}

const writer = (
  strings: TemplateStringsArray,
  ...nodes: Array<Node | string | undefined | false>
) => {
  const writtenNodes = nodes.map(writeNode)
  const root = reduceRootOutput(writtenNodes)
  const here = strings
    .map((part, index) => {
      ;`${part}${writtenNodes[index].here}`
    })
    .join('')
  return {root, here}
}
