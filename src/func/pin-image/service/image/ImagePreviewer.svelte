<script lang="ts">
    import { writeText } from "../../libs/compatibility";
    import { openBy } from "../../libs/util";
    import { MenuItem } from "../../libs/menus/Menu";
    import { copyPNGByLink, exportAsset } from "../../libs/menus/util";
    import { isLocalPath } from "../../libs/util/pathName";
    import { isStrBlank, isStrNotBlank } from "../../utils/string-util";
    import { getFrontend } from "siyuan";
    import { onMount, onDestroy } from "svelte";
    import {
        getDistance,
        getEventPosition,
        getTouchCenterPosition,
        Vector2,
    } from "../../utils/position-util";
    import {
        changeImageKeepPosition,
        zoomImageKeepPosition,
    } from "../../service/image/ImagePreviewerService";
    import { SettingService } from "../../service/setting/SettingService";

    export let images: string[] = [];
    export let startIndex: number = 0;
    export let handleCloseClick: () => void = () => {};

    let showOptionButton;

    let currentIndex = startIndex;
    let imageMaxScale = 100;
    let imageMinWidth = 80;
    let lastImageWidth: number;
    let lastImageCustomWidth: number;

    let containerAngle = 0;

    let position: Vector2 = { x: 0, y: 0 };
    let positionLimit = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

    let isDragging = false;
    let dragStartPos: Vector2 = { x: 0, y: 0 };
    let containerStart: Vector2 = { x: 0, y: 0 };

    let containerElementRef: HTMLElement;
    let imageElementRef: HTMLImageElement;

    onMount(() => {
        imageElementRef.src = images[currentIndex];
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleWindowMouseUp);
        window.addEventListener("touchmove", handleTouchMove);
        window.addEventListener("touchend", handleTouchEnd);
        containerElementRef.addEventListener("keydown", handleKeydown);

        containerElementRef.focus();
        showOptionButton = SettingService.ins.SettingConfig.showOptionButton;

        updateImgNetSvg();
        setInitialImageWidthAndPosition();
    });

    onDestroy(() => {
        window.removeEventListener("mouseup", handleWindowMouseUp);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("touchmove", handleTouchMove);
        window.removeEventListener("touchend", handleTouchEnd);
        containerElementRef.removeEventListener("keydown", handleKeydown);
    });

    function handleImageContainerWheel(event: WheelEvent) {
        // 计算滚动的缩放量
        const delta = event.deltaY;

        if (event.ctrlKey) {
            position.y = position.y - delta * 0.5;
        }
        if (event.shiftKey) {
            position.x = position.x + delta * 0.5;
        }
        if (event.ctrlKey || event.shiftKey) {
            updatePositionLimit();
            checkPositionLimit();
            return;
        }
        zoomImage(-delta, { x: event.clientX, y: event.clientY });
    }

    function zoomImage(scaleFactor: number, zoomPosition: Vector2) {
        let oldContainerRect = containerElementRef.getBoundingClientRect();

        // 获取图片容器当前宽度
        let containerWidthNum = getImageWidth();

        let maxWidth = imageElementRef.naturalWidth * imageMaxScale;

        // 设置缩放步长，根据滚动的速度调整步长
        const widthAmount = scaleFactor * 0.3;

        const newWidth = Math.min(
            maxWidth,
            Math.max(containerWidthNum + widthAmount, imageMinWidth),
        );

        // 设置容器的新宽度
        updateImageWidth(newWidth);

        position = zoomImageKeepPosition(
            oldContainerRect,
            containerElementRef.getBoundingClientRect(),
            zoomPosition,
        );

        // 可以根据新的宽度，更新位置限制等其他逻辑
        updatePositionLimit();
        checkPositionLimit();
    }

    function updateImageWidth(widthNum: number) {
        if (widthNum) {
            imageElementRef.style.width = widthNum + "px";
        } else {
            imageElementRef.style.width = "";
        }
    }

    function handleMouseDown(event: MouseEvent) {
        if (event.button == 0) {
            const pos = getEventPosition(event);
            startImageDrag(pos);
            doubleClickImage(pos);
        }
    }
    let isZoomIn = false;

    /**
     * 手机端放大缩小
     */
    let touchStartDistance = 0;

    let touchStartCenterPosition: Vector2;

    let longPressTimeout;
    const longPressDuration = 350; // ms，长按阈值

    function handleTouchStart(event: TouchEvent) {
        window.siyuan.menus.menu.remove();

        // 双指是照片缩放
        if (event instanceof TouchEvent && event.touches.length === 2) {
            event.preventDefault(); // 防止页面缩放
            event.stopPropagation();
            isZoomIn = true;

            touchStartDistance = getDistance(event.touches);
            touchStartCenterPosition = getTouchCenterPosition(event.touches);
            clearTimeout(longPressTimeout);
            return;
        }
        // 单指开始移动
        if (
            event.touches.length === 1 &&
            event.currentTarget == containerElementRef
        ) {
            event.preventDefault();
            event.stopPropagation();
            const pos = getEventPosition(event);
            startImageDrag(pos);
            doubleClickImage(pos);

            longPressTimeout = setTimeout(() => {
                stopImageDrag();
                let pos = getEventPosition(event);
                imageContextmenuEvent(pos);
            }, longPressDuration);
        }
    }

    function handleTouchMove(event: TouchEvent) {
        if (isZoomIn) {
            event.preventDefault();
            event.stopPropagation();
            window.siyuan.menus.menu.remove();
            clearTimeout(longPressTimeout);
            lastTapTime = 0;
            const currentDistance = getDistance(event.touches);
            let scaleChange = (currentDistance / touchStartDistance) * 4.5;
            if (currentDistance < touchStartDistance) {
                scaleChange = -scaleChange * 2.5;
            }
            zoomImage(scaleChange, touchStartCenterPosition);
            return;
        }
        if (isDragging) {
            event.preventDefault();
            event.stopPropagation();
            clearTimeout(longPressTimeout);
            window.siyuan.menus.menu.remove();
            const pos = getEventPosition(event);
            moveImageDrag(pos);
        }
    }

    function handleTouchEnd(event: TouchEvent) {
        if (event.touches.length < 2) {
            // 双指操作结束
            isZoomIn = false;
            touchStartDistance = 0;
        }
        stopImageDrag();

        clearTimeout(longPressTimeout);
    }

    function doubleClickImage(pos: Vector2) {
        const currentTime = new Date().getTime();
        const timeDiff = currentTime - lastTapTime;

        if (timeDiff < DOUBLE_TAP_THRESHOLD && timeDiff > 0 && !isZoomIn) {
            let oldContainerRect = containerElementRef.getBoundingClientRect();
            let oldImageWidth = getImageWidth();

            let defWidth = Math.min(
                imageElementRef.naturalWidth,
                window.innerWidth * 0.9,
            );
            if (oldImageWidth != defWidth) {
                lastImageCustomWidth = oldImageWidth;
                updateImageWidth(defWidth);
            } else if (lastImageCustomWidth) {
                if (lastImageCustomWidth > imageElementRef.naturalWidth) {
                    lastImageCustomWidth = imageElementRef.naturalWidth;
                }
                updateImageWidth(lastImageCustomWidth);

                lastImageCustomWidth = null;
            }
            position = zoomImageKeepPosition(
                oldContainerRect,
                containerElementRef.getBoundingClientRect(),
                pos,
            );
            updatePositionLimit();
            checkPositionLimit();
        }

        lastTapTime = currentTime;
    }

    function handleMouseMove(event: MouseEvent) {
        const pos = getEventPosition(event);
        moveImageDrag(pos);
    }

    function handleWindowMouseUp() {
        stopImageDrag();
    }

    function startImageDrag(pos: Vector2) {
        isDragging = true;
        updatePositionLimit();
        dragStartPos = pos;
        containerStart = { ...position };
    }

    function moveImageDrag(pos: Vector2) {
        if (!isDragging) return;

        const dx = pos.x - dragStartPos.x;
        const dy = pos.y - dragStartPos.y;
        let newX = containerStart.x + dx;
        let newY = containerStart.y + dy;

        position = {
            x: newX,
            y: newY,
        };
        checkPositionLimit();
    }

    function stopImageDrag() {
        isDragging = false;
    }

    let lastTapTime = 0;
    const DOUBLE_TAP_THRESHOLD = 300; // 毫秒，双击间隔上限

    function handleContextmenu(event: MouseEvent) {
        event.preventDefault();

        let pos = getEventPosition(event);

        imageContextmenuEvent(pos);
    }

    function updatePositionLimit() {
        // 限制拖拽范围，确保图片不会拖到父容器外面
        const containerRect = containerElementRef.getBoundingClientRect();

        let minDef = 90;

        let minX = -containerRect.width + minDef;
        let maxX = window.innerWidth - minDef;
        let minY = -containerRect.height + minDef;
        let maxY = window.innerHeight - minDef;

        positionLimit = { minX, maxX, minY, maxY };
    }

    function checkPositionLimit() {
        let minX = positionLimit.minX;
        let maxX = positionLimit.maxX;
        let minY = positionLimit.minY;
        let maxY = positionLimit.maxY;

        let newX = Math.min(maxX, Math.max(position.x, minX));
        let newY = Math.min(maxY, Math.max(position.y, minY));

        if (position.x != newX || position.y != newY) {
            position = {
                x: newX,
                y: newY,
            };
        }
    }

    function handleNextBtnClick() {
        currentIndex++;
        if (currentIndex > images.length - 1) {
            currentIndex = currentIndex % images.length;
        }
        updateImageSrcAndPosition();
    }

    function handlePrevBtnClick() {
        currentIndex--;
        if (currentIndex < 0) {
            currentIndex = images.length + currentIndex;
        }
        updateImageSrcAndPosition();
    }

    function updateImageSrcAndPosition() {
        const oldContainerRect = containerElementRef.getBoundingClientRect();
        lastImageWidth = getImageWidth();
        containerAngle = 0;

        // 使用 once: true 确保事件处理器只执行一次
        imageElementRef.addEventListener(
            "load",
            () => {
                const imgNaturalWidth = imageElementRef.naturalWidth;
                const maxWidth = window.innerWidth * 0.9;
                let newWidth: number | null = null;

                if (isStrBlank(imageElementRef.style.width)) {
                    newWidth = imgNaturalWidth > maxWidth ? maxWidth : null;
                } else if (lastImageWidth) {
                    if (imgNaturalWidth < lastImageWidth) {
                        newWidth = null; // 更小则恢复自然宽度
                    } else if (imgNaturalWidth > lastImageWidth) {
                        newWidth = lastImageWidth; // 更大则维持之前设置的宽度
                    }
                }

                updateImageWidth(newWidth);
                position = changeImageKeepPosition(
                    oldContainerRect,
                    containerElementRef.getBoundingClientRect(),
                    position,
                );
                updatePositionLimit();
                checkPositionLimit();
            },
            { once: true },
        );
        imageElementRef.src = images[currentIndex];
    }

    function updateImgNetSvg() {
        let imgNetElement = containerElementRef.querySelector(".img__net");
        if (isLocalPath(images[currentIndex])) {
            imgNetElement?.classList.add("fn__none");
        } else {
            imgNetElement?.classList.remove("fn__none");
        }
    }
    function centerImageInWindow() {
        const newContainerRect = containerElementRef.getBoundingClientRect();

        const prevCenterX = window.innerWidth / 2;
        const prevCenterY = window.innerHeight / 2;
        const newCenterX = newContainerRect.width / 2;
        const newCenterY = newContainerRect.height / 2;
        // 计算新图片的 translate 值，使其中心对齐前一张图片的中心
        const translateX = prevCenterX - newCenterX;
        const translateY = prevCenterY - newCenterY;

        position = { x: translateX, y: translateY };
    }

    function alignImageTopToWindow() {
        position = { x: position.x, y: 0 };
    }
    function alignImageBottomToWindow() {
        let newY =
            window.innerHeight -
            containerElementRef.getBoundingClientRect().height;
        position = { x: position.x, y: newY };
    }
    function alignImageLeftToWindow() {
        position = { x: 0, y: position.y };
    }
    function alignImageRightToWindow() {
        let newX =
            window.innerWidth -
            containerElementRef.getBoundingClientRect().width;
        position = { x: newX, y: position.y };
    }

    function setInitialImageWidthAndPosition() {
        let maxWidth = window.innerWidth * 0.9;
        let maxHeight = window.innerHeight;
        if (imageElementRef.naturalHeight > maxHeight) {
            maxWidth = Math.min(
                (imageElementRef.naturalWidth / imageElementRef.naturalHeight) *
                    maxHeight,
                maxWidth,
            );
        }
        maxWidth = Math.max(maxWidth, imageMinWidth);

        if (imageElementRef.naturalWidth > maxWidth) {
            updateImageWidth(maxWidth);
        }

        // 获取图片的自然尺寸和当前尺寸
        const imgWidth = containerElementRef.offsetWidth;
        const imgHeight = containerElementRef.offsetHeight;

        // 获取窗口的尺寸
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        // 计算居中偏移量
        let positionX = (windowWidth - imgWidth) / 2;
        let positionY = (windowHeight - imgHeight) / 2;
        if (imgHeight > windowHeight) {
            positionY = 10;
        }

        position = { x: positionX, y: positionY };
    }

    function handleKeydown(e: KeyboardEvent) {
        e.stopPropagation();
        if (e.key === "Escape") {
            handleCloseClick();
        } else if (
            e.key === "ArrowLeft" ||
            e.key.toLocaleLowerCase() === "a" ||
            e.key.toLocaleLowerCase() === "w"
        ) {
            handlePrevBtnClick();
        } else if (
            e.key === "ArrowRight" ||
            e.key.toLocaleLowerCase() === "d" ||
            e.key.toLocaleLowerCase() === "s"
        ) {
            handleNextBtnClick();
        } else if (
            e.ctrlKey &&
            e.shiftKey &&
            e.key.toLocaleLowerCase() === "c"
        ) {
            copyPNGByLink(imageElementRef.getAttribute("src"));
        } else if (e.ctrlKey && e.key.toLocaleLowerCase() === "c") {
            writeText(`![](${imageElementRef.getAttribute("src")})`);
        }
    }

    function getImageWidth(): number {
        // 获取图片的当前宽度
        let containerWidth = imageElementRef.style.width;
        let containerWidthNum = 0;
        if (isStrNotBlank(containerWidth) && containerWidth.indexOf("px")) {
            containerWidthNum = Number(containerWidth.replace("px", ""));
        } else {
            containerWidthNum =
                containerElementRef.getBoundingClientRect().width;
        }
        return containerWidthNum;
    }

    async function imageContextmenuEvent(pos: Vector2) {
        let imageSrc = imageElementRef.getAttribute("src");
        window.siyuan.menus.menu.remove();

        window.siyuan.menus.menu.append(
            new MenuItem({
                label: "上一张",
                click: () => {
                    handlePrevBtnClick();
                },
            }).element,
        );
        window.siyuan.menus.menu.append(
            new MenuItem({
                label: "下一张",
                click: () => {
                    handleNextBtnClick();
                },
            }).element,
        );
        window.siyuan.menus.menu.append(
            new MenuItem({
                label: "关闭图片",
                click: () => {
                    handleCloseClick();
                },
            }).element,
        );
        window.siyuan.menus.menu.append(
            new MenuItem({
                type: "separator",
            }).element,
        );
        // 旋转
        // window.siyuan.menus.menu.append(
        //     new MenuItem({
        //         label: "顺时针旋转90°",
        //         click: () => {
        //             containerAngle += 90;
        //             containerAngle %= 360;
        //         },
        //     }).element,
        // );
        // window.siyuan.menus.menu.append(
        //     new MenuItem({
        //         label: "逆时针旋转90°",
        //         click: () => {
        //             containerAngle -= 90;
        //             containerAngle %= 360;
        //         },
        //     }).element,
        // );
        // window.siyuan.menus.menu.append(
        //     new MenuItem({
        //         type: "separator",
        //     }).element,
        // );

        window.siyuan.menus.menu.append(
            new MenuItem({
                label: "图片对齐",
                type: "submenu",
                submenu: [
                    new MenuItem({
                        label: "居中",
                        click: () => {
                            centerImageInWindow();
                        },
                    }),

                    new MenuItem({
                        label: "顶部对齐",
                        click: () => {
                            alignImageTopToWindow();
                        },
                    }),
                    new MenuItem({
                        label: "底部对齐",
                        click: () => {
                            alignImageBottomToWindow();
                        },
                    }),
                    new MenuItem({
                        label: "左边对齐",
                        click: () => {
                            alignImageLeftToWindow();
                        },
                    }),
                    new MenuItem({
                        label: "右边对齐",
                        click: () => {
                            alignImageRightToWindow();
                        },
                    }),
                    new MenuItem({
                        label: "恢复默认宽度",
                        click: () => {
                            setInitialImageWidthAndPosition();
                        },
                    }),
                    new MenuItem({
                        label: "初始化大小和位置",
                        click: () => {
                            setInitialImageWidthAndPosition();
                        },
                    }),
                ],
            }).element,
        );
        window.siyuan.menus.menu.append(
            new MenuItem({
                type: "separator",
            }).element,
        );

        // 复制 Markdown 格式
        window.siyuan.menus.menu.append(
            new MenuItem({
                label: "复制",
                click: () => {
                    writeText(`![](${imageElementRef.getAttribute("src")})`);
                },
            }).element,
        );
        // 复制 图片地址
        window.siyuan.menus.menu.append(
            new MenuItem({
                label:
                    window.siyuan.languages.copy +
                    " " +
                    window.siyuan.languages.imageURL,
                click: () => {
                    writeText(imageElementRef.getAttribute("src"));
                },
            }).element,
        );
        // 复制为 PNG
        window.siyuan.menus.menu.append(
            new MenuItem({
                label: window.siyuan.languages.copyAsPNG,
                click: () => {
                    copyPNGByLink(imageElementRef.getAttribute("src"));
                },
            }).element,
        );

        window.siyuan.menus.menu.append(
            new MenuItem({
                type: "separator",
            }).element,
        );

        let frontend = getFrontend();

        if (
            isLocalPath(imageSrc) &&
            (frontend == "desktop" || frontend == "desktop-window")
        ) {
            window.siyuan.menus.menu.append(
                new MenuItem({
                    label: "打开文件位置",
                    click: () => {
                        openBy(imageSrc, "folder");
                    },
                }).element,
            );

            window.siyuan.menus.menu.append(
                new MenuItem({
                    id: "useDefault",
                    label: window.siyuan.languages.useDefault,
                    click() {
                        openBy(imageSrc, "app");
                    },
                }).element,
            );
        }

        // 导出
        window.siyuan.menus.menu.append(
            new MenuItem({
                label: window.siyuan.languages.export,
                icon: "iconUpload",
                click: () => {
                    exportAsset(imageSrc);
                },
            }).element,
        );

        window.siyuan.menus.menu.append(
            new MenuItem({
                type: "separator",
            }).element,
        );
        // 显示/隐藏按钮
        window.siyuan.menus.menu.append(
            new MenuItem({
                label: "显示/隐藏按钮",
                click: () => {
                    showOptionButton = !showOptionButton;
                },
            }).element,
        );

        window.siyuan.menus.menu.popup({ x: pos.x, y: pos.y });
        window.siyuan.menus.menu.element.style.zIndex = 999999;
    }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<!-- svelte-ignore a11y-img-redundant-alt -->
<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<!-- <div class="image-preview-container" bind:this={containerRef}> -->
<!-- svelte-ignore missing-declaration -->
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- transform:rotate({containerAngle}deg) ; -->
<div
    tabindex="0"
    bind:this={containerElementRef}
    class="image-wrapper"
    style="transform:rotate({containerAngle}deg) ;left: {position.x}px;top: {position.y}px; pointer-events: auto;user-select:none;display: inline-block; "
    on:wheel|passive={handleImageContainerWheel}
    on:mousemove={handleMouseMove}
    on:mousedown={handleMouseDown}
    on:touchstart={handleTouchStart}
    on:touchmove|stopPropagation|preventDefault={handleTouchMove}
    on:touchend|stopPropagation|preventDefault={handleTouchEnd}
    on:contextmenu|stopPropagation={handleContextmenu}
>
    <img
        style="user-select:none;max-width: none !important; min-width: 74px;min-height: 80px;"
        bind:this={imageElementRef}
        class="image"
        src=""
        alt="Image"
        draggable={false}
        tabindex="0"
    />
    <span class="img__net"
        ><svg><use xlink:href="#iconLanguage"></use></svg></span
    >
    {#if showOptionButton}
        <div
            class="nav-buttons nav-close"
            style="user-select:none;"
            contenteditable="false"
        >
            <button
                style="user-select:none;"
                contenteditable="false"
                on:click|stopPropagation={handleCloseClick}
                on:pointerdown|stopPropagation
                on:dblclick|stopPropagation
                on:mousedown|stopPropagation
                on:mouseup|stopPropagation
                on:touchstart|stopPropagation
                on:touchmove|stopPropagation
                on:touchend|stopPropagation
                ><svg><use xlink:href="#iconClose"></use></svg></button
            >
        </div>
        <div
            class="nav-buttons nav-page"
            style="user-select:none;"
            contenteditable="false"
        >
            <button
                style="user-select:none;"
                contenteditable="false"
                on:click|stopPropagation={handlePrevBtnClick}
                on:pointerdown|stopPropagation
                on:dblclick|stopPropagation
                on:mousedown|stopPropagation
                on:mouseup|stopPropagation
                on:touchstart|stopPropagation
                on:touchmove|stopPropagation
                on:touchend|stopPropagation
                ><svg><use xlink:href="#iconBack"></use></svg></button
            >
            <button
                style="user-select:none;"
                contenteditable="false"
                on:click|stopPropagation={handleNextBtnClick}
                on:pointerdown|stopPropagation
                on:dblclick|stopPropagation
                on:mousedown|stopPropagation
                on:mouseup|stopPropagation
                on:touchstart|stopPropagation
                on:touchmove|stopPropagation
                on:touchend|stopPropagation
                ><svg><use xlink:href="#iconForward"></use></svg></button
            >
        </div>
    {/if}
    <div class="footer" contenteditable="false" style="user-select:none;">
        {currentIndex + 1} / {images.length}
    </div>
</div>

<style>
    .image-wrapper {
        position: relative;
        overflow: hidden;
        cursor: grab;
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3); /* 高亮的悬浮阴影 */
        transition: box-shadow 0.1s ease;
    }
    /* 容器悬浮时的阴影效果（焦点时阴影略微加深） */
    .image-wrapper:hover,
    .image-wrapper:focus {
        box-shadow: 0 8px 16px rgba(3, 185, 226, 0.3); /* 高亮的悬浮阴影 */
    }

    .image {
        transition: transform 0.1s ease-out;
        transform-origin: center center;
        will-change: transform;
    }

    .img__net {
        position: absolute;
        top: 4px;
        left: 4px;
        color: var(--b3-theme-primary);
        background-color: var(--b3-theme-surface-lighter);
        padding: 4px;
        border-radius: var(--b3-border-radius);
    }
    svg {
        fill: currentColor;
        display: inline-block;
        height: 12px;
        width: 12px;
    }

    .nav-buttons {
        position: absolute;
        display: flex;

        width: 100%;
        pointer-events: none;
        opacity: 0.5;
    }

    .nav-buttons.nav-close {
        justify-content: flex-end;
        top: 1.5%;
        right: 0.2%;
    }

    .nav-buttons.nav-page {
        justify-content: space-between;
        top: 50%;
    }

    .nav-buttons:hover {
        opacity: 1;
    }
    .nav-buttons button,
    .nav-buttons button {
        pointer-events: all;
        background: #ffffff80;
        border-radius: 50%;
        margin: 0 5px;
        box-shadow: 0 0 10px #0000004d;
        cursor: pointer;
        border: 2px solid transparent;
    }

    .nav-buttons button:hover {
        background: rgba(255, 255, 255, 0.8);
        box-shadow: 0 0 15px rgba(0, 0, 0, 0.5);
    }
    button svg {
        color: var(--b3-theme-on-surface-light);
    }

    .footer {
        position: absolute;
        bottom: 8px;
        color: #fff;
        font-size: 13px;
        background: #000000b3;
        padding: 3px 5px;
        border-radius: 10px;
        box-shadow: 0 0 6px #00000080;
    }
</style>
