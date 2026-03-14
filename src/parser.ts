import {
    grammarBuilder as GrammarBuilderBuilder,
    type GrammarItem,
    type GrammarBuilderOf,
    type GrammarMeta,
    type ExpandByKey,
} from './grammar';

type BaseGrammarItem<
    TypeKey extends string,
    Tokens extends { [key in TypeKey]: number },
    Nodes extends { [key in TypeKey]: number },
> = GrammarItem<
    TypeKey,
    Tokens,
    Nodes,
    Tokens[TypeKey],
    Nodes[TypeKey],
    Nodes[TypeKey],
    (Tokens[TypeKey] | Nodes[TypeKey])[]
>;

declare const CUSTOM_RULE: unique symbol;

type CustomRule<
    TypeKey extends string,
    Tokens extends { [key in TypeKey]: number },
    Nodes extends { [key in TypeKey]: number },
    TargetType extends Nodes[TypeKey],
> = {
    [CUSTOM_RULE]: true;
    target: TargetType;
    factory: (
        tokenStream: Tokens[],
        start: number,
    ) => {
        node: Omit<Extract<ExpandByKey<Nodes, TypeKey>, { [key in TypeKey]: TargetType }>, TypeKey>;
        next: number;
    };
};

// 定义文法的一项：target -> source[0] source[1] ...
// factory函数从所有AST子节点生成AST父节点
type GrammarItemInner = {
    target: number;
    source: number[];
    // 参数为所有子节点或token。例如，如果有文法规则A -> a B (其中a为token，B为子节点)，则参数将是一个类型为a的token和一个类型为B的子节点
    // 该factory返回的节点不需要带有typeKey，builder在build过程中会自动为其加入typeKey
    factory: (...args: any[]) => any;
};

// 定义自定义处理规则
type CustomRuleInner = {
    target: number;

    // 如果成功解析到AST节点，返回节点以及下一个节点解析的起始位置，否则抛出异常
    factory: (
        tokenStream: any[],
        start: number,
    ) => {
        node: any;
        next: number;
    };
};

export type CustomRuleBuilder<
    TypeKey extends string,
    Tokens extends { [key in TypeKey]: number },
    Nodes extends { [key in TypeKey]: number },
> = {
    <TargetType extends Nodes[TypeKey]>(
        target: TargetType,
        factory: CustomRule<TypeKey, Tokens, Nodes, TargetType>['factory'],
    ): CustomRule<TypeKey, Tokens, Nodes, TargetType>;
};

type EnumOf<T extends number> = {
    [key: string]: T | string;
    [key: number]: string;
};

class Parser<
    TypeKey extends string,
    Tokens extends { [key in TypeKey]: number },
    Nodes extends { [key in TypeKey]: number },
    RootKey extends Nodes[TypeKey],
> {
    private grammar: GrammarItemInner[];
    private customRules: CustomRuleInner[];

    // 用法: grammarMap[target][firstToken]，找到生成target且第一个token为firstToken的所有文法项
    private grammarMap = {} as Record<number, Record<number, GrammarItemInner[]>>;

    // 用法: customRuleMap[target]，找到生成target的所有文法项
    private customRuleMap = {} as Record<number, CustomRuleInner[]>;

    constructor(
        private typeKey: TypeKey,
        private tokenTypes: EnumOf<Tokens[TypeKey]>,
        private rootNode: RootKey,
        grammarFactory: (
            grammarBuilder: GrammarBuilderOf<TypeKey, Tokens, Nodes>,
            customRuleBuilder: CustomRuleBuilder<TypeKey, Tokens, Nodes>,
        ) => {
            grammar: BaseGrammarItem<TypeKey, Tokens, Nodes>[] & GrammarMeta<TypeKey>;
            customRules: CustomRule<TypeKey, Tokens, Nodes, Nodes[TypeKey]>[];
        },
    ) {
        const grammarBuilder = GrammarBuilderBuilder(typeKey)<Tokens, Nodes>();
        const customRuleBuilder: CustomRuleBuilder<TypeKey, Tokens, Nodes> = ((
            target: number,
            rawFactory: (tokenStream: Tokens[], start: number) => CustomRule<TypeKey, Tokens, Nodes, Nodes[TypeKey]>,
        ) => {
            const factory = (tokenStream: Tokens[], start: number) => {
                const result = rawFactory(tokenStream, start);
                (result as any)[typeKey] = target;
                return result;
            };
            return { target, factory };
        }) as any;
        const buildResult = grammarFactory(grammarBuilder, customRuleBuilder);
        this.grammar = buildResult.grammar;
        this.customRules = buildResult.customRules;
        this.calculateFirst();
        for (const rule of this.customRules) {
            if (!this.customRuleMap[rule.target]) {
                this.customRuleMap[rule.target] = [rule];
            } else {
                this.customRuleMap[rule.target].push(rule);
            }
        }
    }

    // 通过builder构建文法已经保证文法不含左递归
    private calculateFirst() {
        const tokens = new Set<number>();
        for (const key in this.tokenTypes) {
            if (typeof this.tokenTypes[key] == 'number') {
                tokens.add(this.tokenTypes[key]);
            }
        }
        const firstSets = new Array<Set<number> | null>(this.grammar.length).fill(null);
        const visit = (id: number) => {
            if (firstSets[id]) {
                return firstSets[id];
            }

            const item = this.grammar[id];
            const first = item.source[0];
            if (tokens.has(first)) {
                firstSets[id] = new Set<number>([first]);
                return firstSets[id];
            }

            const childrenIDs: number[] = [];
            for (let i = 0; i < this.grammar.length; i++) {
                if (this.grammar[i].target == first) {
                    childrenIDs.push(i);
                }
            }
            const result = new Set<number>();
            for (const childId of childrenIDs) {
                const childResult = visit(childId);
                childResult?.forEach((v) => result.add(v));
            }
            firstSets[id] = result;
            return result;
        };

        for (let i = 0; i < this.grammar.length; i++) {
            const firstSet = visit(i);
            firstSet.forEach((value) => {
                if (!this.grammarMap[this.grammar[i].target]) {
                    this.grammarMap[this.grammar[i].target] = { [value]: [this.grammar[i]] };
                } else if (!this.grammarMap[this.grammar[i].target][value]) {
                    this.grammarMap[this.grammar[i].target][value] = [this.grammar[i]];
                } else {
                    this.grammarMap[this.grammar[i].target][value].push(this.grammar[i]);
                }
            });
        }
    }

    private parseTokenStream(tokenStream: Tokens[]): any {
        // 收集所有 token 类型值，用于在 source 中区分 token 和节点
        const tokenSet = new Set<number>();
        for (const key in this.tokenTypes) {
            if (typeof (this.tokenTypes as any)[key] === 'number') {
                tokenSet.add((this.tokenTypes as any)[key] as number);
            }
        }

        const self = this;

        // 生成器：枚举所有能从 start 位置成功解析 target 节点的结果
        function* parseNode(target: number, start: number): Generator<{ node: any; next: number }> {
            // 先尝试自定义规则（customRuleMap 中的 factory 返回 { node, next }，节点本身不带 typeKey）
            for (const rule of self.customRuleMap[target] ?? []) {
                try {
                    const result = rule.factory(tokenStream, start);
                    result.node[self.typeKey] = rule.target;
                    yield result;
                } catch {
                    // 该自定义规则不匹配，继续尝试下一条
                }
            }

            // 再尝试普通文法规则
            if (start >= tokenStream.length) return;

            const firstTokenType = (tokenStream[start] as any)[self.typeKey] as number;
            const candidates = self.grammarMap[target]?.[firstTokenType] ?? [];

            for (const rule of candidates) {
                yield* parseRule(rule, start);
            }
        }

        // 生成器：枚举应用某条文法规则时所有可能的解析结果
        function* parseRule(rule: GrammarItemInner, start: number): Generator<{ node: any; next: number }> {
            // 递归地逐个匹配 source 中的每个元素，收集 children
            function* step(i: number, pos: number, children: any[]): Generator<{ node: any; next: number }> {
                if (i === rule.source.length) {
                    // grammar.ts 中的 factory 已自动为节点设置 typeKey
                    yield { node: rule.factory(...children), next: pos };
                    return;
                }

                const srcType = rule.source[i];
                if (tokenSet.has(srcType)) {
                    // 匹配一个 token
                    if (pos >= tokenStream.length) return;
                    const tok = tokenStream[pos] as any;
                    if (tok[self.typeKey] !== srcType) return;
                    yield* step(i + 1, pos + 1, [...children, tok]);
                } else {
                    // 递归解析一个子节点，对每种可能的解析结果继续尝试后续元素
                    for (const result of parseNode(srcType, pos)) {
                        yield* step(i + 1, result.next, [...children, result.node]);
                    }
                }
            }

            yield* step(0, start, []);
        }

        // 取第一个消费了全部 token 的解析结果作为根节点
        for (const result of parseNode(this.rootNode, 0)) {
            if (result.next === tokenStream.length) {
                return result.node;
            }
        }

        throw new Error('Parse failed: could not parse the entire token stream');
    }

    // 仅用于提供Typescript类型支持
    parse(tokenStream: Tokens[]): Extract<ExpandByKey<Nodes, TypeKey>, { [key in TypeKey]: RootKey }> {
        return this.parseTokenStream(tokenStream);
    }
}

declare const KEY_OVERLAP: unique symbol;

type KeyOverlap = {
    [KEY_OVERLAP]: true;
};

type HasOverlap<T, U> = [Extract<T, U>] extends [never] ? false : true;

export const createParser =
    <TypeKey extends string>(typeKey: TypeKey) =>
    <Tokens extends { [key in TypeKey]: number }, Nodes extends { [key in TypeKey]: number }>(
        ..._: HasOverlap<Tokens[TypeKey], Nodes[TypeKey]> extends true ? [KeyOverlap] : []
    ) =>
    <RootKey extends Nodes[TypeKey]>(
        tokenTypes: EnumOf<Tokens[TypeKey]>,
        rootNode: RootKey,
        grammarFactory: (
            grammarBuilder: GrammarBuilderOf<TypeKey, Tokens, Nodes>,
            customRuleBuilder: CustomRuleBuilder<TypeKey, Tokens, Nodes>,
        ) => {
            grammar: BaseGrammarItem<TypeKey, Tokens, Nodes>[] & GrammarMeta<TypeKey>;
            customRules: CustomRule<TypeKey, Tokens, Nodes, Nodes[TypeKey]>[];
        },
    ) =>
        new Parser<TypeKey, Tokens, Nodes, RootKey>(typeKey, tokenTypes, rootNode, grammarFactory);
