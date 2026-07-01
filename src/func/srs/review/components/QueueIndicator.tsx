/**
 * QueueIndicator - shows current queue type
 */
import type { QueueType } from '@/types/srs';

const QUEUE_LABELS: Record<QueueType, string> = {
    retrieval: '提取练习',
};

const QUEUE_COLORS: Record<QueueType, string> = {
    retrieval: '#3B82F6',
};

export function QueueIndicator(props: { queueType: QueueType }) {
    return (
        <div class="srs-queue-indicator">
            <span class="srs-queue-dot" style={{ background: QUEUE_COLORS[props.queueType] }} />
            {QUEUE_LABELS[props.queueType]}
        </div>
    );
}
