declare namespace Writer {
  interface Element<P> {
    type: string | SFC<P>;
    props: P;
  }

  type SFC<P = {}> = StatelessComponent<P>;

  interface StatelessComponent<P = {}> {
    (props: P & { children?: Node }, context?: any): Element<any> | null;
  }

  type ReactText = string | number;
  type Child = Element<any> | ReactText;

  // Should be Array<ReactNode> but type aliases cannot be recursive
  type Fragment = {} | Array<Child | any[] | boolean>;
  type Node = Child | Fragment | string | number | boolean | null | undefined; // | Portal

  // what every component should return
  // tslint:disable-next-line:no-empty-interface
  interface Component<P = {}, S = {}> {
    render(): Writer.Node;
    // hello: string
  }

  class Component<P, S> {
    constructor(props: P, context?: any);

    // Disabling unified-signatures to have separate overloads. It's easier to understand this way.
    // tslint:disable-next-line:unified-signatures

    // setState<K extends keyof S>(f: (prevState: Readonly<S>, props: P) => Pick<S, K>, callback?: () => any): void;
    // // tslint:disable-next-line:unified-signatures
    // setState<K extends keyof S>(state: Pick<S, K>, callback?: () => any): void;

    // forceUpdate(callBack?: () => any): void;
    render(): Node;

    // React.Props<T> is now deprecated, which means that the `children`
    // property is not available on `P` by default, even though you can
    // always pass children as variadic arguments to `createElement`.
    // In the future, if we can define its call signature conditionally
    // on the existence of `children` in `P`, then we should remove this.
    props: Readonly<{ children?: Node }> & Readonly<P>;
    state: Readonly<S>;
    context: any;
  }
}

declare namespace JSX {
  interface Element extends Writer.Element<any> { }
  // tslint:disable-next-line:no-empty-interface
  interface ElementClass extends Writer.Component<any> { }
  interface ElementAttributesProperty { props: {}; }
  interface ElementChildrenAttribute { children: {}; }

  // tslint:disable-next-line:no-empty-interface
  interface IntrinsicAttributes { }
  // tslint:disable-next-line:no-empty-interface
  interface IntrinsicClassAttributes<T> { }

  /*
  interface IntrinsicElements {
    // e.g.:
    // a: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>;
  }
  */
}
