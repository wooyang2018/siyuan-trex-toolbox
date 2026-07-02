/*
 * 模块卡片组件
 * 每个功能模块渲染为一个卡片：标题 + 描述 + 开关 + 配置项 + 自定义面板
 */
import { type Component, For, Show, createMemo } from "solid-js";
import Form from "@/libs/components/Form";
import css from "./settings.module.scss";

interface ModuleCardProps {
    module: IFuncModule;
    enabled: boolean;
    onToggle?: (enabled: boolean) => void;
}

const ModuleCard: Component<ModuleCardProps> = (props) => {
    const setting = () => props.module.declareSetting;

    const hasBody = createMemo(() => {
        const s = setting();
        if (!s) return false;
        return (s.configs && s.configs.length > 0) || !!s.customPanel;
    });

    return (
        <Show when={setting()}>
            <div class={css.card}>
                <div class={css.cardHeader}>
                    <div class={css.cardTitleWrap}>
                        <div class={css.cardTitle}>{setting()!.title}</div>
                        <div class={css.cardDescription} innerHTML={setting()!.description} />
                    </div>
                    <Show when={setting()!.toggle}>
                        <div class={css.cardToggle}>
                            <input
                                class="b3-switch"
                                type="checkbox"
                                checked={props.enabled}
                                onChange={(e) => props.onToggle?.(e.currentTarget.checked)}
                            />
                        </div>
                    </Show>
                </div>
                <Show when={hasBody()}>
                    <div class={css.cardBody}>
                        <Show when={setting()!.configs && setting()!.configs!.length > 0}>
                            <div class={css.configSection}>
                                <For each={setting()!.configs}>
                                    {(item) => (
                                        <Form.Wrap
                                            title={item.title}
                                            description={item.description}
                                            direction={item?.direction}
                                        >
                                            <Form.Input
                                                type={item.type}
                                                key={item.key}
                                                value={item.get()}
                                                placeholder={item?.placeholder}
                                                options={item?.options}
                                                slider={item?.slider}
                                                button={item?.button}
                                                number={item?.number}
                                                changed={(v) => item.set(v)}
                                                style={item?.direction === 'row' ? { width: '100%' } : null}
                                            />
                                        </Form.Wrap>
                                    )}
                                </For>
                            </div>
                        </Show>
                        <Show when={setting()!.customPanel}>
                            <div class={css.customPanel}>
                                {setting()!.customPanel!()}
                            </div>
                        </Show>
                    </div>
                </Show>
            </div>
        </Show>
    );
};

export default ModuleCard;
