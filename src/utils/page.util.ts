import type { PageQuery } from "@schemas/page.type";

export async function paginate<T>(
    items: T[],
    pageQuery: PageQuery,
) {
    // 确保页码和页面大小有效
    const page = Math.max(1, pageQuery.pageNum || 1);
    const pageSize = Math.max(1, Math.min(pageQuery.pageSize || 10, 100)); // 限制最大每页100条

    const rawData = [...items]

    // // 应用过滤条件
    // const filteredData = filter ? rawData.filter(filter) : rawData;

    // // 应用排序
    // if (pageQuery.sortBy) {
    //     filteredData.sort((a, b) => {
    //         const aValue = (a as any)[pageQuery.sortBy!];
    //         const bValue = (b as any)[pageQuery.sortBy!];

    //         if (aValue < bValue) return pageQuery.sortOrder === 'desc' ? 1 : -1;
    //         if (aValue > bValue) return pageQuery.sortOrder === 'desc' ? -1 : 1;
    //         return 0;
    //     });
    // }

    // 计算分页数据
    const total = rawData.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, pages); // 确保不超过总页数

    // 计算切片位置
    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, total);

    // 获取当前页数据
    const pageData = rawData.slice(start, end);

    // 构造返回结果
    return {
        result: pageData,
        total,
        pageNum: currentPage,
        pageSize,
        pages,
        // hasNext: currentPage < pages,
        // hasPrev: currentPage > 1
    };
}