/*
 * 模块卡片：标题、说明、开关，以及（如果有）直接展开的配置区。
 *
 * 不做折叠展开：一级菜单已经把"复杂配置"隔离出来了，
 * 进入某一页就说明用户要看这一页的全部内容，再折叠只会多一次点击。
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

    /**
     * 只有"需要占满一行"的输入控件才拉满宽度。
     * checkbox / slider / button 本身尺寸就合适，拉满会变成一条横杠
     * （例如 b3-switch 被 width:100% 拉成整行，看起来完全不像开关）。
     */
    const FULL_WIDTH_TYPES = new Set(["textinput", "textarea", "select"]);

    const needsFullWidth = (item: IConfigItem<any>): boolean =>
        FULL_WIDTH_TYPES.has(item.type) || item.direction === "column";

    const hasBody = createMemo(() => {
        const s = setting();
        if (!s) return false;
        return (s.configs && s.configs.length > 0) || !!s.customPanel;
    });

    return (
        <Show when={setting()}>
            <div class={css.card}>
                <div class={css.cardHeader}>
                    <div class={css.cardMain}>
                        <div class={css.cardTitleWrap}>
                            <div class={css.cardTitle}>{setting()!.title}</div>
                            <div class={css.cardDescription} innerHTML={setting()!.description} />
                        </div>
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
                                                style={needsFullWidth(item) ? { width: "100%" } : null}
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
