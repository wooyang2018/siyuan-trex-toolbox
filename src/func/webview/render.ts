/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-03 21:22:00
 * @FilePath     : /src/func/webview/render.ts
 * @LastEditTime : 2024-08-12 20:50:32
 * @Description  : 从 Webapp 插件当中拿过来的代码
 */
import siyuan from 'siyuan';
import * as clipboard from './utils/clipboard';
import { ElectronParams, IWebApp } from './utils/types';

import './index.scss';

export const renderView = (
    context: {
        element: Element,
        data: IWebApp,
        controller?: boolean
    },
    plugin: siyuan.Plugin
) => {
    const useController = context.controller ?? true;

    context.element.innerHTML = `
  <div style="display: flex" class="webapp-view fn__flex-column fn__flex fn__flex-1 ${context.data.name}__custom-tab">
      <webview allowfullscreen allowpopups style="border: none" class="fn__flex-column fn__flex  fn__flex-1" src="${context.data.url}"
        ${context.data.proxy ? 'partition="' + context.data.name + '"' : ''}
        webpreferences="disableWebSecurity=yes"></webview>
      <div class="webapp-view-controller ${useController ? '' : 'fn__none'}">
        <span class="pointer handle"><svg><use xlink:href="#iconSettings"></use></svg></span> 
        <span class="pointer func home"><svg><use xlink:href="#iconLanguage"></use></svg>Home</span>
        <span class="pointer func refresh"><svg><use xlink:href="#iconRefresh"></use></svg>刷新</span>
        <span class="pointer func goBack"><svg><use xlink:href="#iconLeft"></use></svg>返回</span>
        <span class="pointer func goForward"><svg><use xlink:href="#iconRight"></use></svg>前进</span>
        <span>|</span>
        <span class="pointer func zoomIn"><svg><use xlink:href="#iconZoomIn"></use></svg>Zoom In</span>
        <span class="pointer func zoomOut"><svg><use xlink:href="#iconZoomOut"></use></svg>Zoom Out</span>
        <span class="pointer func zoomRecovery"><svg><use xlink:href="#iconSearch"></use></svg>Zoom Reset</span>
        <span>|</span>
        <span class="pointer func devtool"><svg><use xlink:href="#iconInlineCode"></use></svg>Devtool</span>
      </div>
      <div class="webapp-view-cover fn__none" style="position: absolute; top: 0; left: 0; height: 100%; width: 100%;"></div>
  </div>`;
    const webview = context.element.querySelector("webview") as any;
    const cover = context.element.querySelector('.webapp-view-cover');
    const controller = context.element.querySelector('.webapp-view-controller');
    webview.addEventListener("dom-ready", () => {
        controller.querySelector('.home').addEventListener('click', () => {
            webview.src = context.data.url;
        });
        controller.querySelector('.refresh').addEventListener('click', () => {
            webview.reload();
        });
        const zoom = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5, 2, 2.5, 3];
        let index = zoom.findIndex(v => v === 1);
        controller.querySelector('.zoomIn').addEventListener('click', () => {
            if (index < zoom.length - 1) {
                index++;
                webview.setZoomFactor(zoom[index]);
            }
        });
        controller.querySelector('.zoomOut').addEventListener('click', () => {
            if (index > 0) {
                index--;
                webview.setZoomFactor(zoom[index]);
            }
        });
        controller.querySelector('.zoomRecovery').addEventListener('click', () => {
            if (index > 0) {
                index = zoom.findIndex(v => v === 1);
                webview.setZoomFactor(zoom[index]);
            }
        });
        controller.querySelector('.goBack').addEventListener('click', () => {
            if (webview.canGoBack()) {
                webview.goBack();
            }
        });
        controller.querySelector('.goForward').addEventListener('click', () => {
            if (webview.canGoForward()) {
                webview.goForward();
            }
        });
        controller.querySelector('.devtool').addEventListener('click', () => {
            if (!webview.isDevToolsOpened()) {
                webview.openDevTools();
            }
        });
    });


    let startDrag = false;
    const onDragStart = (e) => {
        const el = e.target;
        if (!el) return;
        if (el.getAttribute('data-type') === 'tab-header' || el.parentElement.getAttribute('data-type') === 'tab-header') {
            startDrag = true;
            cover.classList.remove('fn__none');
        }
    };
    const onDragStop = () => {
        startDrag = false;
        cover.classList.add('fn__none');
    };
    const onResizeStart = (e) => {
        if (e.target.classList.contains('layout__resize')) {
            startDrag = true;
            cover.classList.remove('fn__none');
        }
    };
    const onResizeStop = (e) => {
        if (e.target.classList.contains('layout__resize')) {
            startDrag = false;
            cover.classList.add('fn__none');
        }
    };
    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('mousedown', onResizeStart, true);
    document.addEventListener('mouseup', onResizeStop, true);
    document.addEventListener('dragend', onDragStop, true);

    let menu;
    webview?.addEventListener?.("context-menu", e => {
        console.log('context-menu', e);
        const { params } = e;
        const title = params.titleText || params.linkText || params.altText || params.suggestedFilename;

        const items: siyuan.IMenu[] = [];

        const buildOpenMenuItems = (url: string, title: string, action: string, current: boolean = true): siyuan.IMenu[] => {
            const items: siyuan.IMenu[] = [];
            return items;
        };

        const buildCopyMenuItems = (params: ElectronParams): siyuan.IMenu[] => {
            const items: siyuan.IMenu[] = [];

            if (params.linkURL) {
                items.push({
                    icon: "iconLink",
                    label: '复制链接地址',
                    action: "iconLink",
                    click: () => clipboard.writeText(params.linkURL),
                });
            }

            if (params.srcURL) {
                items.push({
                    icon: "iconLink",
                    label: 'copyResourceAddress',
                    action: "iconCloud",
                    click: () => clipboard.writeText(params.srcURL),
                });
            }

            if (params.frameURL) {
                items.push({
                    icon: "iconLink",
                    label: 'copyFrameAddress',
                    action: "iconLayout",
                    click: () => clipboard.writeText(params.frameURL),
                });
            }

            if (params.pageURL) {
                items.push({
                    icon: "iconLink",
                    label: 'copyPageAddress',
                    action: "iconFile",
                    click: () => clipboard.writeText(params.pageURL),
                });
            }

            items.push({ type: "separator" });

            if (params.titleText) {
                items.push({
                    icon: "icon-webview-title",
                    label: 'copyTitle',
                    click: () => clipboard.writeText(params.titleText),
                });
            }

            if (params.altText) {
                items.push({
                    icon: "iconInfo",
                    label: 'copyAlt',
                    click: () => clipboard.writeText(params.altText),
                });
            }

            if (params.linkText) {
                items.push({
                    icon: "icon-webview-anchor",
                    label: 'copyText',
                    click: () => clipboard.writeText(params.linkText),
                });
            }

            if (params.suggestedFilename) {
                items.push({
                    icon: "iconN",
                    label: 'copyFileName',
                    click: () => clipboard.writeText(params.suggestedFilename),
                });
            }

            return items;
        };

        const buildMarkdownLink = (text: string, url: string, title: string): string => {
            text = text || "🔗";
            const markdown: string[] = [];
            markdown.push("[");
            markdown.push(text.replaceAll("]", "\\]").replaceAll("\n", ""));
            markdown.push("](");
            markdown.push(url);
            if (title) {
                markdown.push(` "${title.replaceAll("\n", "").replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`);
            }
            markdown.push(")");
            return markdown.join("");
        };

        const getValidTexts = (...args: string[]): string[] => {
            return args.filter(text => !!text);
        };

        if (params.selectionText) {
            items.push({
                icon: "icon-webview-select",
                label: 'copySelectionText',
                click: () => clipboard.writeText(params.selectionText),
            });
            items.push({ type: "separator" });
        }

        switch (params.mediaType) {
            case "none":
            case "file":
            case "canvas":
            case "plugin":
            default: {
                switch (true) {
                    case !!params.linkURL: {
                        items.push(...buildOpenMenuItems(params.linkURL, title, "iconLink"));

                        items.push({ type: "separator" });

                        items.push({
                            icon: "iconLink",
                            label: 'copyLink',
                            click: () => {
                                const a = globalThis.document.createElement("a");
                                a.href = params.linkURL;
                                a.title = params.titleText;
                                a.innerText = params.linkText;
                                clipboard.writeHTML(a.outerHTML);
                            },
                        });

                        items.push({
                            icon: "iconHTML5",
                            label: 'copyLink',
                            accelerator: "HTML",
                            click: () => {
                                const a = globalThis.document.createElement("a");
                                a.href = params.linkURL;
                                a.title = params.titleText;
                                a.innerText = params.linkText;
                                clipboard.writeText(a.outerHTML);
                            },
                        });

                        items.push({
                            icon: "iconMarkdown",
                            label: 'copyLink',
                            accelerator: "Markdown",
                            click: () => {
                                const texts = getValidTexts(params.linkText, params.altText, params.suggestedFilename, params.titleText);
                                clipboard.writeText(
                                    buildMarkdownLink(
                                        texts.shift(),
                                        params.linkURL,
                                        texts.pop(),
                                    ),
                                );
                            },
                        });
                        break;
                    }
                    case !!params.frameURL: {
                        items.push(...buildOpenMenuItems(params.frameURL, title, "iconLayout"));

                        items.push({ type: "separator" });

                        items.push({
                            icon: "iconLayout",
                            label: 'copyFrame',
                            click: () => {
                                const iframe = globalThis.document.createElement("iframe");
                                iframe.src = params.frameURL;
                                iframe.title = params.titleText;
                                clipboard.writeHTML(iframe.outerHTML);
                            },
                        });

                        items.push({
                            icon: "iconHTML5",
                            label: 'copyFrame',
                            accelerator: "HTML",
                            click: () => {
                                const iframe = globalThis.document.createElement("iframe");
                                iframe.src = params.frameURL;
                                iframe.title = params.titleText;
                                clipboard.writeText(iframe.outerHTML);
                            },
                        });

                        items.push({
                            icon: "iconMarkdown",
                            label: 'copyFrame',
                            accelerator: "Markdown",
                            click: () => {
                                const texts = getValidTexts(
                                    params.linkText,
                                    params.altText,
                                    params.suggestedFilename,
                                    params.titleText,
                                );
                                clipboard.writeText(
                                    buildMarkdownLink(
                                        texts.shift(),
                                        params.frameURL,
                                        texts.pop(),
                                    ),
                                );
                            },
                        });
                        break;
                    }
                    default: {
                        items.push(...buildOpenMenuItems(params.pageURL, title, "iconFile", false));

                        items.push({ type: "separator" });

                        items.push({
                            icon: "iconFile",
                            label: 'copyPage',
                            click: () => {
                                const a = globalThis.document.createElement("a");
                                a.href = params.pageURL;
                                a.title = params.titleText;
                                clipboard.writeHTML(a.outerHTML);
                            },
                        });

                        items.push({
                            icon: "iconHTML5",
                            label: 'copyPage',
                            accelerator: "HTML",
                            click: () => {
                                const a = globalThis.document.createElement("a");
                                a.href = params.pageURL;
                                a.title = params.titleText;
                                clipboard.writeText(a.outerHTML);
                            },
                        });

                        items.push({
                            icon: "iconMarkdown",
                            label: 'copyPage',
                            accelerator: "Markdown",
                            click: () => {
                                const texts = getValidTexts(
                                    params.linkText,
                                    params.altText,
                                    params.suggestedFilename,
                                    params.titleText,
                                );
                                clipboard.writeText(
                                    buildMarkdownLink(
                                        texts.shift(),
                                        params.pageURL,
                                        texts.pop(),
                                    ),
                                );
                            },
                        });
                        break;
                    }
                }
                break;
            }

            case "image": {
                items.push(...buildOpenMenuItems(params.linkURL, title, "iconImage"));

                items.push({ type: "separator" });

                items.push({
                    icon: "iconImage",
                    label: 'copyImage',
                    click: () => {
                        const img = globalThis.document.createElement("img");
                        img.src = params.srcURL;
                        img.title = params.titleText;
                        img.alt = params.altText;
                        clipboard.writeHTML(img.outerHTML);
                    },
                });

                items.push({
                    icon: "iconHTML5",
                    label: 'copyImage',
                    accelerator: "HTML",
                    click: () => {
                        const img = globalThis.document.createElement("img");
                        img.src = params.srcURL;
                        img.title = params.titleText;
                        img.alt = params.altText;
                        clipboard.writeText(img.outerHTML);
                    },
                });

                items.push({
                    icon: "iconMarkdown",
                    label: 'copyImage',
                    accelerator: "Markdown",
                    click: () => {
                        const texts = getValidTexts(
                            params.altText,
                            params.linkText,
                            params.suggestedFilename,
                            params.titleText,
                        );
                        clipboard.writeText(
                            buildMarkdownLink(
                                texts.shift(),
                                params.srcURL,
                                texts.pop(),
                            ),
                        );
                    },
                });
                break;
            }
        }

        items.push({ type: "separator" });
        items.push(...buildCopyMenuItems(params));

        const washMenuItems = (items: siyuan.IMenu[]): siyuan.IMenu[] => {
            items = items.slice(
                items.findIndex(item => item.type !== "separator"),
                items.findLastIndex(item => item.type !== "separator") + 1,
            );

            if (items.length === 0) return items;

            items = items.filter((item, index, items) => {
                if (item.type !== "separator") return true;
                else return items[index - 1]?.type !== "separator";
            });

            return items;
        };

        const _items = washMenuItems(items);
        if (_items.length > 0) {
            menu = new siyuan.Menu('webviewContextMenu', () => cover.classList.add('fn__none'));
            _items.forEach(item => menu.addItem(item));
            menu.open({
                x: params.x,
                y: params.y,
            });
            cover.classList.remove('fn__none');
        }
    });

    // 配置 Session 以处理跨域和代理
    const electron = window?.require?.('@electron/remote');
    if (electron) {
        let session;
        
        if (context.data.proxy) {
            // 使用独立的 partition 用于代理
            session = electron.session.fromPartition(context.data.name);
            session.setProxy({
                proxyRules: context.data.proxy,
            });
        } else {
            // 使用默认 session
            session = electron.session.defaultSession;
        }

        // 配置 webRequest 拦截器以解决 CORS 问题
        if (session && session.webRequest) {
            const filter = {
                urls: ['*://*/*']
            };
            
            // 拦截响应头，添加 CORS 支持
            session.webRequest.onHeadersReceived(filter, (details, callback) => {
                const responseHeaders = details.responseHeaders || {};
                
                // 添加 CORS 头以允许跨域访问
                responseHeaders['Access-Control-Allow-Origin'] = ['*'];
                responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, PATCH, OPTIONS'];
                responseHeaders['Access-Control-Allow-Headers'] = ['*'];
                responseHeaders['Access-Control-Allow-Credentials'] = ['true'];
                
                // 移除可能导致问题的安全头
                delete responseHeaders['X-Frame-Options'];
                delete responseHeaders['Content-Security-Policy'];
                
                callback({
                    cancel: false,
                    responseHeaders: responseHeaders,
                });
            });
        }
    }

    if (context.data.script) {
        webview.addEventListener("load-commit", () => {
            const ps = webview.executeJavaScript(context.data.script);
            if (context.data.debug) {
                ps.then(console.log);
            }
        });
    }

    if (context.data.css) {
        webview.addEventListener("load-commit", () => {
            const mode = window.siyuan.config.appearance.mode === 0 ? 'light' : 'dark';
            webview.executeJavaScript(`document.getElementsByTagName('html')[0].setAttribute('siyuan-theme', '${mode}')`).then(() => {
                webview.insertCSS(`:root {
            --siyuan-mode: ${mode};
            --siyuan-theme: ${window.siyuan.config.appearance.mode === 0 ? window.siyuan.config.appearance.themeLight : window.siyuan.config.appearance.themeDark};
          }`).then(() => {
                    webview.insertCSS(context.data.css);
                });
            });
        });
    }

    if (context.data.debug) {
        webview.addEventListener("dom-ready", () => {
            webview.openDevTools();
        });
    }

    if (context.data.referer) {
        const filter = {
            urls: [context.data.url + '/*'],
        };
        window?.require?.('@electron/remote').session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
            details.requestHeaders['Referer'] = context.data.referer;
            callback({ cancel: false, requestHeaders: details.requestHeaders });
        });
    }

    return () => {
        document.removeEventListener('dragstart', onDragStart);
        document.removeEventListener('dragend', onDragStop);
        document.removeEventListener('mousedown', onResizeStart);
        document.removeEventListener('mouseup', onResizeStop);
    };
};