export function LoadingState(props: { text?: string }) {
    return <div class="srs-loading-card">{props.text || '正在加载 SRS 数据...'}</div>;
}
