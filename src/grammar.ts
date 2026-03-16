type UnionToIntersection<U> = (U extends unknown ? (arg: U) => 0 : never) extends (arg: infer I) => 0 ? I : never;

type LastInUnion<U> =
    UnionToIntersection<U extends unknown ? (x: U) => 0 : never> extends (x: infer L) => 0 ? L : never;

export type UnionToTuple<U, Last = LastInUnion<U>> = [U] extends [never]
    ? []
    : [...UnionToTuple<Exclude<U, Last>>, Last];

type Or<T, U> = T extends false ? U : T;

type TypeToValue<
    TypeKey extends string,
    Types extends number,
    Values extends { [key in TypeKey]: number },
    Selected extends Types[],
> = Selected extends [infer First, ...infer Remaining]
    ? [
          Values extends { [key in TypeKey]: First } ? Values : never,
          ...TypeToValue<TypeKey, Types, Values, Remaining extends Types[] ? Remaining : never>,
      ]
    : [];

export type GrammarItem<
    TypeKey extends string,
    Tokens extends { [key in TypeKey]: number },
    Nodes extends { [key in TypeKey]: number },
    TokenTypes extends Tokens[TypeKey],
    NodeTypes extends Nodes[TypeKey],
    TargetType extends NodeTypes,
    SourceTypes extends (TokenTypes | NodeTypes)[],
> = {
    target: TargetType;
    source: SourceTypes;
    factory: (...children: (Tokens | Nodes)[]) => Nodes;
};

type UnionOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

type GrammarItemSourceBuilder<
    Grammar extends GrammarItem<TypeKey, Tokens, Nodes, TokenTypes, NodeTypes, NodeTypes, (TokenTypes | NodeTypes)[]>[],
    TypeKey extends string,
    Tokens extends { [key in TypeKey]: number },
    Nodes extends { [key in TypeKey]: number },
    TokenTypes extends Tokens[TypeKey],
    NodeTypes extends Nodes[TypeKey],
    TargetType extends NodeTypes,
    SourceTypes extends (NodeTypes | TokenTypes)[],
> = {
    <NextType extends NodeTypes | TokenTypes>(
        next: NextType,
    ): GrammarItemSourceBuilder<
        Grammar,
        TypeKey,
        Tokens,
        Nodes,
        TokenTypes,
        NodeTypes,
        TargetType,
        [...SourceTypes, NextType]
    >;
    factory(
        // 该factory返回的节点不需要带有typeKey，builder在build过程中会自动为其加入typeKey
        factory: (
            ...children: TypeToValue<TypeKey, TokenTypes | NodeTypes, Tokens | Nodes, SourceTypes>
        ) => UnionOmit<Extract<Nodes, { [key in TypeKey]: TargetType }>, TypeKey>,
    ): GrammarBuilder<
        [...Grammar, GrammarItem<TypeKey, Tokens, Nodes, TokenTypes, NodeTypes, TargetType, SourceTypes>],
        TypeKey,
        Tokens,
        Nodes,
        TokenTypes,
        NodeTypes
    >;
};

type GrammarItemTargetBuilder<
    Grammar extends GrammarItem<TypeKey, Tokens, Nodes, TokenTypes, NodeTypes, NodeTypes, (TokenTypes | NodeTypes)[]>[],
    TypeKey extends string,
    Tokens extends { [key in TypeKey]: number },
    Nodes extends { [key in TypeKey]: number },
    TokenTypes extends Tokens[TypeKey],
    NodeTypes extends Nodes[TypeKey],
    TargetType extends NodeTypes,
> = {
    source: <SourceType extends NodeTypes | TokenTypes>(
        type: SourceType,
    ) => GrammarItemSourceBuilder<Grammar, TypeKey, Tokens, Nodes, TokenTypes, NodeTypes, TargetType, [SourceType]>;
};

type GrammarItemBuilder<
    Grammar extends GrammarItem<TypeKey, Tokens, Nodes, TokenTypes, NodeTypes, NodeTypes, (TokenTypes | NodeTypes)[]>[],
    TypeKey extends string,
    Tokens extends { [key in TypeKey]: number },
    Nodes extends { [key in TypeKey]: number },
    TokenTypes extends Tokens[TypeKey],
    NodeTypes extends Nodes[TypeKey],
> = {
    target: <TargetType extends NodeTypes>(
        type: TargetType,
    ) => GrammarItemTargetBuilder<Grammar, TypeKey, Tokens, Nodes, TokenTypes, NodeTypes, TargetType>;
};

type IToCheck<
    TokenTypes,
    NodeTypes,
    TargetType extends NodeTypes = NodeTypes,
    SourceTypes extends (TokenTypes | NodeTypes)[] = (TokenTypes | NodeTypes)[],
> = GrammarItem<any, any, any, TokenTypes, NodeTypes, TargetType, SourceTypes>;

type LToCheck<TokenTypes = any, NodeTypes = any> = IToCheck<TokenTypes, NodeTypes, any, any>[];

type FilterGrammarItems<Union extends IToCheck<any, any, any, any>, TargetType> = UnionToTuple<
    Union extends IToCheck<any, any, TargetType, any> ? Union : never
>;

type HasRecursion<
    NodeTypes,
    TargetType extends NodeTypes,
    Item extends IToCheck<any, NodeTypes>,
    List extends LToCheck,
    Visited extends NodeTypes,
> =
    Item extends IToCheck<any, any, any, [infer FirstChild, ...any[]]>
        ? FirstChild extends NodeTypes
            ? FirstChild extends Visited | TargetType
                ? true
                : FilterGrammarItems<List[number], FirstChild> extends []
                  ? false
                  : ListHasRecursion<
                        NodeTypes,
                        FilterGrammarItems<List[number], FirstChild>,
                        List,
                        Visited | TargetType | FirstChild
                    >
            : false
        : true;

type ListHasRecursion<
    NodeTypes,
    ToCheck,
    List extends LToCheck<any, NodeTypes>,
    Visited extends NodeTypes,
> = ToCheck extends []
    ? false
    : ToCheck extends [
            infer FirstItem extends IToCheck<any, NodeTypes>,
            ...infer OtherItems extends IToCheck<any, NodeTypes>[],
        ]
      ? OtherItems extends []
          ? HasRecursion<NodeTypes, Visited, FirstItem, List, Visited>
          : Or<
                HasRecursion<NodeTypes, Visited, FirstItem, List, Visited>,
                ListHasRecursion<NodeTypes, OtherItems, List, Visited>
            >
      : false;

declare const GRAMMAR: unique symbol;

export type GrammarMeta<TypeKey extends string> = {
    typeKey: TypeKey;
    [GRAMMAR]: true;
};

type CheckGrammar<TypeKey extends string, NodeTypes, Grammar extends LToCheck<any, NodeTypes>> =
    ListHasRecursion<NodeTypes, Grammar, Grammar, never> extends true ? never : Grammar & GrammarMeta<TypeKey>;

export type GrammarBuilder<
    Grammar extends GrammarItem<TypeKey, Tokens, Nodes, TokenTypes, NodeTypes, NodeTypes, (TokenTypes | NodeTypes)[]>[],
    TypeKey extends string,
    Tokens extends { [key in TypeKey]: number },
    Nodes extends { [key in TypeKey]: number },
    TokenTypes extends Tokens[TypeKey],
    NodeTypes extends Nodes[TypeKey],
> = {
    item: () => GrammarItemBuilder<Grammar, TypeKey, Tokens, Nodes, TokenTypes, NodeTypes>;
    build: () => CheckGrammar<TypeKey, NodeTypes, Grammar>;
};

export type ExpandByKey<Base, Key extends keyof Base> = Base extends infer M
    ? M extends { [K in Key]: infer V }
        ? V extends V
            ? { [K in keyof M]: K extends Key ? V : M[K] }
            : never
        : never
    : never;

export type GrammarBuilderOf<
    TypeKey extends string,
    Tokens extends { [key in TypeKey]: number },
    Nodes extends { [key in TypeKey]: number },
> =
    ExpandByKey<Tokens, TypeKey> extends { [key in TypeKey]: number }
        ? ExpandByKey<Nodes, TypeKey> extends { [key in TypeKey]: number }
            ? GrammarBuilder<
                  [],
                  TypeKey,
                  ExpandByKey<Tokens, TypeKey>,
                  ExpandByKey<Nodes, TypeKey>,
                  ExpandByKey<Tokens, TypeKey>[TypeKey],
                  ExpandByKey<Nodes, TypeKey>[TypeKey]
              >
            : never
        : never;

export type GrammarBuilderBuilder = <TypeKey extends string>(
    key: TypeKey,
) => <Tokens extends { [key in TypeKey]: number }, Nodes extends { [key in TypeKey]: number }>() => GrammarBuilderOf<
    TypeKey,
    Tokens,
    Nodes
>;

const createGrammarItemBuilder = (grammarBuilder: LocalGrammarBuilder) => {
    const data = {
        target: undefined as number | undefined,
        source: [] as number[],
        factory: undefined as any,
    };

    const builder = ((value: number) => {
        data.source.push(value);
        return builder;
    }) as any;

    builder.target = (value: number) => {
        data.target = value;
        return builder;
    };

    builder.source = builder;
    builder.factory = (value: (...args: any[]) => any) => {
        data.factory = (...args: any[]) => {
            const valueResult = value(...args);
            valueResult[grammarBuilder.typeKey] = data.target;
            return valueResult;
        };
        grammarBuilder.grammars.push(data);
        return grammarBuilder;
    };
    return builder;
};

class LocalGrammarBuilder {
    constructor(public typeKey: string) {}
    grammars: any[] = [];
    item() {
        return createGrammarItemBuilder(this);
    }

    build() {
        (this.grammars as any).typeKey = this.typeKey;
        return this.grammars;
    }
}

export const grammarBuilder: GrammarBuilderBuilder = ((key: string) => () => new LocalGrammarBuilder(key)) as any;
