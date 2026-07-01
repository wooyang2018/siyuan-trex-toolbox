export function StatusBadge(props: { label: string; tone?: 'success' | 'warning' | 'danger' | 'info' }) {
    return <span class="srs-status-badge" data-tone={props.tone || 'info'}>{props.label}</span>;
}
