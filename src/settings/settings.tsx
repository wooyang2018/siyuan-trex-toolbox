/*
 * 设置页面主组件 — 单页分组滚动布局
 * 所有模块按功能类别分组，纵向排列展示
 */
import { type Component, For, Show, createMemo } from "solid-js";
import ModuleCard from "./module-card";
import css from "./settings.module.scss";

interface IArgs {
    modules: IFuncModule[];
    enabledMap: Record<string, boolean>;
    onToggle: (moduleName: string, enabled: boolean) => void;
}

const CATEGORY_LABELS: Record<SettingCategory, string> = {
    editing: '编辑增强',
    ai: 'AI 工具',
    document: '文档与导航',
    ui: '界面与窗口',
    advanced: '高级设置',
};

const CATEGORY_ORDER: SettingCategory[] = ['editing', 'ai', 'document', 'ui', 'advanced'];

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

    return (
        <div class={`${css.settingsPage} config__tab-container`}>
            <For each={CATEGORY_ORDER}>
                {(category) => (
                    <Show when={groupedModules()[category].length > 0}>
                        <div class={css.group}>
                            <div class={css.groupTitle}>
                                {CATEGORY_LABELS[category]}
                            </div>
                            <div class={css.moduleList}>
                                <For each={groupedModules()[category]}>
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
                    </Show>
                )}
            </For>
        </div>
    );
};

export default App;
