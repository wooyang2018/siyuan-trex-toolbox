import { fetchSyncPost, IWebSocketData } from "siyuan";

async function request(url: string, data: any) {
    let response: IWebSocketData = await fetchSyncPost(url, data);
    let res = response.code === 0 ? response.data : null;
    if (response.code != 0) {
        console.log(`图片悬浮预览插件接口异常 url : ${url} , msg : ${response.msg}`)
    }
    return res;
}

export async function lsNotebooks(): Promise<IReslsNotebooks> {
    let url = '/api/notebook/lsNotebooks';
    return request(url, '');
}

export async function getNotebookMapByApi(): Promise<Map<string, Notebook>> {
    let notebooks: Notebook[] = (await lsNotebooks()).notebooks;
    return getNotebookMap(notebooks,);
}

export function getNotebookMap(notebooks: Notebook[]): Map<string, Notebook> {
    let notebookMap: Map<string, Notebook> = new Map();
    if (!notebooks) {
        return notebookMap;
    }
    for (const notebook of notebooks) {
        notebookMap.set(notebook.id, notebook);
    }
    return notebookMap;
}

export async function getDocImageAssets(id: string): Promise<string[]> {
    let data = {
        id: id,
    };
    let url = 'api/asset/getDocImageAssets';
    return request(url, data);
}