print`
${bang}
${declareArray('moduleCache', '()')}
${declareFunction({
  name: 'module',
  parameters: ['path', 'export'],
  // body:
})}
`

const ast = [
  bang,
  // accepts either string or array as parameter:
  declareArray('moduleCache', '()'),
  // reference to the variable name:
  ({moduleCache}) => declareFunction({
    name: 'module',
    body: [
      declare('path', escaped('$1')),
      declare('export', escaped('$2')),
      // by now we have these variables in scope
      // we can return either string or a function
      // that gets the current scope
      ({path, export: exportVar}) => ifStatement({
        if: `test ${escapedAccess(path, ':0:2')} == './'`,
        then: [
          declare(
            'filename',
            `${subshell(
              'cd "${BASH_SOURCE[1]%/*}" && pwd'
            )}/${escapedAccess(path, '#\\./')}`
          )
        ],
        else: [
          `${moduleCache}+=(${path})`,
          `eval ${exportVar}`
        ]
      }),
    ]
  }),
]

const concatAst = [
  declareFunction({
    name: 'concat',
    body: ({scopePath}) => [
      comment('# params'),
      declare('a', argument(1)),
      comment('# function body:'),
      ({a}) => declare('c', escaped(`${a}-super`)),
      extractedToRootScope([
        declareFunction({
          name: `${scopePath}_lambda_1`,
          body: [
            // resolve scoped variables:
            'eval "${1}"; shift;',
            // actual body:
            declare('b', argument(1)),
            ({b, c}) => `echo ${escaped(c)}${escaped(b)}`,
          ]
        })
      ]),
      ({c}) => declareArray(
        'declaration',
        [ // array items (auto escaped if space present):
          'function',
          `${scopePath}_lambda_1`,
          `${escaped(`declare -p ${c}`)}`,
        ]
      ),
    ]
  }),
  ({concat}) => declare('withOne', subshell(`${concat} 'one'`)),
  ({withOne}) => declare('result', subshell(`__callVar ${withOne} 'two'`))
]

/**
 * perhaps we could have: command(commandName, [arguments])
 * and it automatically gets the commandName.type === 'variable'
 * then it runs: __callVar commandName
 * else: simply commandName
 */
