/**
 * LLM client — calls Claude Code CLI via child_process.spawn.
 * Requires SiYuan Desktop (Electron) with nodeIntegration enabled.
 */
import type { IProgressReporter } from '../types';

/**
 * Call the local `claude` CLI with --print flag.
 * System prompt and user prompt are merged and sent via stdin.
 */
export async function callLLM(
    cliPath: string,
    systemPrompt: string,
    userPrompt: string,
    reporter?: IProgressReporter
): Promise<string> {
    const cp = (window as any)?.require?.('child_process');
    if (!cp) {
        throw new Error('child_process 不可用，请使用 SiYuan 桌面版');
    }

    const fullPrompt = systemPrompt
        ? `${systemPrompt}\n\n---\n\n${userPrompt}`
        : userPrompt;

    return new Promise<string>((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        const proc = cp.spawn(cliPath || 'claude', ['--print'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env },
        });

        const signal = reporter?.abortController?.signal;
        if (signal) {
            signal.addEventListener('abort', () => proc.kill('SIGTERM'), { once: true });
        }

        proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

        proc.on('error', (err: Error) => {
            reject(new Error(`启动 Claude CLI 失败: ${err.message}（请检查 CLI 路径: ${cliPath || 'claude'}）`));
        });

        proc.on('close', (code: number | null) => {
            if (reporter?.cancelled) {
                reject(new Error('操作已取消'));
            } else if (code !== 0) {
                reject(new Error(`Claude CLI 异常退出 (code=${code}): ${stderr.trim() || '无详情'}`));
            } else {
                resolve(stdout.trim());
            }
        });

        proc.stdin?.write(fullPrompt, 'utf8');
        proc.stdin?.end();
    });
}
