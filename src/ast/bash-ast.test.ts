import {write} from './bash-ast'

describe('writing AST', function () {
  test('VariableDeclaration with StringLiteral initializer', () => {
    const result = write({
      type: 'File',
      statements: [
        {
          type: 'VariableDeclaration',
          identifier: {
            type: 'VariableIdentifier',
            name: 'welcome',
          },
          initializer: {
            type: 'StringLiteral',
            style: 'SINGLE_QUOTED',
            value: 'hello world',
          },
        },
      ],
    })

    expect(result).toMatchInlineSnapshot(`"declare welcome='hello world'"`)
  })

  test('VariableDeclaration with StringLiteral initializer', () => {
    const result = write({
      type: 'File',
      statements: [
        {
          type: 'FunctionDeclaration',
          name: {
            type: 'FunctionIdentifier',
            name: 'welcome',
          },
          parameters: [
            {
              type: 'Parameter',
              identifier: {
                type: 'VariableIdentifier',
                name: 'first_name',
              },
            },
          ],
          statements: [
            {
              type: 'CallExpression',
              callee: {
                type: 'FunctionIdentifier',
                name: 'echo',
              },
              args: [
                {
                  type: 'TemplateLiteral',
                  quasis: [
                    {
                      type: 'TemplateElement',
                      value: 'Welcome to bashscript, ',
                    },
                    {
                      type: 'TemplateElement',
                      value: '!',
                    },
                  ],
                  expressions: [
                    {
                      type: 'VariableReference',
                      identifier: {
                        type: 'VariableIdentifier',
                        name: 'first_name',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })

    expect(result).toMatchInlineSnapshot(`
      "function welcome {
        local first_name=\\"\${0}\\"
        echo \\"Welcome to bashscript, \${first_name}!\\"
      }"
    `)
  })
})
