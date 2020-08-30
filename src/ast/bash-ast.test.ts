import {getChildrenRecursively, write, getChildren, BashFile} from './bash-ast'

const fixture1: BashFile = {
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
}

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
    const result = write(fixture1)

    expect(result).toMatchInlineSnapshot(`
      "function welcome {
        local first_name=\\"\${0}\\"
        echo \\"Welcome to bashscript, \${first_name}!\\"
      }"
    `)
  })
})

describe('getChildren', function () {
  test('single', () => {
    const result = getChildren(fixture1)

    expect(result).toMatchInlineSnapshot(`
      Array [
        Object {
          "name": Object {
            "name": "welcome",
            "type": "FunctionIdentifier",
          },
          "parameters": Array [
            Object {
              "identifier": Object {
                "name": "first_name",
                "type": "VariableIdentifier",
              },
              "type": "Parameter",
            },
          ],
          "statements": Array [
            Object {
              "args": Array [
                Object {
                  "expressions": Array [
                    Object {
                      "identifier": Object {
                        "name": "first_name",
                        "type": "VariableIdentifier",
                      },
                      "type": "VariableReference",
                    },
                  ],
                  "quasis": Array [
                    Object {
                      "type": "TemplateElement",
                      "value": "Welcome to bashscript, ",
                    },
                    Object {
                      "type": "TemplateElement",
                      "value": "!",
                    },
                  ],
                  "type": "TemplateLiteral",
                },
              ],
              "callee": Object {
                "name": "echo",
                "type": "FunctionIdentifier",
              },
              "type": "CallExpression",
            },
          ],
          "type": "FunctionDeclaration",
        },
      ]
    `)
  })

  test('recursive', () => {
    const result = getChildrenRecursively(fixture1)

    expect(result).toMatchInlineSnapshot(`
      Array [
        Object {
          "name": Object {
            "name": "welcome",
            "type": "FunctionIdentifier",
          },
          "parameters": Array [
            Object {
              "identifier": Object {
                "name": "first_name",
                "type": "VariableIdentifier",
              },
              "type": "Parameter",
            },
          ],
          "statements": Array [
            Object {
              "args": Array [
                Object {
                  "expressions": Array [
                    Object {
                      "identifier": Object {
                        "name": "first_name",
                        "type": "VariableIdentifier",
                      },
                      "type": "VariableReference",
                    },
                  ],
                  "quasis": Array [
                    Object {
                      "type": "TemplateElement",
                      "value": "Welcome to bashscript, ",
                    },
                    Object {
                      "type": "TemplateElement",
                      "value": "!",
                    },
                  ],
                  "type": "TemplateLiteral",
                },
              ],
              "callee": Object {
                "name": "echo",
                "type": "FunctionIdentifier",
              },
              "type": "CallExpression",
            },
          ],
          "type": "FunctionDeclaration",
        },
        Object {
          "name": "welcome",
          "type": "FunctionIdentifier",
        },
        Object {
          "identifier": Object {
            "name": "first_name",
            "type": "VariableIdentifier",
          },
          "type": "Parameter",
        },
        Object {
          "name": "first_name",
          "type": "VariableIdentifier",
        },
        Object {
          "args": Array [
            Object {
              "expressions": Array [
                Object {
                  "identifier": Object {
                    "name": "first_name",
                    "type": "VariableIdentifier",
                  },
                  "type": "VariableReference",
                },
              ],
              "quasis": Array [
                Object {
                  "type": "TemplateElement",
                  "value": "Welcome to bashscript, ",
                },
                Object {
                  "type": "TemplateElement",
                  "value": "!",
                },
              ],
              "type": "TemplateLiteral",
            },
          ],
          "callee": Object {
            "name": "echo",
            "type": "FunctionIdentifier",
          },
          "type": "CallExpression",
        },
        Object {
          "name": "echo",
          "type": "FunctionIdentifier",
        },
        Object {
          "expressions": Array [
            Object {
              "identifier": Object {
                "name": "first_name",
                "type": "VariableIdentifier",
              },
              "type": "VariableReference",
            },
          ],
          "quasis": Array [
            Object {
              "type": "TemplateElement",
              "value": "Welcome to bashscript, ",
            },
            Object {
              "type": "TemplateElement",
              "value": "!",
            },
          ],
          "type": "TemplateLiteral",
        },
        Object {
          "type": "TemplateElement",
          "value": "Welcome to bashscript, ",
        },
        Object {
          "type": "TemplateElement",
          "value": "!",
        },
        Object {
          "identifier": Object {
            "name": "first_name",
            "type": "VariableIdentifier",
          },
          "type": "VariableReference",
        },
        Object {
          "name": "first_name",
          "type": "VariableIdentifier",
        },
      ]
    `)
  })
})
