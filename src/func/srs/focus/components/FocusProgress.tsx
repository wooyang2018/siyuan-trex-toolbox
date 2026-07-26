/**
 * FocusProgress — 顶部进度条组件
 * 格式：水平进度条 + "10 / 20  50%"
 */
export function FocusProgress(props: { current: number; total: number }) {
    const percent = () => {
        if (props.total <= 0) return 0;
        return Math.round((props.current / props.total) * 100);
    };

    const fillWidth = () => {
        if (props.total <= 0) return '0%';
        return `${(props.current / props.total) * 100}%`;
    };

    return (
        <div class="srs-focus-progress">
            <div class="srs-progress-track">
                <div class="srs-progress-fill" style={{ width: fillWidth() }} />
            </div>
            <span class="srs-focus-progress-text">
                {props.current} / {props.total}&nbsp;&nbsp;{percent()}%
            </span>
        </div>
    );
}
