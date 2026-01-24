/**
 * Copyright (c) 2023 frostime. All rights reserved.
 * https://github.com/frostime/sy-plugin-template-vite
 * 
 * @description API 接口封装
 * @see API.md https://github.com/siyuan-note/siyuan/blob/master/API.md
 * @see API_zh_CN.md https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md
 */

import { fetchSyncPost, IWebSocketData } from "siyuan";

/**
 * 通用请求封装
 */
const request = async (url: string, data: any) => {
    const response: IWebSocketData = await fetchSyncPost(url, data);
    return response.code === 0 ? response.data : null;
};

/**
 * 设置块属性
 */
export const setBlockAttrs = async (id: BlockId, attrs: { [key: string]: string }) => {
    return request('/api/attr/setBlockAttrs', { id, attrs });
};

/**
 * 执行 SQL 查询
 */
export const sql = async (sql: string): Promise<any[]> => {
    return request('/api/query/sql', { stmt: sql });
};
