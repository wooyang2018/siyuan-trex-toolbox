import { thisPlugin } from "@frostime/siyuan-plugin-kits"

const rootName = 'chat-assets' as const;


export const saveImageFile = async (image: Blob, fileName: string): Promise<string> => {
    const plugin = thisPlugin();
    if (fileName.startsWith('/')) {
        fileName = fileName.slice(1);
    }
    const ext = fileName.split('.').pop();
    if (!['png', 'jpg', 'jpeg'].includes(ext)) {
        fileName += '.png';
    }

    fileName = `${rootName}/${fileName}`;
    await plugin.saveBlob(fileName, image);
    return `data/storage/petal/${thisPlugin().name}/${fileName}`;
}


export const loadImageFile = async (fileName: string): Promise<Blob> => {
    const plugin = thisPlugin();
    if (fileName.startsWith('/')) {
        fileName = fileName.slice(1);
    }
    fileName = `${rootName}/${fileName}`;
    const blob = await plugin.loadBlob(fileName);
    return blob;
}
