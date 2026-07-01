import { sql } from '@/api';
import type { SRSCard } from '@/types/srs';
import { getAllCards } from '../core/card-repository';

export async function sqlSearchCards(query: string): Promise<SRSCard[]> {
    if (!query.trim()) return getAllCards();
    try {
        const results = await sql(query);
        if (!Array.isArray(results)) return [];
        const blockIds = results.map((r: any) => r.id).filter(Boolean);
        return getAllCards().filter(c => blockIds.includes(c.blockId));
    } catch (e) {
        console.error('[SRS-Browser] SQL search failed:', e);
        return [];
    }
}
