/*
 * 模块卡片：默认只显示标题、说明和开关。有配置时点标题展开。
 */
import { type Component, For, Show, createMemo, createSignal } from "solid-js";
import Form from "@/libs/components/Form";
import css from "./settings.module.scss";

interface ModuleCardProps {
    module: IFuncModule;
    enabled: boolean;
    onToggle?: (enabled: boolean) => void;
}

const ModuleCard: Component<ModuleCardProps> = (props) => {
    const setting = () => props.module.declareSetting;
    const [open, setOpen] = createSignal(false);

    const hasBody = createMemo(() => {
        const s = setting();
        if (!s) return false;
        return (s.configs && s.configs.length > 0) || !!s.customPanel;
    });

    return (
        <Show when={setting()}>
            <div class={css.card}>
                <div class={css.cardHeader}>
                    <Show
                        when={hasBody()}
                        fallback={
                            <div class={css.cardMain}>
                                <div class={css.cardTitleWrap}>
                                    <div class={css.cardTitle}>{setting()!.title}</div>
                                    <div class={css.cardDescription} innerHTML={setting()!.description} />
                                </div>
                            </div>
                        }
                    >
                        <button
                            type="button"
                            class={`${css.cardMain} ${css.cardMainExpandable}`}
                            aria-expanded={open()}
                            onClick={() => setOpen(!open())}
                        >
                            <span class={css.chevron} classList={{ [css.chevronOpen]: open() }} />
                            <div class={css.cardTitleWrap}>
                                <div class={css.cardTitle}>{setting()!.title}</div>
                                <div class={css.cardDescription} innerHTML={setting()!.description} />
                            </div>
                        </button>
                    </Show>
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
                <Show when={hasBody() && open()}>
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
                                                style={item?.direction === "row" ? { width: "100%" } : null}
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
