export type IdentifierLookup =
  | ImportedFunctionIdentifierLookup
  | FunctionIdentifierLookup
  | VariableIdentifierLookup

export type ImportedFunctionIdentifierLookup = {
  name: string
  bashName: string
  lookupKind: 'IMPORTED_FUNCTION'
  importedFrom: string
  scopeName: string
}

export type FunctionIdentifierLookup = {
  name: string
  bashName: string
  lookupKind: 'FUNCTION'
  scopeName: string
}

export type VariableIdentifierLookup = {
  name: string
  bashName: string
  lookupKind: 'VARIABLE'
  scopeName: string
}

export class Scope {
  parentScope: Scope
  /**
   * a bash-sanitized name for the scope
   */
  name: string
  byTSName = new Map<string, IdentifierLookup>()
  byBashName = new Map<string, IdentifierLookup>()
  type: 'FUNCTION' | 'FILE'

  get path(): string[] {
    return this.isRoot ? [this.name] : [...this.parentScope.path, this.name]
  }

  get fullName(): string {
    return this.path.join('.')
  }

  anonymousId = 0

  getNextAnonymousId() {
    return `anonymous.${++this.anonymousId}`
  }

  constructor({
    parentScope,
    name,
    type,
  }: {
    parentScope?: Scope
    name: string
    type: 'FUNCTION' | 'FILE'
  }) {
    this.parentScope = parentScope ?? this
    this.name = name
    this.type = type
  }

  get isRoot() {
    return this.parentScope === this
  }

  get(
    key: string,
    {
      skipRoot = false,
      keyType = 'byTSName',
    }: {skipRoot?: boolean; keyType?: 'byBashName' | 'byTSName'} = {},
  ): IdentifierLookup | undefined {
    return skipRoot && this.isRoot
      ? undefined
      : this[keyType].get(key) ??
          (this.isRoot
            ? undefined
            : this.parentScope.get(key, {skipRoot, keyType}))
  }

  has(
    key: string,
    {
      skipRoot = false,
      keyType = 'byTSName',
    }: {skipRoot?: boolean; keyType?: 'byBashName' | 'byTSName'} = {},
  ): boolean {
    return skipRoot && this.isRoot
      ? false
      : this[keyType].has(key) ??
          (this.isRoot
            ? undefined
            : this.parentScope.has(key, {skipRoot, keyType}))
  }

  populate(list: readonly IdentifierLookup[]) {
    const warnings: any[] = []
    list.forEach((item) => {
      const previousItem = this.get(item.name)
      if (previousItem) {
        warnings.push({
          type: 'IdentifierShadowing',
          message: `The identifier ${item.name} (${item.lookupKind}) is shadowing another element (${previousItem.lookupKind})`,
        })
      }

      const value =
        this.type === 'FUNCTION' && item.lookupKind === 'FUNCTION'
          ? {
              ...item,
              bashName: `${this.name}.${item.bashName}`,
            }
          : item

      this.byTSName.set(value.name, value)

      this.byBashName.set(value.bashName, value)
    })
    return {warnings}
  }
}
