/**
 * 番茄钟浮层控制器
 *
 * @description 把 Panel 渲染到一个 body 级容器里，定位在状态栏按钮上方；
 *              外部点击和 Esc 会关闭。切到别的窗口不收起。
 */
import { render } from "solid-js/web";
import type { PomodoroService } from "../service";
import { Panel } from "./Panel";
import StatsDialog from "./StatsDialog";
import { solidDialog } from "@/libs/dialog";

const POPOVER_CLASS = "trex-pomodoro-popover";
const GAP = 8;

export class PomodoroPopover {
    private host: HTMLElement | null = null;

    private disposeRender: (() => void) | null = null;

    private statsDialogClose: (() => void) | null = null;

    constructor(private readonly service: PomodoroService) {}

    toggle(anchor: HTMLElement | null): void {
        if (this.host) this.close();
        else this.open(anchor);
    }

    open(anchor: HTMLElement | null): void {
        if (this.host) return;
        const host = document.createElement("div");
        host.className = POPOVER_CLASS;
        document.body.appendChild(host);
        this.host = host;

        this.disposeRender = render(
            () => (
                <Panel
                    service={this.service}
                    onOpenStats={() => this.openStats()}
                    onClose={() => this.close()}
                />
            ),
            host,
        );

        this.position(anchor);
        document.addEventListener("mousedown", this.onDocumentMouseDown, true);
        document.addEventListener("keydown", this.onKeyDown, true);
        window.addEventListener("resize", this.onWindowResize);
    }

    close(): void {
        if (!this.host) return;
        document.removeEventListener("mousedown", this.onDocumentMouseDown, true);
        document.removeEventListener("keydown", this.onKeyDown, true);
        window.removeEventListener("resize", this.onWindowResize);
        this.disposeRender?.();
        this.disposeRender = null;
        this.host.remove();
        this.host = null;
    }

    openStats(): void {
        // 统计弹窗是模态的，先收起浮层避免两个层级叠在一起
        this.close();
        if (this.statsDialogClose) return;
        const { dialog } = solidDialog({
            title: "番茄钟统计",
            width: "920px",
            height: "640px",
            loader: () => <StatsDialog service={this.service} />,
            callback: () => {
                this.statsDialogClose = null;
            },
        });
        this.statsDialogClose = () => dialog.destroy();
    }

    dispose(): void {
        this.close();
        this.statsDialogClose?.();
        this.statsDialogClose = null;
    }

    // ==================== 定位 ====================

    /**
     * 底边钉在状态栏按钮上方。
     * 跳过/放弃和任务名单出现时会增高；钉 bottom 后多出来的高度只往上长。
     * 任务名单在卡片内部排开，不使用绝对定位。
     */
    private position(anchor: HTMLElement | null): void {
        if (!this.host) return;
        const panel = this.host.firstElementChild as HTMLElement | null;
        if (!panel) return;

        const rect = anchor?.getBoundingClientRect();
        const margin = 8;
        const width = panel.offsetWidth || panel.getBoundingClientRect().width || 268;
        const anchorVisible = !!rect && (rect.width > 0 || rect.height > 0);

        const bottom = anchorVisible ? Math.max(margin, window.innerHeight - rect.top + GAP) : margin;
        const preferredLeft = anchorVisible ? rect.left + rect.width / 2 - width / 2 : window.innerWidth - width - margin;
        const left = Math.min(Math.max(margin, preferredLeft), Math.max(margin, window.innerWidth - width - margin));

        panel.style.left = `${left}px`;
        panel.style.top = "auto";
        panel.style.bottom = `${bottom}px`;
        panel.style.maxHeight = `${Math.max(160, window.innerHeight - bottom - margin)}px`;
        panel.style.visibility = "visible";
    }

    // ==================== 事件 ====================

    private onDocumentMouseDown = (event: MouseEvent): void => {
        const target = event.target as Node | null;
        if (!target) return;
        if (this.host?.contains(target)) return;
        // 点击状态栏按钮本身交给按钮的 click 处理，避免「关了又开」
        const anchor = this.service.getStatusBarElement();
        if (anchor?.contains(target)) return;
        this.close();
    };

    private onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            event.stopPropagation();
            this.close();
        }
    };

    private onWindowResize = (): void => {
        this.position(this.service.getStatusBarElement());
    };
}
