<script lang="ts">
    import { afterUpdate, onMount } from "svelte";

    export let content = "";
    let element: HTMLDivElement;
    let lastContent = "";
    let frame = 0;

    function escapeHtml(text: string) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function fallbackMarkdown(markdown: string) {
        let html = escapeHtml(markdown);
        html = html.replace(/```([\s\S]*?)```/g, (_match, code) => `<pre><code>${code}</code></pre>`);
        html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
        html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
        html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
        html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");
        html = html.replace(/^# (.*)$/gm, "<h1>$1</h1>");
        html = html.replace(/\n{2,}/g, "</p><p>");
        html = html.replace(/\n/g, "<br>");
        return `<p>${html}</p>`;
    }

    function injectCopyButtons() {
        if (!element) return;
        // Remove previously injected buttons to avoid duplicates on re-render
        element.querySelectorAll(".cn-copy-btn").forEach(btn => btn.remove());
        element.querySelectorAll("pre").forEach(pre => {
            const codeEl = pre.querySelector("code");
            if (!codeEl) return;
            const btn = document.createElement("button");
            btn.className = "cn-copy-btn";
            btn.textContent = "复制";
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const text = codeEl.innerText ?? codeEl.textContent ?? "";
                navigator.clipboard.writeText(text).then(() => {
                    btn.textContent = "已复制";
                    btn.classList.add("cn-copied");
                    setTimeout(() => {
                        btn.textContent = "复制";
                        btn.classList.remove("cn-copied");
                    }, 1500);
                }).catch(() => {
                    btn.textContent = "复制失败";
                    setTimeout(() => { btn.textContent = "复制"; }, 1500);
                });
            });
            pre.appendChild(btn);
        });
    }

    function renderNow() {
        if (!element || content === lastContent) return;
        lastContent = content;
        try {
            const lute = (window as any).Lute?.New?.();
            if (lute?.Md2HTML) {
                element.innerHTML = lute.Md2HTML(content);
                injectCopyButtons();
                return;
            }
        } catch (error) {
            console.warn("Claude Note markdown render failed", error);
        }
        element.innerHTML = fallbackMarkdown(content);
        injectCopyButtons();
    }

    function scheduleRender() {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            frame = 0;
            renderNow();
        });
    }

    onMount(scheduleRender);
    afterUpdate(scheduleRender);
</script>

<div class="cn-md" bind:this={element}></div>
