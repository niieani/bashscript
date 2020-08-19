// import sh from 'mvdan-sh'
const sh = require('mvdan-sh')

const {syntax} = sh
const parser = syntax.NewParser()
const result = parser.Parse(`
concat 'hi' 'ho' "\${variable}" "\$(sub 1 2 3)"
`)

syntax.DebugPrint(result)
console.log(JSON.stringify(result))

const makeVariableDeclaration = () => ({})
