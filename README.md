# SeatLink · 学校样式与偏好找座

此版本位于 **compact-preferences-ui** 分支，包含学校样式、偏好找座及 C200 东区预约回放。GitHub Pages 从此分支根目录发布，`main` 保留原基础版。

**[打开最新版在线演示](https://xinranxu0830-boop.github.io/seatlink/)**。右上角「场景演示」可进入四个合成演示或「东区预约回放」。

- 根目录：已构建的静态网页，可用任意静态服务器预览。
- `source/`：React + Vite 源码、测试和模拟数据说明。
- 学校样式：蓝色标题栏、浅蓝区域栏、白底时间选项、黄绿座位图、场馆首页与底部导航。
- 保留 ⋯ 偏好图标菜单、列表／地图、预约详情、拼座与续座；默认显示座位图。
- 「东区预约回放」以 2026-10-29 的 317 条预约、108 个记录内座位作为固定的已有排期，提供新增 80 / 100 / 150 / 200 条模拟请求四档。比较只为新增请求分配剩余空位时，各策略的接纳量、完整覆盖、新增分钟和总预约利用率。复现方式见 [东区预约回放](source/README.md#c200-东区预约回放)。
- [模拟情况](source/docs/simulated-preferences.md)：显示屏、光线、隔板、空调、通道、附近人数均为合成数据。
- 环境偏好只用于单座推荐；拼座与续座保留原时间算法。

## 开发

```sh
git clone --branch compact-preferences-ui --single-branch https://github.com/xinranxu0830-boop/seatlink.git
cd seatlink/source
npm ci
npm run dev -- --port 5175
```

打开 http://127.0.0.1:5175/ 。

```sh
npm test
npm run build
# 开发服务运行时，用本机 Google Chrome 检查交互：
npm run test:ui
```

详见 [源码 README](source/README.md)。后续修改源码后在 source/ 运行构建，产物在 source/dist/；更新本分支根目录产物即可发布。不要向 main 推送；后续改动建议先在新分支完成，再通过 PR 合并到本分支。

GitHub 分支地址用于查看源码，在线演示请使用上方链接。原始 Excel、姓名、学工号及逐条预约表不随网页发布。页面内置四档四组汇总与字母座位示例，也可在「导入其他汇总」中读取本机生成的 `c200-incremental.json`，导入文件不会上传。回放预约利用率不代表实测在座率。
