/*
 * 设置页面：左侧一级分类，右侧直接展开当前分类下的全部配置。
 *
 * 设计取舍：不再做"卡片折叠展开"。折叠省的是纵向空间，代价是每次都要多一次点击；
 * 「功能开关」页用纯视觉分组标题代替折叠，既不增加交互，也能快速扫视定位。
 */
import { type Component, For, Show, createMemo, createSignal } from "solid-js";
import ModuleCard from "./module-card";
import css from "./settings.module.scss";

interface IArgs {
    modules: IFuncModule[];
    enabledMap: Record<string, boolean>;
    onToggle: (moduleName: string, enabled: boolean) => void;
}

const CATEGORY_LABELS: Record<SettingCategory, string> = {
    toggles: "功能开关",
    pomodoro: "番茄钟",
    ai: "AI 助手侧边栏",
    websocket: "WebSocket",
};

const CATEGORY_ORDER: SettingCategory[] = ["toggles", "pomodoro", "ai", "websocket"];

const TOGGLE_GROUP_LABELS: Record<ToggleGroup, string> = {
    writing: "写作编辑",
    documents: "文档导航",
    learning: "学习阅读",
    window: "界面交互",
};

const TOGGLE_GROUP_ORDER: ToggleGroup[] = ["writing", "documents", "learning", "window"];

/** 未声明 toggleGroup 的模块统一落到最后 */
const FALLBACK_GROUP = "other" as const;

type GroupKey = ToggleGroup | typeof FALLBACK_GROUP;

const GROUP_LABELS: Record<GroupKey, string> = {
    ...TOGGLE_GROUP_LABELS,
    other: "其他",
};

const GROUP_ORDER: GroupKey[] = [...TOGGLE_GROUP_ORDER, FALLBACK_GROUP];

const App: Component<IArgs> = (props) => {
    const groupedModules = createMemo(() => {
        const groups: Record<SettingCategory, IFuncModule[]> = {
            toggles: [],
            pomodoro: [],
            ai: [],
            websocket: [],
        };
        for (const module of props.modules) {
            if (module.declareSetting && groups[module.category]) {
                groups[module.category].push(module);
            }
        }
        return groups;
    });

    /** 「功能开关」页内的视觉分组，只渲染非空的组 */
    const toggleGroups = createMemo(() => {
        const buckets: Record<GroupKey, IFuncModule[]> = {
            writing: [],
            documents: [],
            learning: [],
            window: [],
            other: [],
        };
        for (const module of groupedModules().toggles) {
            const key: GroupKey = module.toggleGroup ?? FALLBACK_GROUP;
            buckets[key].push(module);
        }
        return GROUP_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
            key,
            label: GROUP_LABELS[key],
            modules: buckets[key],
        }));
    });

    const visibleCategories = createMemo(() =>
        CATEGORY_ORDER.filter((category) => groupedModules()[category].length > 0),
    );

    const [active, setActive] = createSignal<SettingCategory>(visibleCategories()[0] ?? "toggles");

    const current = createMemo(() => {
        const selected = visibleCategories().includes(active()) ? active() : visibleCategories()[0];
        return selected ?? "toggles";
    });

    return (
        <div class={`${css.settingsPage} config__tab-container`}>
            <nav class={css.nav}>
                <For each={visibleCategories()}>
                    {(category) => (
                        <button
                            type="button"
                            class={css.navItem}
                            classList={{ [css.navItemActive]: current() === category }}
                            onClick={() => setActive(category)}
                        >
                            <span>{CATEGORY_LABELS[category]}</span>
                            <span class={css.navCount}>{groupedModules()[category].length}</span>
                        </button>
                    )}
                </For>
            </nav>
            <div class={css.content}>
                <div class={css.contentTitle}>{CATEGORY_LABELS[current()]}</div>
                <Show when={current() === "toggles"} fallback={
                    <div class={css.moduleList}>
                        <For each={groupedModules()[current()]}>
                            {(module) => (
                                <ModuleCard
                                    module={module}
                                    enabled={props.enabledMap[module.name] ?? false}
                                    onToggle={(enabled) => props.onToggle(module.name, enabled)}
                                />
                            )}
                        </For>
                    </div>
                }>
                    <div class={css.contentHint}>
                        下列模块只有开关，没有额外配置项。改动立即生效。
                    </div>
                    <For each={toggleGroups()}>
                        {(group) => (
                            <div class={css.group}>
                                <div class={css.groupTitle}>{group.label}</div>
                                <div class={css.moduleList}>
                                    <For each={group.modules}>
                                        {(module) => (
                                            <ModuleCard
                                                module={module}
                                                enabled={props.enabledMap[module.name] ?? false}
                                                onToggle={(enabled) => props.onToggle(module.name, enabled)}
                                            />
                                        )}
                                    </For>
                                </div>
                            </div>
                        )}
                    </For>
                </Show>
            </div>
        </div>
    );
};

export default App;
