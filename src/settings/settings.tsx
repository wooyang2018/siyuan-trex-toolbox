/*
 * 设置页面：左侧分类，右侧只显示当前分类的模块。
 */
import { type Component, For, createMemo, createSignal } from "solid-js";
import ModuleCard from "./module-card";
import css from "./settings.module.scss";

interface IArgs {
    modules: IFuncModule[];
    enabledMap: Record<string, boolean>;
    onToggle: (moduleName: string, enabled: boolean) => void;
}

const CATEGORY_LABELS: Record<SettingCategory, string> = {
    editing: "编辑增强",
    ai: "AI 工具",
    document: "文档与导航",
    ui: "界面与窗口",
    advanced: "高级设置",
};

const CATEGORY_ORDER: SettingCategory[] = ["editing", "ai", "document", "ui", "advanced"];

const App: Component<IArgs> = (props) => {
    const groupedModules = createMemo(() => {
        const groups: Record<SettingCategory, IFuncModule[]> = {
            editing: [],
            ai: [],
            document: [],
            ui: [],
            advanced: [],
        };
        for (const module of props.modules) {
            if (module.declareSetting && groups[module.category]) {
                groups[module.category].push(module);
            }
        }
        return groups;
    });

    const visibleCategories = createMemo(() =>
        CATEGORY_ORDER.filter((category) => groupedModules()[category].length > 0),
    );

    const [active, setActive] = createSignal<SettingCategory>(visibleCategories()[0] ?? "editing");

    const current = createMemo(() => {
        const selected = visibleCategories().includes(active()) ? active() : visibleCategories()[0];
        return selected ?? "editing";
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
            </div>
        </div>
    );
};

export default App;
