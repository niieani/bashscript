import './index.css'
import sourceValue from '!raw-loader!./repl'

declare var window: Window & {_sourceValue?: string}

const init = async () => {
  const sourceChanged =
    window._sourceValue == null || window._sourceValue !== sourceValue
  window._sourceValue = sourceValue

  const [{initLeft}, {initRight}, {transpileText}] = await Promise.all([
    import('./monaco'),
    import('./codemirror'),
    import('./transpile'),
  ])

  const originValue = sourceChanged ? sourceValue : undefined
  const transpiledValue = sourceChanged ? transpileText(sourceValue) : undefined
  const codemirror = initRight(transpiledValue)

  const updateRight = (code: string) => {
    const transpiled = transpileText(code)
    if (transpiled !== undefined) codemirror.setValue(transpiled)
  }

  const monaco = initLeft(originValue, updateRight)
  if (module.hot && !transpiledValue) updateRight(monaco.getModel().getValue())
}

init()

if (module.hot) {
  module.hot.accept()
}
