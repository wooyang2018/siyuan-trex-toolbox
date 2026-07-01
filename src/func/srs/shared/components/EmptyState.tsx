export function EmptyState(props: { title: string; description?: string; action?: any }) {
    return (
        <div class="srs-empty-card">
            <div>
                <div class="srs-section-title" style={{ 'font-size': '18px' }}>{props.title}</div>
                <div class="srs-section-subtitle" style={{ 'margin-top': '8px' }}>{props.description}</div>
                {props.action}
            </div>
        </div>
    );
}
