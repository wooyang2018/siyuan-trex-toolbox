import { For } from 'solid-js';
import type { BrowserTaskFilter } from '../types';

const FILTERS: Array<{ key: BrowserTaskFilter; label: string; desc: string }> = [
    { key: 'all', label: '全部卡片', desc: '查看完整资产' },
    { key: 'due', label: '今日到期', desc: '优先清理' },
    { key: 'lapseRisk', label: '遗忘风险', desc: '需要治理' },
    { key: 'learning', label: '学习中', desc: '短期巩固' },
    { key: 'new', label: '新卡', desc: '待启动' },
];

export function BrowserTaskFilters(props: { value: BrowserTaskFilter; onChange: (value: BrowserTaskFilter) => void }) {
    return (
        <div class="srs-task-filters">
            <For each={FILTERS}>
                {(item) => (
                    <button class="srs-task-chip" classList={{ 'srs-task-chip--active': props.value === item.key }} onClick={() => props.onChange(item.key)}>
                        <span>{item.label}</span>
                        <small>{item.desc}</small>
                    </button>
                )}
            </For>
        </div>
    );
}
